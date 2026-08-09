// =====================================================
// SVERKA (reconciliation) — moliyaviy invariantlar
// =====================================================
//
// Auditda aniqlangan asosiy xavf: import nomuvofiqliklari FAQAT skript
// chiqishida ko'rinardi. Terminal yopilgach ular yo'qolardi, ya'ni
// nosozlik jimgina yashab qolardi.
//
// Bu modul har bir invariantni SO'ROV bilan tekshiradi va natijani UI'ga
// beradi. Har tekshiruv uchta holatdan birida bo'ladi:
//   ok    — mos
//   warn  — farq bor, lekin izohlanadi (masalan bank Excel'dan ko'p yuborgan)
//   error — mantiqiy buzilish, aralashuv kerak
//
// Bu yerda TUZATILMAYDI, faqat KO'RSATILADI: avtomatik "tuzatish" jim
// ravishda ma'lumotni buzishi mumkin.

import { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient;

export type CheckStatus = "ok" | "warn" | "error";

export interface ReconCheck {
  key: string;
  title: string;
  status: CheckStatus;
  /** Asosiy raqam (odatda farq). */
  value: number;
  detail: string;
  /** Nima qilish kerak — bo'sh bo'lsa harakat talab qilinmaydi. */
  action?: string;
}

const n = (v: unknown) => Number(v ?? 0);

/** Barcha sverka tekshiruvlari. Bitta so'rovlar to'plami — sahifa tez ochilsin. */
export async function runReconciliation(db: Db): Promise<ReconCheck[]> {
  const checks: ReconCheck[] = [];

  // ── 1. Payment.amount = taqsimotlar yig'indisi ───────────────────────
  const mismatched = await db.$queryRaw<{ c: bigint }[]>`
    SELECT count(*)::bigint AS c
      FROM "Payment" p
      JOIN (SELECT "paymentId", sum(amount) s FROM "PaymentAllocation" GROUP BY 1) a
        ON a."paymentId" = p.id
     WHERE p.amount <> a.s`;
  const mismatchCount = Number(mismatched[0]?.c ?? 0);
  checks.push({
    key: "payment-allocation",
    title: "To'lov = taqsimotlar yig'indisi",
    status: mismatchCount === 0 ? "ok" : "error",
    value: mismatchCount,
    detail:
      mismatchCount === 0
        ? "Har bir to'lov o'z taqsimotlariga teng"
        : `${mismatchCount} ta to'lovda summa taqsimotlarga teng emas`,
    action: mismatchCount > 0 ? "Vipiskani qayta moslashtiring" : undefined,
  });

  // ── 2. Bank vipiskasi: yozilgan va hisobga olingan ───────────────────
  const [txAgg, postedAgg, unmatchedIncome, unmatchedExpense] = await Promise.all([
    db.bankTransaction.aggregate({ where: { direction: "income" }, _sum: { amount: true }, _count: { _all: true } }),
    db.bankTransaction.aggregate({ where: { direction: "income", status: "posted" }, _sum: { amount: true } }),
    db.bankTransaction.count({ where: { direction: "income", status: "unmatched" } }),
    db.bankTransaction.count({ where: { direction: "expense", status: "unmatched" } }),
  ]);
  const incomeTotal = n(txAgg._sum.amount);
  const postedTotal = n(postedAgg._sum.amount);
  checks.push({
    key: "bank-income",
    title: "Bank kirimi hisobga olingan",
    status: unmatchedIncome === 0 ? "ok" : "warn",
    value: incomeTotal - postedTotal,
    detail: `${txAgg._count._all} kirimdan ${postedTotal > 0 ? Math.round((postedTotal / incomeTotal) * 100) : 0}% hisobga olindi · ${unmatchedIncome} ta navbatda`,
    action: unmatchedIncome > 0 ? "Kirim kassada mijozga bog'lang" : undefined,
  });

  checks.push({
    key: "bank-expense",
    title: "Bank chiqimi toifalangan",
    status: unmatchedExpense === 0 ? "ok" : "warn",
    value: unmatchedExpense,
    detail:
      unmatchedExpense === 0
        ? "Hamma chiqim toifalangan"
        : `${unmatchedExpense} ta chiqim hali toifalanmagan`,
    action: unmatchedExpense > 0 ? "Chiqim kassada toifalang" : undefined,
  });

  // ── 3. Tranzit: bankdan chiqqan va kartadan sarflangan ───────────────
  const transit = await db.transitEntry.groupBy({ by: ["direction"], _sum: { amount: true } });
  const tIn = n(transit.find((t) => t.direction === "in")?._sum.amount);
  const tOut = n(transit.find((t) => t.direction === "out")?._sum.amount);
  const tBalance = tIn - tOut;
  checks.push({
    key: "transit",
    title: "Tranzit kartalar qoldig'i",
    status: tBalance === 0 ? "ok" : "warn",
    value: tBalance,
    detail: `Kartaga ${Math.round(tIn).toLocaleString("en-US")}, sarflangani ${Math.round(tOut).toLocaleString("en-US")} — hisobga olinmagan qoldiq`,
    action: tBalance > 0 ? "Kartadan qilingan xarajatlarni kiriting" : undefined,
  });

  // ── 4. 1C va ASRO qarzdorligi ────────────────────────────────────────
  const latest = await db.debtSnapshot.findFirst({ orderBy: { asOf: "desc" }, select: { asOf: true } });
  if (latest) {
    const [snapAgg, unlinkedSnap] = await Promise.all([
      db.debtSnapshot.aggregate({ where: { asOf: latest.asOf }, _sum: { debt: true }, _count: { _all: true } }),
      db.debtSnapshot.count({ where: { asOf: latest.asOf, companyId: null } }),
    ]);
    checks.push({
      key: "debt-1c-linked",
      title: "1C qarzdorligi firmaga bog'langan",
      status: unlinkedSnap === 0 ? "ok" : "warn",
      value: unlinkedSnap,
      detail: `${snapAgg._count._all} qatordan ${unlinkedSnap} tasining mijozi ASRO bazasida topilmadi`,
      action: unlinkedSnap > 0 ? "Firmani qo'shib, importni qayta ishga tushiring" : undefined,
    });
  }

  // ── 5. To'lov holati summaga mos ─────────────────────────────────────
  const badStatus = await db.$queryRaw<{ c: bigint }[]>`
    SELECT count(*)::bigint AS c
      FROM "Payment" p
      JOIN "Company" c ON c.id = p."companyId"
     WHERE p.status = 'paid'
       AND c."contractAmount" IS NOT NULL
       AND p.amount < c."contractAmount"
       AND p."deletedAt" IS NULL`;
  const badStatusCount = Number(badStatus[0]?.c ?? 0);
  checks.push({
    key: "payment-status",
    title: "To'lov holati summaga mos",
    status: badStatusCount === 0 ? "ok" : "warn",
    value: badStatusCount,
    detail:
      badStatusCount === 0
        ? "Barcha 'to'langan' to'lovlar shartnoma summasini qoplaydi"
        : `${badStatusCount} ta to'lov 'to'langan' deb belgilangan, lekin summasi shartnomadan kam`,
    action: badStatusCount > 0 ? "Holatni 'qisman' ga o'zgartiring yoki farqni kiriting" : undefined,
  });

  // ── 6. Karta ikki kanalga biriktirilmagan ────────────────────────────
  const dupCards = await db.$queryRaw<{ c: bigint }[]>`
    SELECT coalesce(sum(c - 1), 0)::bigint AS c
      FROM (SELECT count(*) c FROM "ChannelCard" GROUP BY "cardMask" HAVING count(*) > 1) x`;
  const dupCardCount = Number(dupCards[0]?.c ?? 0);
  checks.push({
    key: "channel-cards",
    title: "Har karta bitta odamda",
    status: dupCardCount === 0 ? "ok" : "error",
    value: dupCardCount,
    detail:
      dupCardCount === 0
        ? "Karta takrorlanishi yo'q"
        : `${dupCardCount} ta karta bir nechta kanalga biriktirilgan`,
    action: dupCardCount > 0 ? "scripts/merge-channels.ts ishga tushiring" : undefined,
  });

  return checks;
}

export const worstStatus = (checks: ReconCheck[]): CheckStatus =>
  checks.some((c) => c.status === "error") ? "error"
  : checks.some((c) => c.status === "warn") ? "warn"
  : "ok";
