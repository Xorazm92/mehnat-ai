import "./load-env";
import { prisma } from "@/lib/prisma";

async function main() {
  const r = await prisma.$queryRaw<Array<{status: string; cnt: number}>>`
    SELECT status, count(*)::int as cnt
    FROM "Obligation"
    WHERE "templateId" IN (
      SELECT id FROM "DeadlineTemplate"
      WHERE code IN ('PAYROLL_CALC', 'PAYROLL_POSTED')
    )
    GROUP BY status ORDER BY status
  `;
  console.log("PAYROLL obligations by status:");
  for (const row of r) console.log(`  ${row.status}: ${row.cnt}`);

  const r2 = await prisma.$queryRaw<Array<{templateId: string; cnt: number}>>`
    SELECT "templateId", count(*)::int as cnt
    FROM "Obligation"
    WHERE "templateId" IN (
      SELECT id FROM "DeadlineTemplate"
      WHERE code IN ('PAYROLL_CALC', 'PAYROLL_POSTED')
    )
    AND status NOT IN ('accepted', 'cancelled', 'rejected')
    GROUP BY "templateId"
  `;
  console.log("\nPAYROLL open by template:");
  for (const row of r2) console.log(`  ${row.templateId}: ${row.cnt}`);

  const r3 = await prisma.$queryRaw<Array<{code: string; effectiveFrom: Date; effectiveTo: Date | null}>>`
    SELECT code, "effectiveFrom", "effectiveTo"
    FROM "DeadlineTemplate"
    WHERE code IN ('PAYROLL_CALC', 'PAYROLL_POSTED')
  `;
  console.log("\nPAYROLL templates:");
  for (const row of r3) console.log(`  ${row.code}: effectiveFrom=${row.effectiveFrom} effectiveTo=${row.effectiveTo}`);

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
