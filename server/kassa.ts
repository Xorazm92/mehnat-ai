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
  if (!isFinanceRole(role)) throw new Error("Forbidden");

  if (data.type !== "income" && data.type !== "expense") {
    throw new Error("Kassa turi noto'g'ri: 'income' yoki 'expense' bo'lishi kerak");
  }
  // Oylik kassa chiqimi sifatida yozilsa, `Payout` bilan IKKI MARTA sanaladi:
  // `lib/balance.ts` chiqimni ikkala jadvaldan ham oladi. Toifa ro'yxatidan
  // olib tashlangan (`lib/kassaCategories.ts`), lekin ro'yxat sozlamada —
  // korxona uni qayta qo'shib qo'yishi mumkin, shuning uchun server tomonda
  // ham qo'riqchi turadi.
  // Naqsh KENG: prod bazasida oylik "Ish haqi" deb yozilgan (70.6 mln) —
  // tor naqsh uni o'tkazib yuborardi. "Ish haqi", "oylik", "maosh",
  // "zarplata" va ruscha/lotincha variantlari qamrab olinadi.
  if (
    data.type === "expense" &&
    /oylik|ish\s*haqi|mehnat\s*haqi|maosh|zarplata|зарплат|ойлик|иш\s*хак/i.test(data.category)
  ) {
    throw new Error(
      "Oylik kassa chiqimi sifatida yozilmaydi — u ikki marta hisobga kirardi. " +
        "Oylik to'lovi \"Oylik\" bo'limi (/payroll) orqali beriladi."
    );
  }
  assertPositiveAmount(data.amount);
  await assertPeriodOpen(prisma, data.date, "kassa yozuvi");

  const created = await serializable(async (tx) => {
    // Kassa chiqimi mavjud balansdan oshmasligi kerak (kirim shart emas).
    // Tekshiruv YOZUV BILAN BIR TRANZAKSIYADA — aks holda ikki parallel chiqim
    // bir xil balansni ko'rib ikkalasi ham o'tib ketardi.
    if (data.type === "expense") {
      await assertSufficientFunds({
        amount: data.amount, role, userId: session.user.id, context: "expense", db: tx,
      });
    }
    const row = await tx.kassaEntry.create({
      data: {
        ...data,
        createdBy: session.user.id,
      },
    });
    await postLedger(tx, {
      legs:
        data.type === "income"
          ? [
              { accountId: ACCOUNTS.CASH, debit: data.amount },
              { accountId: ACCOUNTS.KASSA_INCOME, credit: data.amount },
            ]
          : [
              { accountId: ACCOUNTS.OPERATING_EXPENSE, debit: data.amount },
              { accountId: ACCOUNTS.CASH, credit: data.amount },
            ],
      period: periodKeyOf(data.date),
      sourceTable: "KassaEntry",
      sourceId: row.id,
      createdBy: session.user.id,
      description: `Kassa ${data.type === "income" ? "kirim" : "chiqim"}: ${data.category}`,
    });
    return row;
  });

  await recordAuditLog({
    userId: session.user.id,
    action: "create",
    tableName: "KassaEntry",
    recordId: created.id,
    newData: { type: data.type, category: data.category, amount: data.amount },
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
// EXPENSES
// =====================================================

export async function getExpenses(filters?: {
  category?: string;
  from?: Date;
  to?: Date;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isFinanceRole(role)) throw new Error("Forbidden");

  return serialize(
    await prisma.expense.findMany({
      where: {
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
      include: {
        user: { select: { id: true, fullName: true } },
      },
      orderBy: { date: "desc" },
    })
  );
}

// Tasdiqlangan xarajatning ikki tomonlama yozuvi: xarajat oshdi, kassa kamaydi.
async function postExpenseLedger(tx: Prisma.TransactionClient, exp: { id: string; amount: number; category: string; date: Date }, userId: string) {
  await postLedger(tx, {
    legs: [
      { accountId: ACCOUNTS.OPERATING_EXPENSE, debit: exp.amount },
      { accountId: ACCOUNTS.CASH, credit: exp.amount },
    ],
    period: periodKeyOf(exp.date),
    sourceTable: "Expense",
    sourceId: exp.id,
    createdBy: userId,
    description: `Xarajat: ${exp.category}`,
  });
}

export async function createExpense(data: {
  amount: number;
  date: Date;
  category: string;
  description?: string;
  paymentMethod?: string;
  /** Pul qaysi manbadan chiqdi — DisbursementChannel.id (schyot yoki plastik). */
  channelId?: string;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  // Xarajat kiritish — xarajatlar bo'limini ko'ra oladigan rollar bilan bir xil
  // (getExpenses); aks holda buxgalter <1 mln xarajatni avto-tasdiq bilan o'tkaza olardi.
  if (!isFinanceRole(role)) throw new Error("Forbidden");
  assertPositiveAmount(data.amount, "Xarajat summasi");
  // Manba serverda tekshiriladi: formaning majburiyligi yetarli emas, aks holda
  // bitta so'rov bilan "pul qayerdan chiqdi" savoli javobsiz qolardi.
  if (data.channelId) await assertFundingSource(data.channelId);
  await assertPeriodOpen(prisma, data.date, "xarajat");

  const autoApprove = data.amount < 1_000_000; // kichik xarajatlar avtomatik tasdiqlanadi
  // Avto-tasdiqda pul darhol chiqadi → mavjud balansdan oshmasligini tekshir.
  // Katta (pending) xarajatlar tasdiq paytida (approveExpense) tekshiriladi.
  const created = await serializable(async (tx) => {
    if (autoApprove) {
      await assertSufficientFunds({
        amount: data.amount, role, userId: session.user.id, context: "expense", db: tx,
      });
    }
    const row = await tx.expense.create({
      data: {
        ...data,
        createdBy: session.user.id,
        status: autoApprove ? "approved" : "pending",
        ...(autoApprove ? { approvedBy: session.user.id, approvedAt: new Date() } : {}),
      },
    });
    // Ledger faqat pul haqiqatan chiqqanda (tasdiqda) yoziladi.
    if (autoApprove) {
      await postExpenseLedger(tx, { id: row.id, amount: data.amount, category: data.category, date: data.date }, session.user.id);
    }
    return row;
  });

  await recordAuditLog({
    userId: session.user.id,
    action: "create",
    tableName: "Expense",
    recordId: created.id,
    newData: { amount: data.amount, category: data.category, status: created.status },
  });

  return serialize(created);
}

export async function approveExpense(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const role = session.user.role as string;

  const exp = await prisma.expense.findUnique({ where: { id } });
  if (!exp || exp.deletedAt) throw new Error("Xarajat topilmadi");
  // Ikki marta tasdiqlash — ikki marta ledger yozuvi degani; qat'iy bloklanadi.
  if (exp.status === "approved") throw new Error("Xarajat allaqachon tasdiqlangan");
  if (!canApproveExpense(role, Number(exp.amount))) {
    throw new Error(Number(exp.amount) > 10_000_000 ? "10 mln dan yuqori — faqat Superadmin tasdiqlaydi" : "Tasdiqlash huquqi yo'q");
  }

  await assertPeriodOpen(prisma, exp.date, "xarajat");

  const approved = await serializable(async (tx) => {
    // Holatni tranzaksiya ICHIDA qayta o'qiymiz: yuqoridagi tekshiruvdan beri
    // boshqa seans tasdiqlab ulgurgan bo'lishi mumkin, va ikki marta tasdiq =
    // ikki marta ledger yozuvi.
    const fresh = await tx.expense.findUnique({ where: { id }, select: { status: true } });
    if (!fresh || fresh.status === "approved") throw new Error("Xarajat allaqachon tasdiqlangan");

    // Tasdiqdan keyin pul chiqadi → mavjud balans yetarli bo'lishi kerak.
    await assertSufficientFunds({
      amount: Number(exp.amount), role, userId: session.user.id,
      excludeExpenseId: id, context: "expense", db: tx,
    });

    const row = await tx.expense.update({
      where: { id },
      data: { status: "approved", approvedBy: session.user.id, approvedAt: new Date(), rejectedReason: null },
    });
    await postExpenseLedger(tx, { id, amount: Number(exp.amount), category: exp.category, date: exp.date }, session.user.id);
    return row;
  });

  await recordAuditLog({
    userId: session.user.id,
    action: "update",
    tableName: "Expense",
    recordId: id,
    newData: { status: "approved", amount: Number(exp.amount) },
  });

  return serialize(approved);
}

export async function rejectExpense(id: string, reason: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isSeniorRole(session.user.role as string)) throw new Error("Forbidden");

  const exp = await prisma.expense.findUnique({ where: { id } });
  if (!exp || exp.deletedAt) throw new Error("Xarajat topilmadi");

  await assertPeriodOpen(prisma, exp.date, "xarajat");

  const rejected = await prisma.$transaction(async (tx) => {
    const row = await tx.expense.update({
      where: { id },
      data: { status: "rejected", approvedBy: session.user.id, approvedAt: new Date(), rejectedReason: reason },
    });
    // Avval tasdiqlangan bo'lsa — pul "qaytadi": ledger izi nolga tushiriladi.
    await reverseLedger(tx, { sourceTable: "Expense", sourceId: id, createdBy: session.user.id, reason: `rad etildi: ${reason}` });
    return row;
  });

  await recordAuditLog({
    userId: session.user.id,
    action: "update",
    tableName: "Expense",
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
  paymentMethod?: string;
  /** Pul manbai — DisbursementChannel.id (schyot yoki plastik). */
  channelId?: string;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  const userId = session.user.id;
  if (data.channelId) await assertFundingSource(data.channelId);

  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw new Error("Xarajat topilmadi");

  // Faqat senior rollar yoki (kutilayotgan xarajatning) muallifi tahrirlaydi
  if (!isSeniorRole(role) && !(existing.createdBy === userId && existing.status === "pending")) {
    throw new Error("Forbidden");
  }

  assertPositiveAmount(data.amount, "Xarajat summasi");
  // Ham eski, ham yangi davr ochiq bo'lishi kerak (yozuvni yopiq oydan olib chiqib ketish ham taqiq).
  await assertPeriodOpen(prisma, existing.date, "xarajat");
  await assertPeriodOpen(prisma, data.date, "xarajat");

  // Tahrir tasdiq oqimini qayta boshlaydi (createExpense bilan bir xil qoida)
  const autoApprove = data.amount < 1_000_000;
  // Avto-tasdiqlanadigan bo'lsa balansni tekshir — o'zining eski summasini
  // ikki marta sanamaslik uchun joriy xarajat chiqim yig'indisidan chiqariladi.
  const updated = await serializable(async (tx) => {
    if (autoApprove) {
      await assertSufficientFunds({
        amount: data.amount, role, userId, excludeExpenseId: id, context: "expense", db: tx,
      });
    }
    // Eski tasdiqlangan holatning ledger izi netto nolga tushadi, keyin
    // (agar yana avto-tasdiq bo'lsa) yangi summa bilan qayta yoziladi.
    await reverseLedger(tx, { sourceTable: "Expense", sourceId: id, createdBy: userId, reason: "xarajat tahrirlandi" });
    const row = await tx.expense.update({
      where: { id },
      data: {
        ...data,
        status: autoApprove ? "approved" : "pending",
        approvedBy: autoApprove ? session.user.id : null,
        approvedAt: autoApprove ? new Date() : null,
        rejectedReason: null,
      },
    });
    if (autoApprove) {
      await postExpenseLedger(tx, { id, amount: data.amount, category: data.category, date: data.date }, userId);
    }
    return row;
  });

  await recordAuditLog({
    userId,
    action: "update",
    tableName: "Expense",
    recordId: id,
    oldData: { amount: Number(existing.amount), category: existing.category, status: existing.status },
    newData: { amount: data.amount, category: data.category, status: updated.status },
  });

  return serialize(updated);
}

export async function deleteExpense(id: string, reason?: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isAdminRole(role)) throw new Error("Forbidden");

  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw new Error("Xarajat topilmadi");

  await assertPeriodOpen(prisma, existing.date, "xarajat");

  const deleted = await prisma.$transaction(async (tx) => {
    const row = await tx.expense.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: session.user.id, deleteReason: reason?.trim() || null },
    });
    await reverseLedger(tx, {
      sourceTable: "Expense",
      sourceId: id,
      createdBy: session.user.id,
      reason: reason?.trim() || "xarajat o'chirildi",
    });
    return row;
  });

  await recordAuditLog({
    userId: session.user.id,
    action: "delete",
    tableName: "Expense",
    recordId: id,
    oldData: { amount: Number(existing.amount), category: existing.category, status: existing.status, date: existing.date.toISOString() },
    newData: { deleteReason: reason?.trim() || null },
  });

  return serialize(deleted);
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
