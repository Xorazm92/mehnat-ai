"use server";

// =====================================================
// TO'LOVLAR — firma shartnoma to'lovlari (`Payment`)
// =====================================================
//
// `KassaEntry` dan FARQI: bu mijozning shartnoma bo'yicha to'lovi, ofis
// kassasi harakati emas. Qarzdorlik hisobi aynan shu jadvaldan o'qiladi
// (`lib/debt.ts`), shuning uchun bu yerga yozilgan har qator qarz raqamini
// o'zgartiradi.

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/platform/permissions";
import { companyScopeWhere, assertCompanyPermission } from "@/lib/platform/access";
import { assertPeriodOpen } from "@/lib/periodLock";
import { ACCOUNTS, postLedger, reverseLedger } from "@/lib/ledger";
import { assertFundingSource } from "@/server/fundingSources";
import { isFinanceRole } from "@/lib/platform/permissions";
import { recordAuditLog } from "@/lib/platform/auditTrail";
import { serialize } from "@/lib/serialize";

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
  const rows = await prisma.payment.findMany({
    where: {
      deletedAt: null,
      ...(period ? { period } : {}),
      company: companyScopeWhere({ id: userId, role }),
    },
    include: {
      company: { select: { id: true, name: true, inn: true, contractAmount: true } },
    },
    orderBy: [{ period: "desc" }],
  });

  // KANAL — `Payment` jadvalida saqlanmaydi (faqat jurnalda), aks holda ikki
  // manba bo'lib qolardi. Tahrirlashda oldingi tanlovni ko'rsatish uchun eng
  // so'nggi (hali teskarilanmagan) CASH oyog'idan o'qiladi: `upsertPayment`
  // har saqlashda avval `reverseLedger`, so'ng `postLedger` chaqiradi, ya'ni
  // istalgan paytda `sourceTable: 'Payment'` (reversal EMAS) belgili eng
  // yangi qator — joriy kanal.
  const channelByPayment = new Map<string, string | null>();
  if (rows.length > 0) {
    const legs = await prisma.ledgerEntry.findMany({
      where: { sourceTable: "Payment", accountId: "CASH", sourceId: { in: rows.map((r) => r.id) } },
      select: { sourceId: true, channelId: true },
      orderBy: { createdAt: "desc" },
    });
    for (const leg of legs) {
      if (leg.sourceId && !channelByPayment.has(leg.sourceId)) channelByPayment.set(leg.sourceId, leg.channelId);
    }
  }

  return serialize(
    rows.map((r) => ({ ...r, channelId: channelByPayment.get(r.id) ?? null }))
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
  /** Pul qaysi hisobga tushdi. `status` paid/partial bo'lganda MAJBURIY. */
  channelId?: string;
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
  // KIRIM MANBASIZ YOZILMAYDI — `createKassaEntry` dagi chiqim qoidasi bilan
  // bir xil sabab (`entries.ts` dagi `createKassaEntry`). Pul haqiqatan tushganida
  // (paid/partial, summa > 0) qaysi hisobga tushgani jurnalda ko'rinmasa,
  // "Kassalar hisoboti" (server/kassaReport.ts) uni umuman ko'rmaydi.
  // AUDITDA TOPILDI (2026-09-03, prod): shu yo'ldan 174 ta yozuv, 872 mln
  // so'm kanalsiz kirgan edi — CashDeskTable.tsx bu bo'shliqni "kutilgan
  // holat" deb hujjatlashtirgan va "kanal backfilli tugagach kamayadi" deb
  // va'da bergan; mana shu o'sha backfil qadami.
  const postsCash = (data.status === "paid" || data.status === "partial") && data.amount > 0;
  if (postsCash && !data.channelId) {
    throw new Error("To'lov qaysi hisobga tushganini tanlang — bank hisobi, Plastik yoki Naqd");
  }
  if (data.channelId) await assertFundingSource(data.channelId);
  await assertPeriodOpen(prisma, data.period, "shartnoma to'lovi");

  const { companyId, period, channelId, ...fields } = data;

  const existing = await prisma.payment.findUnique({
    where: { companyId_period: { companyId, period } },
    select: { id: true, amount: true, status: true, deletedAt: true, _count: { select: { allocations: true } } },
  });

  // BU YO'L `PaymentAllocation`NI BILMAYDI: summani to'g'ridan-to'g'ri
  // yozadi. Agar davr allaqachon bank/plastik/naqd taqsimotidan yig'ilgan
  // bo'lsa, bu yerdan qo'lda tuzatish keyingi importda `applyAllocation`
  // tomonidan (taqsimotlar yig'indisiga) jimgina qayta yozilib ketardi —
  // buxgalterning tuzatishi iz qoldirmay yo'qolardi. To'g'ri yo'l: shu
  // davr uchun yangi tushumni `/kassa/kirim` dagi "Tushum qo'shish" orqali
  // (`recordManualReceipt` → `applyAllocation`) kiritish.
  if (existing && existing._count.allocations > 0) {
    throw new Error(
      "Bu davr uchun to'lov allaqachon taqsimotlardan (bank/plastik/naqd) yig'ilgan — " +
        "bu yerdan summani qo'lda o'zgartirib bo'lmaydi, keyingi import uni ustidan yozadi. " +
        "Yangi tushumni \"/kassa/kirim\" dagi \"Tushum qo'shish\" orqali kiriting."
    );
  }

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
    if (postsCash) {
      await postLedger(tx, {
        legs: [
          { accountId: ACCOUNTS.CASH, debit: data.amount, channelId: channelId ?? null },
          { accountId: ACCOUNTS.CONTRACT_INCOME, credit: data.amount, subjectId: companyId },
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
    newData: { companyId, period, amount: data.amount, status: data.status, channelId: channelId ?? null },
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
