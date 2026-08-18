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

  // ── 4b. Boshlang'ich qarz to'ldirilganmi ─────────────────────────────
  //
  // ASRO 2026-07 dan hisob yuritadi (`lib/debt.ts` BILLING_START_PERIOD).
  // Undan OLDINGI qarz `Contract.openingDebt` da turishi kerak — schema
  // izohi shunday deydi: "boshlang'ich + yangi oylar − to'lovlar".
  //
  // To'ldirilmagan shartnoma = o'sha mijozning eski qarzi ASRO hisobida
  // UMUMAN YO'Q. Aynan shu 1C bilan farqning asosiy sababi bo'ladi, va u
  // raqamga qarab tushunarli emas — shuning uchun alohida ko'rsatiladi.
  const [contractTotal, withOpening, openingSum] = await Promise.all([
    db.contract.count({ where: { isActive: true } }),
    db.contract.count({ where: { isActive: true, openingDebt: { not: null } } }),
    db.contract.aggregate({ where: { isActive: true }, _sum: { openingDebt: true } }),
  ]);
  const missingOpening = contractTotal - withOpening;
  checks.push({
    key: "opening-debt",
    title: "Boshlang'ich qarz to'ldirilgan",
    status: missingOpening === 0 ? "ok" : missingOpening > contractTotal / 2 ? "error" : "warn",
    value: missingOpening,
    detail:
      missingOpening === 0
        ? `${contractTotal} shartnomaning hammasida boshlang'ich qarz bor (${Math.round(n(openingSum._sum.openingDebt)).toLocaleString("ru-RU")} so'm)`
        : `${contractTotal} shartnomadan ${missingOpening} tasida boshlang'ich qarz yo'q — ` +
          `o'sha mijozlarning 2026-iyulgacha bo'lgan qarzi ASRO hisobida ko'rinmaydi`,
    action:
      missingOpening > 0
        ? "1C «Задолженность покупателей» dan boshlang'ich qarzni yuklang " +
          "(scripts/import-debt-1c.ts) — busiz ASRO va 1C raqamlari hech qachon mos kelmaydi"
        : undefined,
  });

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

  // ── 7. Kirim va chiqim importi bir sanadan boshlanganmi ──────────────
  //
  // Oy yopish auditida topildi: 2026-iyulning ochilish qoldig'i −28 828 100
  // chiqdi. Sababi kod emas, MA'LUMOT ASSIMETRIYASI — ovqat/xo'jalik
  // xarajatlari 2025-fevraldan import qilingan, kirim esa faqat 2026-iyuldan.
  // Ya'ni tizim o'sha davr uchun chiqimni ko'radi, uni qoplagan kirimni emas.
  //
  // Bu yopishni bloklamaydi (ledger balansda va butunligi joyida), lekin
  // ko'rinmasa yil yopilganda soxta manfiy qoldiq snapshotga muhrlanadi.
  const [firstOut, firstIn] = await Promise.all([
    db.$queryRaw<{ d: Date | null }[]>`
      SELECT min(d) AS d FROM (
        SELECT min(date)   AS d FROM "KassaEntry" WHERE type = 'expense' AND "deletedAt" IS NULL
        UNION ALL SELECT min(date)   FROM "Expense" WHERE status = 'approved' AND "deletedAt" IS NULL
        UNION ALL SELECT min("paidAt") FROM "Payout" WHERE "deletedAt" IS NULL
      ) x`,
    db.$queryRaw<{ d: Date | null }[]>`
      SELECT min(d) AS d FROM (
        SELECT min(date) AS d FROM "KassaEntry" WHERE type = 'income' AND "deletedAt" IS NULL
        UNION ALL SELECT min(to_date(period || '-01', 'YYYY-MM-DD'))
                    FROM "Payment"
                   WHERE status IN ('paid','partial') AND "deletedAt" IS NULL
                     AND period ~ '^[0-9]{4}-[0-9]{2}$'
      ) x`,
  ]);
  const outFrom = firstOut[0]?.d ? new Date(firstOut[0].d) : null;
  const inFrom = firstIn[0]?.d ? new Date(firstIn[0].d) : null;

  if (outFrom && inFrom) {
    // Chiqim kirimdan qancha oldin boshlangan (kun).
    const gapDays = Math.round((inFrom.getTime() - outFrom.getTime()) / 86_400_000);
    const orphanAgg = await db.kassaEntry.aggregate({
      where: { type: "expense", deletedAt: null, date: { lt: inFrom } },
      _sum: { amount: true },
      _count: true,
    });
    const orphan = n(orphanAgg._sum.amount);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    // 31 kungacha farq normal (oy chegarasi); undan ortig'i import bo'shlig'i.
    const bad = gapDays > 31 && orphan > 0;
    checks.push({
      key: "import-window",
      title: "Kirim va chiqim bir davrdan import qilingan",
      status: bad ? "warn" : "ok",
      value: orphan,
      detail: bad
        ? `Chiqim ${iso(outFrom)} dan, kirim esa ${iso(inFrom)} dan boshlanadi. ` +
          `Oradagi ${orphanAgg._count} ta chiqim (${Math.round(orphan).toLocaleString("ru-RU")} so'm) ` +
          `qoplovchi kirimsiz turibdi — shu sababli davr boshidagi qoldiq manfiy.`
        : `Ikkalasi ham ${iso(outFrom)} atrofidan boshlanadi`,
      action: bad
        ? "Yo o'sha davrning kirimini import qiling, yo eski chiqimlarni " +
          "tizim boshlangan sanadan oldingi deb arxivlang. Yil yopishdan " +
          "OLDIN hal qiling — aks holda manfiy qoldiq snapshotga muhrlanadi."
        : undefined,
    });
  }

  // ── 8. Har bir pul qatorining jurnalda izi bormi ─────────────────────
  //
  // Oy yopishdagi yaxlitlik tekshiruvi (lib/monthClose.ts
  // `checkLedgerSourceIntegrity`) id ro'yxatini LEDGER qatorlaridan yig'adi,
  // ya'ni JURNAL → MANBA yo'nalishida yuradi. Natijada jurnalda UMUMAN qatori
  // bo'lmagan manba unga hech qachon tushmaydi va tekshiruv yashil qoladi.
  //
  // Aynan shu ko'r nuqta ~1.4 mlrd so'mlik tafovutni yashirib turgan edi:
  // UI orqali kirgan yozuvlar postLedger chaqiradi, import va skript yo'llari
  // (server/bankImport.ts, scripts/import-kassa-data.ts, lib/transit.ts) esa
  // to'g'ridan-to'g'ri `create` qiladi va jurnalga hech narsa yozmaydi.
  //
  // Bu yerda TESKARI yo'nalish tekshiriladi: MANBA → JURNAL. Hech narsa
  // tuzatilmaydi — faqat ko'rsatiladi.
  const journalGap = await db.$queryRaw<{ table_name: string; cnt: bigint; total: number }[]>`
    SELECT 'KassaEntry' AS table_name, count(*)::bigint AS cnt, coalesce(sum(k.amount), 0)::float8 AS total
      FROM "KassaEntry" k
     WHERE k."deletedAt" IS NULL
       AND NOT EXISTS (SELECT 1 FROM "LedgerEntry" l
                        WHERE l."sourceId" = k.id AND l."sourceTable" = 'KassaEntry')
    UNION ALL
    SELECT 'Payment', count(*)::bigint, coalesce(sum(p.amount), 0)::float8
      FROM "Payment" p
     WHERE p."deletedAt" IS NULL AND p.status IN ('paid', 'partial')
       AND NOT EXISTS (SELECT 1 FROM "LedgerEntry" l
                        WHERE l."sourceId" = p.id AND l."sourceTable" = 'Payment')
    UNION ALL
    SELECT 'Expense', count(*)::bigint, coalesce(sum(e.amount), 0)::float8
      FROM "Expense" e
     WHERE e."deletedAt" IS NULL AND e.status = 'approved'
       AND NOT EXISTS (SELECT 1 FROM "LedgerEntry" l
                        WHERE l."sourceId" = e.id AND l."sourceTable" = 'Expense')
    UNION ALL
    SELECT 'Payout', count(*)::bigint, coalesce(sum(o.amount), 0)::float8
      FROM "Payout" o
     WHERE o."deletedAt" IS NULL
       AND NOT EXISTS (SELECT 1 FROM "LedgerEntry" l
                        WHERE l."sourceId" = o.id AND l."sourceTable" = 'Payout')`;

  const gapRows = journalGap.filter((r) => Number(r.cnt) > 0);
  const gapCount = gapRows.reduce((s, r) => s + Number(r.cnt), 0);
  const gapTotal = gapRows.reduce((s, r) => s + n(r.total), 0);
  const gapLabels: Record<string, string> = {
    KassaEntry: "kassa yozuvi",
    Payment: "shartnoma to'lovi",
    Expense: "xarajat",
    Payout: "oylik to'lovi",
  };

  checks.push({
    key: "journal-coverage",
    title: "Har bir pul qatori jurnalga tushgan",
    status: gapCount === 0 ? "ok" : "error",
    value: gapTotal,
    detail:
      gapCount === 0
        ? "Barcha kirim/chiqim qatorlarining ikki tomonlama yozuvda izi bor"
        : `${gapCount} ta qatorning jurnalda izi yo'q (${Math.round(gapTotal).toLocaleString("ru-RU")} so'm): ` +
          gapRows.map((r) => `${gapLabels[r.table_name] ?? r.table_name} ${Number(r.cnt)} ta`).join(", "),
    action:
      gapCount > 0
        ? "Bular import/skript orqali kirgan — UI yo'li jurnalga yozadi, import yo'li yo'q. " +
          "Yil yopishdan OLDIN hal qiling: jurnal qiymati snapshotga muhrlanadi."
        : undefined,
  });

  return checks;
}

export const worstStatus = (checks: ReconCheck[]): CheckStatus =>
  checks.some((c) => c.status === "error") ? "error"
  : checks.some((c) => c.status === "warn") ? "warn"
  : "ok";
