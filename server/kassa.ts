"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { isAdminRole, isSeniorRole } from "@/lib/permissions";
import { companyScopeWhere, assertCompanyPermission } from "@/lib/access";

// Ofis kassasi va xarajatlari FIRMAGA bog'lanmagan (KassaEntry.companyId
// ixtiyoriy, Expense'da umuman yo'q) — shuning uchun portfel filtri bu yerda
// ma'noga ega emas va chegara ROL ro'yxati bo'lib qoladi. Nazoratchi bu
// ro'yxatda YO'Q: u moliya roli emas, lekin ilgari `isSeniorRole` orqali butun
// ofis xarajatlarini ko'rardi.

import { canApproveExpense } from "@/lib/expenseApproval";
import { assertSufficientFunds } from "@/lib/balance";
import { serializable } from "@/lib/tx";
import { assertPeriodOpen } from "@/lib/periodLock";
import { ACCOUNTS, postLedger, reverseLedger } from "@/lib/ledger";
import { assertFundingSource } from "@/server/fundingSources";
import { isFinanceRole } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/auditTrail";
import { serialize } from "@/lib/serialize";
import { periodKeyOf } from "@/lib/periods";

// Summa har doim musbat son bo'lishi kerak — manfiy/NaN qiymat balans
// agregatlarini (lib/balance.ts) buzadi, shuning uchun serverda qat'iy tekshiriladi.
function assertPositiveAmount(amount: number, label = "Summa") {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${label} musbat son bo'lishi kerak`);
  }
}

export async function getKassaEntries(filters?: {
  type?: string;
  category?: string;
  from?: Date;
  to?: Date;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!["super_admin", "admin", "chief_accountant", "bank_manager"].includes(role)) {
    throw new Error("Forbidden");
  }

  return serialize(
    await prisma.kassaEntry.findMany({
      where: {
        deletedAt: null,
        ...(filters?.type ? { type: filters.type } : {}),
        ...(filters?.category ? { category: filters.category } : {}),
        ...(filters?.from || filters?.to
          ? {
              date: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
      },
      include: {
        user: { select: { id: true, fullName: true } },
      },
      orderBy: { date: "desc" },
    })
  );
}

/**
 * Oylik OPERATSION XARAJAT emas — u `Payout` qatlamidan chiqadi.
 *
 * Qoida `lib/cashGate.ts` dagi bilan bir xil, lekin UI yo'lida QAT'IYROQ:
 * bu yerda `SALARY_EXPENSE` ga yozish imkoni umuman berilmaydi, chunki
 * ekrandan oylik kiritish `/payroll` orqali bo'lishi kerak. Tranzit backfilli
 * (kartadan berilgan mehnat haqi) darvoza orqali o'tadi va u yerda ruxsat bor.
 */
function assertNotSalary(type: string, category: string) {
  if (
    type === "expense" &&
    /oylik|ish\s*haqi|mehnat\s*haqi|maosh|zarplata|зарплат|ойлик|иш\s*хак/i.test(category)
  ) {
    throw new Error(
      "Oylik kassa chiqimi sifatida yozilmaydi — u ikki marta hisobga kirardi. " +
        "Oylik to'lovi \"Oylik\" bo'limi (/payroll) orqali beriladi."
    );
  }
}

/** Tasdiqlangan kassa yozuvining ikki tomonlama izi. */
async function postExpenseLegs(
  tx: Prisma.TransactionClient,
  row: { id: string; amount: Prisma.Decimal | number; category: string; date: Date; channelId: string | null; type: string },
  userId: string
) {
  const amount = Number(row.amount);
  await postLedger(tx, {
    legs:
      row.type === "income"
        ? [
            { accountId: ACCOUNTS.CASH, debit: amount, channelId: row.channelId },
            { accountId: ACCOUNTS.KASSA_INCOME, credit: amount },
          ]
        : [
            { accountId: ACCOUNTS.OPERATING_EXPENSE, debit: amount },
            { accountId: ACCOUNTS.CASH, credit: amount, channelId: row.channelId },
          ],
    period: periodKeyOf(row.date),
    sourceTable: "KassaEntry",
    sourceId: row.id,
    createdBy: userId,
    description: `Kassa ${row.type === "income" ? "kirim" : "chiqim"}: ${row.category}`,
  });
}

/**
 * Kassa kirimi/chiqimi — YAGONA yozuv yo'li.
 *
 * Chiqimda tasdiq oqimi ishlaydi (`lib/expenseApproval.ts` chegaralari):
 * <1 mln avto-tasdiq, undan yuqorisi `pending` bo'lib navbatga tushadi.
 * JURNALGA faqat TASDIQLANGAN yozuv tushadi — `pending` da pul hali
 * chiqmagan, shuning uchun uni balansdan ayirish noto'g'ri bo'lardi.
 */
export async function createKassaEntry(data: {
  type: string;
  category: string;
  amount: number;
  description?: string;
  date: Date;
  companyId?: string;
  /** Pul qaysi manbaga kirdi / qaysi manbadan chiqdi. */
  channelId?: string;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  const userId = session.user.id as string;
  if (!isFinanceRole(role)) throw new Error("Forbidden");

  if (data.type !== "income" && data.type !== "expense") {
    throw new Error("Kassa turi noto'g'ri: 'income' yoki 'expense' bo'lishi kerak");
  }
  assertNotSalary(data.type, data.category);
  assertPositiveAmount(data.amount);
  if (data.channelId) await assertFundingSource(data.channelId);

  // Kirim har doim yakuniy; chiqimda chegara qaraladi.
  const autoApprove = data.type === "income" || data.amount < 1_000_000;

  const created = await serializable(async (tx) => {
    await assertPeriodOpen(tx, data.date, "kassa yozuvi");

    // Chiqim mavjud balansdan oshmasligi kerak. Tekshiruv YOZUV BILAN BIR
    // TRANZAKSIYADA — aks holda ikki parallel chiqim bir xil balansni ko'rib
    // ikkalasi ham o'tib ketardi.
    if (data.type === "expense" && autoApprove) {
      await assertSufficientFunds({
        amount: data.amount, role, userId, context: "expense", db: tx,
      });
    }
    // MAYDONLAR ANIQ SANALADI, `...data` EMAS.
    //
    // Bu server action — mijoz yuborgan obyekt RUNTIME da butunligicha
    // keladi va TypeScript tipi uni kesib tashlamaydi (tip faqat
    // kompilyatsiya vaqtida yashaydi). `/expenses` formasi hali eski
    // `paymentMethod` maydonini yuborardi; u `KassaEntry` da yo'q, va
    // spread uni to'g'ridan-to'g'ri Prisma'ga uzatib "Unknown argument
    // `paymentMethod`" bilan har bir xarajat kiritishni yiqitardi.
    //
    // Sanab yozish bu sinfdagi xatoni butunlay yopadi: jadvalda bo'lmagan
    // maydon bu yerdan o'tolmaydi, mijoz nima yuborishidan qat'i nazar.
    const row = await tx.kassaEntry.create({
      data: {
        type: data.type,
        category: data.category,
        amount: data.amount,
        description: data.description ?? null,
        date: data.date,
        companyId: data.companyId ?? null,
        channelId: data.channelId ?? null,
        createdBy: userId,
        status: autoApprove ? "approved" : "pending",
        ...(autoApprove ? { approvedBy: userId, approvedAt: new Date() } : {}),
      },
    });
    if (autoApprove) await postExpenseLegs(tx, row, userId);
    return row;
  });

  await recordAuditLog({
    userId,
    action: "create",
    tableName: "KassaEntry",
    recordId: created.id,
    newData: { type: data.type, category: data.category, amount: data.amount, status: created.status },
  });

  return serialize(created);
}

// Soft delete — jismoniy o'chirish yo'q: yozuv belgilanadi, ledger izi
// reversal bilan nolga tushadi, audit oldData saqlaydi.
export async function deleteKassaEntry(id: string, reason?: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isAdminRole(role)) throw new Error("Forbidden");

  const existing = await prisma.kassaEntry.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw new Error("Kassa yozuvi topilmadi");

  await assertPeriodOpen(prisma, existing.date, "kassa yozuvi");

  const deleted = await prisma.$transaction(async (tx) => {
    const row = await tx.kassaEntry.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: session.user.id, deleteReason: reason?.trim() || null },
    });
    await reverseLedger(tx, {
      sourceTable: "KassaEntry",
      sourceId: id,
      createdBy: session.user.id,
      reason: reason?.trim() || "kassa yozuvi o'chirildi",
    });
    return row;
  });

  await recordAuditLog({
    userId: session.user.id,
    action: "delete",
    tableName: "KassaEntry",
    recordId: id,
    oldData: { type: existing.type, category: existing.category, amount: Number(existing.amount), date: existing.date.toISOString() },
    newData: { deleteReason: reason?.trim() || null },
  });

  return serialize(deleted);
}

// =====================================================
// XARAJATLAR — `KassaEntry(expense)` ustida
// =====================================================
//
// ILGARI ALOHIDA `Expense` JADVALI BOR EDI. Ikkala jadval ham bitta savolga
// javob berardi ("pul chiqdi"), lekin `Expense` da tasdiq oqimi bor edi,
// `KassaEntry` da yo'q. Natijada olti modulda ikkita shox olib yurilardi
// (`lib/balance.ts`, `lib/monthClose.ts`, `lib/reconciliation.ts`,
// `scripts/backfill-ledger.ts`, `lib/cashGate.ts`, shu fayl), holbuki prodda
// `Expense` da atigi 3 ta `pending` qator va NOLTA tasdiqlangan qator bor edi.
//
// Endi tasdiq oqimi `KassaEntry` ning o'zida (`status`/`approvedBy`/
// `approvedAt`/`rejectedReason`) va jadval BITTA. `/expenses` ekrani
// o'zgarmadi — u faqat props va callback ishlatadi, quyidagi funksiyalar esa
// endi `KassaEntry` bilan gaplashadi.
//
// `paymentMethod` OLIB TASHLANDI: `channelId` uni to'liq almashtiradi va
// undan boyroq ("qaysi schyot/karta", nafaqat "naqdmi yoki plastikmi").
// Ikkalasini saqlash aynan biz yo'q qilayotgan takroriylik bo'lardi.

/** Xarajat ro'yxati — `/expenses` ekrani uchun. */
export async function getExpenses(filters?: {
  category?: string;
  from?: Date;
  to?: Date;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isFinanceRole(session.user.role as string)) throw new Error("Forbidden");

  return serialize(
    await prisma.kassaEntry.findMany({
      where: {
        type: "expense",
        deletedAt: null,
        ...(filters?.category ? { category: filters.category } : {}),
        ...(filters?.from || filters?.to
          ? {
              date: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
      },
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { date: "desc" },
    })
  );
}

/**
 * Xarajat kiritish. Tasdiq chegarasi `lib/expenseApproval.ts` da:
 * <1 mln avto-tasdiq · 1–10 mln bosh buxgalter · >10 mln superadmin.
 *
 * Yozuv `createKassaEntry` orqali ketadi — bitta yozuv yo'li, bitta jurnal.
 */
export async function createExpense(data: {
  amount: number;
  date: Date;
  category: string;
  description?: string;
  channelId?: string;
}) {
  return createKassaEntry({ ...data, type: "expense" });
}

/**
 * Kutilayotgan xarajatni tasdiqlash — pul SHU PAYTDA chiqadi.
 *
 * Jurnal yozuvi ham aynan shu yerda: `createKassaEntry` `pending` yozuvga
 * jurnal yozmaydi (pul hali chiqmagan), tasdiqda esa yoziladi.
 */
export async function approveExpense(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const role = session.user.role as string;

  const row = await prisma.kassaEntry.findUnique({ where: { id } });
  if (!row || row.deletedAt || row.type !== "expense") throw new Error("Xarajat topilmadi");
  // Ikki marta tasdiqlash — ikki marta jurnal yozuvi; qat'iy bloklanadi.
  if (row.status === "approved") throw new Error("Xarajat allaqachon tasdiqlangan");
  if (!canApproveExpense(role, Number(row.amount))) {
    throw new Error(
      Number(row.amount) > 10_000_000
        ? "10 mln dan yuqori — faqat Superadmin tasdiqlaydi"
        : "Tasdiqlash huquqi yo'q"
    );
  }

  const approved = await serializable(async (tx) => {
    // Holatni tranzaksiya ICHIDA qayta o'qiymiz: tekshiruvdan beri boshqa
    // seans tasdiqlab ulgurgan bo'lishi mumkin.
    const fresh = await tx.kassaEntry.findUnique({ where: { id }, select: { status: true } });
    if (!fresh || fresh.status === "approved") throw new Error("Xarajat allaqachon tasdiqlangan");

    await assertPeriodOpen(tx, row.date, "xarajat");
    await assertSufficientFunds({
      amount: Number(row.amount), role, userId: session.user.id, context: "expense", db: tx,
    });

    const updated = await tx.kassaEntry.update({
      where: { id },
      data: {
        status: "approved",
        approvedBy: session.user.id,
        approvedAt: new Date(),
        rejectedReason: null,
      },
    });
    await postExpenseLegs(tx, updated, session.user.id);
    return updated;
  });

  await recordAuditLog({
    userId: session.user.id,
    action: "update",
    tableName: "KassaEntry",
    recordId: id,
    newData: { status: "approved", amount: Number(row.amount) },
  });

  return serialize(approved);
}

export async function rejectExpense(id: string, reason: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isSeniorRole(session.user.role as string)) throw new Error("Forbidden");

  const row = await prisma.kassaEntry.findUnique({ where: { id } });
  if (!row || row.deletedAt || row.type !== "expense") throw new Error("Xarajat topilmadi");

  const rejected = await prisma.$transaction(async (tx) => {
    await assertPeriodOpen(tx, row.date, "xarajat");
    const updated = await tx.kassaEntry.update({
      where: { id },
      data: {
        status: "rejected",
        approvedBy: session.user.id,
        approvedAt: new Date(),
        rejectedReason: reason,
      },
    });
    // Avval tasdiqlangan bo'lsa — pul "qaytadi": jurnal izi nolga tushadi.
    await reverseLedger(tx, {
      sourceTable: "KassaEntry", sourceId: id,
      createdBy: session.user.id, reason: `rad etildi: ${reason}`,
    });
    return updated;
  });

  await recordAuditLog({
    userId: session.user.id,
    action: "update",
    tableName: "KassaEntry",
    recordId: id,
    newData: { status: "rejected", rejectedReason: reason },
  });

  return serialize(rejected);
}

export async function updateExpense(id: string, data: {
  amount: number;
  date: Date;
  category: string;
  description?: string;
  channelId?: string;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const role = session.user.role as string;
  const userId = session.user.id as string;

  if (data.channelId) await assertFundingSource(data.channelId);

  const existing = await prisma.kassaEntry.findUnique({ where: { id } });
  if (!existing || existing.deletedAt || existing.type !== "expense") {
    throw new Error("Xarajat topilmadi");
  }
  // Faqat senior rollar yoki (kutilayotgan xarajatning) muallifi tahrirlaydi.
  if (!isSeniorRole(role) && !(existing.createdBy === userId && existing.status === "pending")) {
    throw new Error("Forbidden");
  }
  assertPositiveAmount(data.amount, "Xarajat summasi");
  assertNotSalary("expense", data.category);

  // Tahrir tasdiq oqimini QAYTA BOSHLAYDI — `createExpense` bilan bir xil qoida.
  const autoApprove = data.amount < 1_000_000;

  const updated = await serializable(async (tx) => {
    // Ham eski, ham yangi davr ochiq bo'lishi kerak: yozuvni yopiq oydan
    // olib chiqib ketish ham taqiq.
    await assertPeriodOpen(tx, existing.date, "xarajat");
    await assertPeriodOpen(tx, data.date, "xarajat");

    if (autoApprove) {
      await assertSufficientFunds({
        amount: data.amount, role, userId, excludeKassaEntryId: id, context: "expense", db: tx,
      });
    }
    // Eski jurnal izi netto nolga tushadi, so'ng (avto-tasdiqda) qayta yoziladi.
    await reverseLedger(tx, {
      sourceTable: "KassaEntry", sourceId: id, createdBy: userId, reason: "xarajat tahrirlandi",
    });
    const row = await tx.kassaEntry.update({
      where: { id },
      // Maydonlar aniq sanaladi — sabab `createKassaEntry` dagi bilan bir xil:
      // mijoz yuborgan obyekt runtime da butunligicha keladi.
      data: {
        amount: data.amount,
        date: data.date,
        category: data.category,
        description: data.description ?? null,
        channelId: data.channelId ?? null,
        status: autoApprove ? "approved" : "pending",
        approvedBy: autoApprove ? userId : null,
        approvedAt: autoApprove ? new Date() : null,
        rejectedReason: null,
      },
    });
    if (autoApprove) await postExpenseLegs(tx, row, userId);
    return row;
  });

  await recordAuditLog({
    userId,
    action: "update",
    tableName: "KassaEntry",
    recordId: id,
    oldData: { amount: Number(existing.amount), category: existing.category, status: existing.status },
    newData: { amount: data.amount, category: data.category, status: updated.status },
  });

  return serialize(updated);
}

/** Xarajatni o'chirish — `deleteKassaEntry` bilan bir xil yo'l. */
export async function deleteExpense(id: string, reason?: string) {
  return deleteKassaEntry(id, reason);
}

// =====================================================
// PAYMENTS (Kassa — firma shartnoma to'lovlari)
// =====================================================

export async function getPayments(period?: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id as string;
  const role = session.user.role as string;
  if (!isFinanceRole(role) && role !== "supervisor") {
    throw new Error("Forbidden");
  }

  // To'lov FIRMAGA bog'langan — portfeldan tashqaridagilar ko'rinmaydi.
  return serialize(
    await prisma.payment.findMany({
      where: {
        deletedAt: null,
        ...(period ? { period } : {}),
        company: companyScopeWhere({ id: userId, role }),
      },
      include: {
        company: { select: { id: true, name: true, inn: true, contractAmount: true } },
      },
      orderBy: [{ period: "desc" }],
    })
  );
}

export async function upsertPayment(data: {
  companyId: string;
  period: string;
  amount: number;
  status: string;
  paymentDate?: Date;
  paymentMethod?: string;
  comment?: string;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id as string;
  const role = session.user.role as string;
  if (!isFinanceRole(role)) throw new Error("Forbidden");

  // Obyekt-scope: begona firmaga to'lov yozib bo'lmaydi (IDOR)
  await assertCompanyPermission(prisma, { id: userId, role }, data.companyId, "payment:write");

  if (!["paid", "pending", "partial", "overdue"].includes(data.status)) {
    throw new Error("To'lov holati noto'g'ri");
  }
  if (!Number.isFinite(data.amount) || data.amount < 0) {
    throw new Error("To'lov summasi manfiy bo'lishi mumkin emas");
  }
  await assertPeriodOpen(prisma, data.period, "shartnoma to'lovi");

  const { companyId, period, ...fields } = data;

  const existing = await prisma.payment.findUnique({
    where: { companyId_period: { companyId, period } },
    select: { id: true, amount: true, status: true, deletedAt: true },
  });

  const result = await prisma.$transaction(async (tx) => {
    const row = await tx.payment.upsert({
      where: { companyId_period: { companyId, period } },
      create: { companyId, period, ...fields, createdBy: session.user.id },
      // Soft-o'chirilgan qatorni qayta kiritish uni tiklaydi (unique constraint
      // bir davr uchun bitta qator saqlaydi) — audit quyida buni qayd etadi.
      update: { ...fields, deletedAt: null, deletedBy: null, deleteReason: null },
    });

    // Ledger holat mashinasi: har qanday oldingi iz netto nolga tushadi,
    // so'ng joriy holat 'paid' bo'lsa yangi summa bilan yoziladi. Shu bilan
    // paid→pending, paid→paid(summa o'zgardi), pending→paid — hammasi to'g'ri.
    await reverseLedger(tx, {
      sourceTable: "Payment",
      sourceId: row.id,
      createdBy: session.user.id,
      reason: "to'lov yangilandi",
    });
    if ((data.status === "paid" || data.status === "partial") && data.amount > 0) {
      await postLedger(tx, {
        legs: [
          { accountId: ACCOUNTS.CASH, debit: data.amount },
          { accountId: ACCOUNTS.CONTRACT_INCOME, credit: data.amount },
        ],
        period,
        sourceTable: "Payment",
        sourceId: row.id,
        createdBy: session.user.id,
        description: `Shartnoma to'lovi (${period})`,
      });
    }
    return row;
  });

  await recordAuditLog({
    userId: session.user.id,
    action: existing && !existing.deletedAt ? "update" : "create",
    tableName: "Payment",
    recordId: result.id,
    ...(existing
      ? { oldData: { amount: Number(existing.amount), status: existing.status, wasDeleted: !!existing.deletedAt } }
      : {}),
    newData: { companyId, period, amount: data.amount, status: data.status },
  });

  return serialize(result);
}

export async function deletePayment(id: string, reason?: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isAdminRole(role)) throw new Error("Forbidden");

  const existing = await prisma.payment.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw new Error("To'lov topilmadi");

  await assertPeriodOpen(prisma, existing.period, "shartnoma to'lovi");

  const deleted = await prisma.$transaction(async (tx) => {
    const row = await tx.payment.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: session.user.id, deleteReason: reason?.trim() || null },
    });
    await reverseLedger(tx, {
      sourceTable: "Payment",
      sourceId: id,
      createdBy: session.user.id,
      reason: reason?.trim() || "to'lov o'chirildi",
    });
    return row;
  });

  await recordAuditLog({
    userId: session.user.id,
    action: "delete",
    tableName: "Payment",
    recordId: id,
    oldData: { companyId: existing.companyId, period: existing.period, amount: Number(existing.amount), status: existing.status },
    newData: { deleteReason: reason?.trim() || null },
  });

  return serialize(deleted);
}
