import "./load-env";
import { prisma } from "@/lib/prisma";
async function main() {
  const r = await prisma.$queryRaw<Array<{id: string; debit: string; credit: string; description: string | null; period: string; createdBy: string | null}>>`
    SELECT id, debit::text, credit::text, description, period, "createdBy"
    FROM "LedgerEntry"
    WHERE "createdBy" LIKE '%fix%' OR description LIKE '%fix%'
    ORDER BY "createdAt" DESC
    LIMIT 20
  `;
  console.log(`Found ${r.length} entries:`);
  for (const row of r) {
    console.log(`  ${row.period} | Dr:${row.debit} Cr:${row.credit} | ${row.description} | by:${row.createdBy}`);
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
