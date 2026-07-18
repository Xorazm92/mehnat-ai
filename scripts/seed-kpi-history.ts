/**
 * Seed a compact 5-month KPI history so the leaderboard's 6-month dynamics
 * line has real data. Duplicates ~25% of the current month's performances into
 * each of the 5 prior months with a small score drift (a realistic upward
 * trend). source='system', status='approved'. Idempotent: clears prior-month
 * system rows first (keeps the current month intact).
 *
 * Run: npx tsx scripts/seed-kpi-history.ts
 */
import "./load-env"; // must be first: loads DATABASE_URL before Prisma is used
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

function monthKey(offset: number) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

async function main() {
  const current = monthKey(0);
  const priorMonths = [1, 2, 3, 4, 5].map(monthKey);

  const cleared = await prisma.monthlyPerformance.deleteMany({ where: { month: { in: priorMonths }, source: "system" } });

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
        calculatedScore: new Prisma.Decimal(sc), source: "system", status: "approved",
        submittedAt: now, approvedAt: now, recordedAt: now,
      };
    });
    // skipDuplicates: the clear above only removes source='system' rows, so a real
    // entry on the same natural key must survive — and that key is UNIQUE since ADR-0004.
    const res = await prisma.monthlyPerformance.createMany({ data: rows, skipDuplicates: true });
    total += res.count;
  }

  console.log(`Cleared ${cleared.count} prior system rows; inserted ${total} history rows across 5 months.`);
}
main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
