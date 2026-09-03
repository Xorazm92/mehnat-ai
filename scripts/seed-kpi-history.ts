/**
 * DEMO ma'lumot: reyting grafigi bo'sh turmasligi uchun 5 oylik KPI tarixi.
 *
 * DIQQAT — BU SOXTA MA'LUMOT. Ilgari u `status='approved', source='system'`
 * yozardi, ya'ni `Math.random()` bilan buzilgan qatorlar OYLIK O'QIYDIGAN
 * ma'lumotga aylanardi (lib/kpiLogic.ts faqat `approved` ni oladi) va haqiqiy
 * bahodan farq qilmasdi. Endi:
 *
 *   - `status='draft'`, `source='demo'` — oylik bunday qatorni ko'rmaydi;
 *   - prod bazada umuman ishga tushmaydi (pastdagi qo'riqchi);
 *   - tozalash ham faqat O'ZI yozgan `source='demo'` qatorlarni o'chiradi
 *     (avval `source='system'` ni o'chirardi — ya'ni haqiqiy avtomatik
 *     takliflarni ham yo'q qilardi).
 *
 * Eski ishga tushirishlardan qolgan soxta qatorlarni tozalash uchun:
 *   npx tsx scripts/purge-demo-kpi-history.ts
 *
 * Run: npx tsx scripts/seed-kpi-history.ts
 */
import "./load-env"; // must be first: loads DATABASE_URL before Prisma is used
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/** Soxta ma'lumot prod bazaga tushmasin. */
function assertNotProduction() {
  const url = process.env.DATABASE_URL ?? "";
  const host = url.match(/@([^:/?]+)/)?.[1] ?? "";
  const local = host === "localhost" || host === "127.0.0.1" || host === "";
  if (process.env.NODE_ENV === "production" || !local) {
    console.error(
      `✖ seed-kpi-history DEMO skripti: faqat lokal baza. Hozirgi xost: ${host || "(noma'lum)"}`
    );
    process.exit(1);
  }
}

function monthKey(offset: number) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

async function main() {
  assertNotProduction();
  const current = monthKey(0);
  const priorMonths = [1, 2, 3, 4, 5].map(monthKey);

  const cleared = await prisma.monthlyPerformance.deleteMany({ where: { month: { in: priorMonths }, source: "demo" } });

  const cur = await prisma.monthlyPerformance.findMany({
    where: { month: current, status: "approved" },
    select: { companyId: true, employeeId: true, ruleId: true, selectedOption: true, calculatedScore: true, value: true },
  });
  if (cur.length === 0) throw new Error("No current-month data to base history on.");

  const now = new Date();
  let total = 0;
  for (let i = 0; i < priorMonths.length; i++) {
    const month = priorMonths[i];
    // older months = slightly weaker performance (upward trend toward now)
    const drift = 0.15 + i * 0.08; // fraction of greens flipped to neutral in older months
    const sample = cur.filter((_, idx) => idx % 4 === i % 4); // ~25% sample, varied per month
    const rows: Prisma.MonthlyPerformanceCreateManyInput[] = sample.map((p) => {
      let sc = Number(p.calculatedScore);
      // older months: dampen positives a bit
      if (sc > 0 && Math.random() < drift) sc = 0;
      const option = sc > 0 ? "green" : sc < 0 ? "red" : "yellow";
      return {
        month, companyId: p.companyId, employeeId: p.employeeId, ruleId: p.ruleId,
        selectedOption: option, value: new Prisma.Decimal(sc > 0 ? 1 : sc < 0 ? -1 : 0),
        // draft + demo: oylik faqat `approved` ni o'qiydi, ya'ni bu qator pulga tegmaydi.
        calculatedScore: new Prisma.Decimal(sc), source: "demo", status: "draft",
        submittedAt: now, recordedAt: now,
      };
    });
    // skipDuplicates: the clear above only removes source='demo' rows, so a real
    // entry on the same natural key must survive — and that key is UNIQUE since ADR-0004.
    const res = await prisma.monthlyPerformance.createMany({ data: rows, skipDuplicates: true });
    total += res.count;
  }

  console.log(`Cleared ${cleared.count} prior system rows; inserted ${total} history rows across 5 months.`);
}
main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
