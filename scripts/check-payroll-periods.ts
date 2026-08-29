import "./load-env";
import { prisma } from "@/lib/prisma";

async function main() {
  // PAYROLL obligations by period
  const r = await prisma.$queryRaw<Array<{period: string; status: string; cnt: number}>>`
    SELECT o."periodKey" as period, o.status, count(*)::int as cnt
    FROM "Obligation" o
    JOIN "DeadlineTemplate" t ON t.id = o."templateId"
    WHERE t.code IN ('PAYROLL_CALC', 'PAYROLL_POSTED')
    GROUP BY o."periodKey", o.status
    ORDER BY o."periodKey", o.status
  `;
  console.log("PAYROLL obligations by period/status:");
  for (const row of r) console.log(`  ${row.period} | ${row.status}: ${row.cnt}`);

  const r2 = await prisma.$queryRaw<Array<{total: number}>>`
    SELECT count(*)::int as total
    FROM "Obligation" o
    JOIN "DeadlineTemplate" t ON t.id = o."templateId"
    WHERE t.code IN ('PAYROLL_CALC', 'PAYROLL_POSTED')
      AND o.status NOT IN ('accepted', 'cancelled', 'rejected')
  `;
  console.log(`\nJami ochiq: ${r2[0]?.total ?? 0}`);

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
