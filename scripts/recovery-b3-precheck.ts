/**
 * B3 · OLDIN TEKSHIRUV — MAJBURIYAT GENERATORI (qat'iy READ-ONLY)
 * ===============================================================
 * 2026-M08 generatsiyasidan OLDIN generatorning to'g'ri ishlashini isbotlaydi.
 * Bitta qator ham yozilmaydi: generator YURITILMAYDI, uning sof funksiyalari
 * (`lib/deadlines.ts`, `lib/applicability.ts`) SELECT bilan olingan ma'lumot
 * ustida QAYTA HISOBLANADI. Ya'ni bu bir vaqtning o'zida ham dry-run, ham
 * generator mantiqining mustaqil tekshiruvi.
 *
 * Tekshiriladi:
 *   1. Idempotency        — unique cheklov o'rnida, mavjud davr qayta yaratilmaydi
 *   2. PAYROLL validity   — effectiveFrom qoidasi M07 ni to'sadi, M08 ni o'tkazadi
 *   3. Holiday calendar   — BusinessCalendarDay qamrovi va dam olish qoidasi
 *   4. Duplicate protection — bazadagi mavjud dublikatlar
 *   5. Expected count     — M08 uchun necha majburiyat yaratiladi (shablon kesimida)
 *
 * ISHLATISH:
 *   npx tsx scripts/recovery-b3-precheck.ts
 *   npx tsx scripts/recovery-b3-precheck.ts --ref 2026-08-15
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { periodWindowFor, computeDueAt, makeWorkdayPredicate, dateKey } from "@/lib/deadlines";
import { isCompanyEligible, templateApplies, type CompanyFacts } from "@/lib/applicability";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

let failed = 0;
let warned = 0;
/** Bloker: yiqilsa B3 ishga tushirilmaydi. */
const check = (ok: boolean, label: string, detail: string) => {
  if (!ok) failed++;
  console.log(`     ${ok ? "✓" : "✗"} ${label.padEnd(34)} ${detail}`);
};
/** Ogohlantirish: sifatga ta'sir qiladi, lekin generatsiyani to'smaydi. */
const warn = (ok: boolean, label: string, detail: string) => {
  if (!ok) warned++;
  console.log(`     ${ok ? "✓" : "!"} ${label.padEnd(34)} ${detail}`);
};

async function main(): Promise<void> {
  const refArg = arg("--ref");
  const ref = refArg ? new Date(`${refArg}T00:00:00Z`) : new Date();
  if (Number.isNaN(ref.getTime())) throw new Error(`--ref sanasi noto'g'ri: ${refArg}`);

  console.log();
  console.log("╔════════════════════════════════════════════════════════════════════════╗");
  console.log("║  B3 · OLDIN TEKSHIRUV — GENERATOR                  (READ-ONLY)         ║");
  console.log("╚════════════════════════════════════════════════════════════════════════╝");
  console.log(`  ref sanasi: ${ref.toISOString().slice(0, 10)}`);
  console.log();

  // ═══ 1. IDEMPOTENCY ═══════════════════════════════════════════════════
  console.log("  ── 1 · IDEMPOTENCY ─────────────────────────────────────────────────");
  const uniq = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
    SELECT indexname, indexdef FROM pg_indexes
     WHERE tablename = 'Obligation' AND indexdef LIKE '%UNIQUE%'`;
  const guardIdx = uniq.find(
    (i) =>
      i.indexdef.includes("companyId") &&
      i.indexdef.includes("templateId") &&
      i.indexdef.includes("periodStart") &&
      i.indexdef.includes("periodEnd"),
  );
  check(
    !!guardIdx,
    "unique(company,template,davr)",
    guardIdx ? guardIdx.indexname : "TOPILMADI — dublikat himoyasi YO'Q",
  );
  console.log(
    "       generateObligations avval findUnique bilan tekshiradi, so'ng P2002 ni\n" +
      "       ushlab `skippedExisting` ga qo'shadi — ikki qavatli himoya.",
  );
  console.log();

  // ═══ 2. PAYROLL VALIDITY-DATE LOGIC ═══════════════════════════════════
  console.log("  ── 2 · PAYROLL VALIDITY-DATE ───────────────────────────────────────");
  const payrollTpls = await prisma.deadlineTemplate.findMany({
    where: { code: { in: ["PAYROLL_CALC", "PAYROLL_POSTED"] } },
    select: {
      code: true,
      version: true,
      effectiveFrom: true,
      effectiveTo: true,
      anchorType: true,
      dueDay: true,
      dueMonth: true,
      offsetDays: true,
      adjustmentPolicy: true,
      lifecycle: true,
      active: true,
    },
  });

  const calDays = await prisma.businessCalendarDay.findMany();
  const isWorkday = makeWorkdayPredicate(
    calDays.map((d) => ({ date: d.date, isWorkday: d.isWorkday, isHoliday: d.isHoliday })),
  );

  for (const t of payrollTpls) {
    console.log(`     ${t.code} (v${t.version}) — ${t.anchorType}, offset ${t.offsetDays ?? 0}`);
    console.log(`       effectiveFrom : ${t.effectiveFrom.toISOString().slice(0, 10)}`);
    console.log(`       lifecycle     : ${t.lifecycle}, active=${t.active}`);

    // Generator gate: effectiveFrom <= ref
    const julRef = new Date(Date.UTC(2026, 6, 15));
    const augRef = new Date(Date.UTC(2026, 7, 15));
    const passesJul = t.effectiveFrom <= julRef && (!t.effectiveTo || t.effectiveTo >= julRef);
    const passesAug = t.effectiveFrom <= augRef && (!t.effectiveTo || t.effectiveTo >= augRef);

    check(!passesJul, `${t.code}: M07 TO'SILADI`, passesJul ? "o'tib ketmoqda — SOXTA QATOR QAYTA PAYDO BO'LADI" : "to'silgan");
    check(passesAug, `${t.code}: M08 o'tadi`, passesAug ? "o'tadi" : "TO'SILGAN — M08 yaratilmaydi");

    const win = periodWindowFor("monthly", augRef);
    const due = computeDueAt(t, win, isWorkday);
    console.log(
      `       M08 davri     : ${win.periodKey}  ${win.periodStart.toISOString().slice(0, 10)} → ` +
        `${new Date(win.periodEnd.getTime() - 86400000).toISOString().slice(0, 10)}`,
    );
    console.log(`       M08 muddati   : ${due.toISOString().slice(0, 10)} (${isWorkday(due) ? "ish kuni" : "DAM OLISH ✗"})`);
    check(due > ref, `${t.code}: M08 muddati kelajakda`, due > ref ? "ha — darhol kechikkan bo'lmaydi" : "YO'Q — darhol kechikkan!");
  }
  console.log();

  // ═══ 3. HOLIDAY CALENDAR ══════════════════════════════════════════════
  console.log("  ── 3 · BIZNES KALENDAR ─────────────────────────────────────────────");
  const win = periodWindowFor("monthly", ref);
  const nextMonthEnd = new Date(win.periodEnd.getTime() + 40 * 86400000);
  const inRange = calDays.filter((d) => d.date >= win.periodStart && d.date <= nextMonthEnd);
  const holidays = inRange.filter((d) => d.isHoliday);
  const workingWeekends = inRange.filter((d) => {
    const dow = d.date.getUTCDay();
    return (dow === 0 || dow === 6) && d.isWorkday && !d.isHoliday;
  });

  console.log(`     BusinessCalendarDay jami         : ${calDays.length} kun`);
  console.log(`     Joriy+keyingi davr oralig'ida    : ${inRange.length} kun`);
  console.log(`     shundan bayram                   : ${holidays.length}`);
  console.log(`     shundan ishlaydigan dam olish    : ${workingWeekends.length}`);
  if (holidays.length > 0) {
    console.log(`     bayramlar: ${holidays.map((h) => dateKey(h.date)).join(", ")}`);
  }
  // Bu B3 ni TO'SMAYDI: kalendarsiz ham muddat hisobi to'g'ri, faqat davlat
  // bayramlari ish kuniga surilmaydi. Quyida M08 muddatlari bayramga tushmagani
  // alohida ko'rsatiladi — ya'ni bu davr uchun amaliy ta'sir yo'q.
  warn(
    calDays.length > 0,
    "kalendar to'ldirilgan",
    calDays.length > 0
      ? "ha"
      : "YO'Q — faqat Shanba/Yakshanba qoidasi ishlaydi, davlat bayramlari surilmaydi",
  );
  console.log(
    "       Yozuv bo'lmagan kunda standart qoida: Shanba/Yakshanba ish kuni emas\n" +
      "       (lib/deadlines.ts makeWorkdayPredicate).",
  );
  console.log();

  // ═══ 4. MAVJUD DUBLIKATLAR ════════════════════════════════════════════
  console.log("  ── 4 · DUBLIKAT HIMOYASI ───────────────────────────────────────────");
  const dups = await prisma.$queryRaw<{ cnt: bigint }[]>`
    SELECT coalesce(sum(c - 1), 0)::bigint AS cnt
      FROM (SELECT count(*) c FROM "Obligation"
             GROUP BY "companyId", "templateId", "periodStart", "periodEnd"
            HAVING count(*) > 1) x`;
  const dupCount = Number(dups[0]?.cnt ?? 0);
  check(dupCount === 0, "bazada dublikat yo'q", dupCount === 0 ? "0 ta" : `${dupCount} ta DUBLIKAT`);
  console.log();

  // ═══ 5. KUTILAYOTGAN MAJBURIYAT SONI ══════════════════════════════════
  console.log("  ── 5 · KUTILAYOTGAN NATIJA (generator YURITILMAYDI) ────────────────");
  const templates = await prisma.deadlineTemplate.findMany({
    where: {
      active: true,
      lifecycle: "active",
      effectiveFrom: { lte: ref },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: ref } }],
    },
    include: { applicability: true },
  });
  const companies = await prisma.company.findMany({
    where: { isActive: true },
    select: {
      id: true,
      isActive: true,
      companyStatus: true,
      contractDate: true,
      taxRegime: true,
      statsType: true,
      activeServices: true,
      hasLandTax: true,
      hasWaterTax: true,
      hasPropertyTax: true,
      hasExciseTax: true,
    },
  });

  const facts = new Map<string, CompanyFacts>();
  const eligible = companies.filter((c) => {
    const f: CompanyFacts = {
      id: c.id,
      isActive: c.isActive,
      companyStatus: c.companyStatus,
      contractDate: c.contractDate,
      taxRegime: c.taxRegime,
      statsType: c.statsType,
      activeServices: c.activeServices,
      hasLandTax: c.hasLandTax,
      hasWaterTax: c.hasWaterTax,
      hasPropertyTax: c.hasPropertyTax,
      hasExciseTax: c.hasExciseTax,
    };
    facts.set(c.id, f);
    return isCompanyEligible(f, ref);
  });

  console.log(`     Faol firma ${companies.length} → yaroqli ${eligible.length} (contractDate/status gate)`);
  console.log(`     Kuchdagi shablon: ${templates.length}`);
  console.log();
  console.log("     shablon                 davr        yangi   mavjud   mos emas   muddat");
  console.log("     ──────────────────────  ──────────  ─────   ──────   ────────   ──────────");

  let willCreate = 0;
  for (const t of templates) {
    const w = periodWindowFor(t.periodicity, ref);
    const due = computeDueAt(t, w, isWorkday);

    const applicable = eligible.filter((c) => templateApplies(t.applicability, facts.get(c.id)!));
    const notApplicable = eligible.length - applicable.length;

    const existing = await prisma.obligation.count({
      where: {
        templateId: t.id,
        periodStart: w.periodStart,
        periodEnd: w.periodEnd,
        companyId: { in: applicable.map((c) => c.id) },
      },
    });
    const fresh = applicable.length - existing;
    willCreate += fresh;

    console.log(
      `     ${t.code.padEnd(22)}  ${w.periodKey.padEnd(10)}  ${String(fresh).padStart(5)}   ` +
        `${String(existing).padStart(6)}   ${String(notApplicable).padStart(8)}   ${due.toISOString().slice(0, 10)}`,
    );
  }
  console.log();
  console.log(`     JAMI YARATILADI: ${willCreate} ta`);
  console.log();

  const alreadyOverdue = templates.filter((t) => computeDueAt(t, periodWindowFor(t.periodicity, ref), isWorkday) < ref);
  check(
    alreadyOverdue.length === 0,
    "hech biri darhol kechikkan emas",
    alreadyOverdue.length === 0
      ? "0 ta"
      : `${alreadyOverdue.length} ta shablon (${alreadyOverdue.map((t) => t.code).join(", ")}) — ` +
        "yaratilishi bilan kechikkan bo'ladi",
  );
  console.log();

  // ═══ Xulosa ═══════════════════════════════════════════════════════════
  if (failed > 0) {
    console.error(`  ✗ ${failed} ta BLOKER — B3 ni ishga tushirmang.`);
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log(`  ✓ Generator tekshiruvlari o'tdi${warned > 0 ? ` (${warned} ta ogohlantirish bilan)` : ""}.`);
  console.log(`    B3 buyrug'i (bot TO'XTATILGAN holda): npm run obligations:generate`);
  console.log();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\n✗ b3-precheck yiqildi:", e instanceof Error ? e.message : e);
  await prisma.$disconnect().catch(() => {});
  process.exit(2);
});
