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
        SELECT min(date)   AS d FROM "KassaEntry" WHERE type = 'expense' AND status = 'approved' AND "deletedAt" IS NULL
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
       -- FAQAT TASDIQLANGAN. pending yozuvda pul hali chiqmagan, ya'ni
       -- jurnal qatori bo'lmasligi TO'G'RI. Filtrsiz sverka tasdiq navbatini
       -- doimiy qizil qilib ko'rsatardi.
       AND k.status = 'approved'
       AND NOT EXISTS (SELECT 1 FROM "LedgerEntry" l
                        WHERE l."sourceId" = k.id AND l."sourceTable" = 'KassaEntry')
    UNION ALL
    SELECT 'Payment', count(*)::bigint, coalesce(sum(p.amount), 0)::float8
      FROM "Payment" p
     WHERE p."deletedAt" IS NULL AND p.status IN ('paid', 'partial')
       AND NOT EXISTS (SELECT 1 FROM "LedgerEntry" l
                        WHERE l."sourceId" = p.id AND l."sourceTable" = 'Payment')
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

  // ── Xizmat narxlari va shartnoma summasi ─────────────────────────────
  //
  // `CompanyServiceTerm.totalAmount` — hisob-kitobning YAGONA manbai (undan
  // oylik Payment generatsiya qilinadi). Xizmat katalogi esa o'sha summaning
  // NIMADAN iboratligini yozadi. Ikkalasi ajralib ketsa, mijozga bir summa
  // yozilib, ichida boshqa summalik xizmat turgan bo'ladi — bu farq schyot
  // yozilganda yuzaga chiqadi, shuning uchun oldindan ko'rsatiladi.
  const serviceRows = await db.$queryRaw<{ company_id: string; svc: number; term: number }[]>`
    SELECT cs."companyId" AS company_id,
           sum(COALESCE(cs.price, s."defaultPrice", 0) * cs.qty)::float8 AS svc,
           t."totalAmount"::float8 AS term
      FROM "CompanyService" cs
      JOIN "Service" s ON s.id = cs."serviceId"
      JOIN "Company" c ON c.id = cs."companyId"
      JOIN LATERAL (
             SELECT "totalAmount" FROM "CompanyServiceTerm" st
              WHERE st."companyId" = cs."companyId" AND st."effectiveTo" IS NULL
              ORDER BY st."effectiveFrom" DESC LIMIT 1
           ) t ON true
     WHERE cs."isActive" AND c."isActive" AND NOT c."isOwnFirm"
     GROUP BY cs."companyId", t."totalAmount"`;

  // 1000 so'mgacha farq yaxlitlash — xato deb ko'rsatish shovqin bo'lardi.
  const drift = serviceRows.filter((r) => Math.abs(n(r.svc) - n(r.term)) > 1000);
  const driftTotal = drift.reduce((sum, r) => sum + Math.abs(n(r.svc) - n(r.term)), 0);

  checks.push({
    key: "service-catalog-sum",
    title: "Xizmat narxlari shartnoma summasiga teng",
    status: serviceRows.length === 0 ? "ok" : drift.length === 0 ? "ok" : "warn",
    value: driftTotal,
    detail:
      serviceRows.length === 0
        ? "Hali bironta firmaga tijorat xizmati biriktirilmagan"
        : drift.length === 0
          ? `${serviceRows.length} firmada xizmatlar yig'indisi shartnoma summasiga mos`
          : `${drift.length} firmada xizmatlar yig'indisi shartnoma summasidan farq qiladi`,
    action: drift.length > 0 ? "Firma kartochkasidagi «Tijorat xizmatlari» narxlarini tekshiring" : undefined,
  });

  // ── 1C shartnoma summasi va ASRO shartnoma summasi ────────────────────
  //
  // `Contract.amount` — 1C reestridan kelgan oylik summa, `CompanyServiceTerm`
  // esa ASRO ning o'z narxi. Ular MAJBUR emas bir xil bo'lishi (1C kechikib
  // yangilanadi), lekin uzoq turgan farq odatda narx ko'tarilganda faqat
  // bitta joyda yangilanganini bildiradi — va o'shanda vipiskadagi to'lov
  // "ortiqcha"/"kam" bo'lib ko'rinadi.
  const contractRows = await db.$queryRaw<{ company_id: string; c1: number; term: number }[]>`
    SELECT k."companyId" AS company_id,
           sum(k.amount)::float8 AS c1,
           t."totalAmount"::float8 AS term
      FROM "Contract" k
      JOIN "Company" c ON c.id = k."companyId"
      JOIN LATERAL (
             SELECT "totalAmount" FROM "CompanyServiceTerm" st
              WHERE st."companyId" = k."companyId" AND st."effectiveTo" IS NULL
              ORDER BY st."effectiveFrom" DESC LIMIT 1
           ) t ON true
     WHERE k."isActive" AND k.amount IS NOT NULL
       AND c."isActive" AND NOT c."isOwnFirm"
     GROUP BY k."companyId", t."totalAmount"`;

  const c1Drift = contractRows.filter((r) => Math.abs(n(r.c1) - n(r.term)) > 1000);
  const c1DriftTotal = c1Drift.reduce((sum, r) => sum + Math.abs(n(r.c1) - n(r.term)), 0);

  checks.push({
    key: "contract-term-sum",
    title: "1C shartnoma summasi ASRO narxiga teng",
    status: contractRows.length === 0 || c1Drift.length === 0 ? "ok" : "warn",
    value: c1DriftTotal,
    detail:
      contractRows.length === 0
        ? "1C reestridan summali shartnoma yuklanmagan"
        : c1Drift.length === 0
          ? `${contractRows.length} firmada 1C summasi ASRO narxiga mos`
          : `${c1Drift.length} firmada 1C summasi ASRO narxidan farq qiladi`,
    action:
      c1Drift.length > 0
        ? "Narx qaysi tomonda o'zgargan — firma kartochkasidagi summani yoki 1C reestrini yangilang"
        : undefined,
  });

  // ── Shablon qamrovi: activeServices bo'shligi ─────────────────────────
  //
  // 17 ta muddat shabloni `criteriaType = 'service_key'` bilan darvozalangan,
  // ya'ni ular faqat `Company.activeServices` da o'sha kalit turgan firmaga
  // majburiyat yaratadi. Prodda esa 259 faol mijozdan deyarli hech birida bu
  // maydon to'ldirilmagan — natijada ekologiya, statistika, yer/suv solig'i
  // shablonlari JIMGINA hech kimga tegmaydi.
  //
  // BU YERDA AVTOMATIK TUZATILMAYDI. "Bo'sh = hammasi yoqilgan" deb talqin
  // qilish (matritsa `serviceEnabled` aynan shunday qiladi) 259 ta firmaga
  // ekologiya va yer solig'i majburiyatini tarqatib yuborardi — ularning
  // ko'pchiligida bu hisobotlar umuman yo'q. To'g'ri yo'l — firma
  // kartochkasida xizmatlarni belgilash; bu tekshiruv esa bo'shliq
  // ko'rinmay qolmasligi uchun.
  const svcCoverage = await db.$queryRaw<{ total: number; filled: number }[]>`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE array_length("activeServices", 1) > 0)::int AS filled
      FROM "Company"
     WHERE "isActive" AND NOT "isOwnFirm"`;

  const cov = svcCoverage[0] ?? { total: 0, filled: 0 };
  const missing = n(cov.total) - n(cov.filled);

  checks.push({
    key: "active-services-coverage",
    title: "Firmalarda xizmat kalitlari belgilangan",
    status: missing === 0 ? "ok" : missing > n(cov.total) / 2 ? "error" : "warn",
    value: missing,
    detail:
      missing === 0
        ? `${cov.total} ta faol firmada xizmat kalitlari to'ldirilgan`
        : `${missing} ta faol firmada "Xizmatlar" belgilanmagan — ularga ` +
          `xizmatga bog'liq muddat shablonlari (ekologiya, statistika, yer/suv solig'i) tegmaydi`,
    action:
      missing > 0
        ? "Firma kartochkasi → Xizmatlar tabida kerakli kataklarni belgilang"
        : undefined,
  });

  // ── Eslatma yetib bormaydigan qarzdorlar ──────────────────────────────
  //
  // `runBillingReminders` Telegram guruhi yo'q firmani `skippedNoGroup` deb
  // sanaydi va o'tib ketadi. O'sha son cron chiqishida qoladi, ya'ni
  // eslatmasiz qolgan qarzdor JIMGINA yo'qoladi: qarz turadi, mijoz esa
  // hech qanday xabar olmaydi. SMS kanali yo'q ekan, hech bo'lmasa
  // ro'yxatning o'zi ko'rinib tursin.
  const silentDebtors = await db.$queryRaw<{ cnt: number; amount: number }[]>`
    SELECT count(*)::int AS cnt,
           COALESCE(sum(GREATEST(t."totalAmount" - COALESCE(a.paid, 0), 0)), 0)::float8 AS amount
      FROM "Company" c
      JOIN LATERAL (
             SELECT "totalAmount" FROM "CompanyServiceTerm" st
              WHERE st."companyId" = c.id AND st."effectiveTo" IS NULL
              ORDER BY st."effectiveFrom" DESC LIMIT 1
           ) t ON true
      LEFT JOIN LATERAL (
             SELECT sum(pa.amount) AS paid
               FROM "Payment" p
               JOIN "PaymentAllocation" pa ON pa."paymentId" = p.id
              WHERE p."companyId" = c.id AND p."deletedAt" IS NULL
                AND p.period = to_char(CURRENT_DATE, 'YYYY-MM')
           ) a ON true
     WHERE c."isActive" AND NOT c."isOwnFirm"
       AND t."totalAmount" - COALESCE(a.paid, 0) > 0
       AND NOT EXISTS (SELECT 1 FROM "TelegramGroup" g WHERE g."companyId" = c.id)`;

  const silent = silentDebtors[0] ?? { cnt: 0, amount: 0 };

  checks.push({
    key: "reminders-unreachable",
    title: "Qarzdorlarning hammasiga eslatma yetadi",
    status: n(silent.cnt) === 0 ? "ok" : "warn",
    value: n(silent.amount),
    detail:
      n(silent.cnt) === 0
        ? "Joriy oyda qarzi bor har bir firmaning Telegram guruhi bor"
        : `${silent.cnt} ta qarzdor firmada Telegram guruhi yo'q — ularga avtomatik ` +
          `eslatma BORMAYDI (jami qarz shu firmalarda)`,
    action:
      n(silent.cnt) > 0
        ? "Firma guruhini botga ulang (/bind) yoki bu mijozlarga qo'lda bog'laning"
        : undefined,
  });

  // ── Slot ustunlari va biriktiruv jadvali ──────────────────────────────
  //
  // `Company.accountantId/...Perc` — KESH; haqiqiy manba `ContractAssignment`
  // (oylik endi shundan o'qiydi, qarang lib/kpiLogic.ts). Ikkalasi ajralib
  // ketsa ekranda bir raqam, oylikda boshqasi chiqadi — va bu farq hech
  // qayerda ko'rinmasdi.
  const slotDrift = await db.$queryRaw<{ cnt: number }[]>`
    SELECT count(*)::int AS cnt
      FROM "Company" c
      JOIN "ContractAssignment" a ON a."companyId" = c.id AND a."isActive"
     WHERE c."isActive" AND NOT c."isOwnFirm"
       AND (
         (a.role IN ('accountant')
            AND (c."accountantId" IS DISTINCT FROM a."userId"
                 OR COALESCE(c."accountantPerc", c."accountantSum", 0) <> a."salaryValue"))
      OR (a.role IN ('chief', 'chief_accountant')
            AND (c."chiefAccountantId" IS DISTINCT FROM a."userId"
                 OR COALESCE(c."chiefAccountantPerc", c."chiefAccountantSum", 0) <> a."salaryValue"))
      OR (a.role IN ('controller', 'supervisor')
            AND (c."supervisorId" IS DISTINCT FROM a."userId"
                 OR COALESCE(c."supervisorPerc", c."supervisorSum", 0) <> a."salaryValue"))
      OR (a.role IN ('bank_manager', 'bank_client')
            AND (c."bankClientId" IS DISTINCT FROM a."userId"
                 OR COALESCE(c."bankClientPerc", c."bankClientSum", 0) <> a."salaryValue"))
       )`;

  const drifted = n(slotDrift[0]?.cnt);

  checks.push({
    key: "assignment-slot-drift",
    title: "Biriktiruv jadvali firma ustunlariga mos",
    status: drifted === 0 ? "ok" : "warn",
    value: drifted,
    detail:
      drifted === 0
        ? "Har bir biriktiruv firma kartochkasidagi qiymat bilan bir xil"
        : `${drifted} o'rinda biriktiruv qiymati firma ustunidan farq qiladi — ` +
          `oylik BIRIKTIRUV bo'yicha hisoblanadi, kartochkada esa eski raqam ko'rinadi`,
    action: drifted > 0 ? "Firma kartochkasi → Jamoa tabini ochib qayta saqlang" : undefined,
  });

  return checks;
}

export const worstStatus = (checks: ReconCheck[]): CheckStatus =>
  checks.some((c) => c.status === "error") ? "error"
  : checks.some((c) => c.status === "warn") ? "warn"
  : "ok";
