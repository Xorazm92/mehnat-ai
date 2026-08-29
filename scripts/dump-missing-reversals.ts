import "./load-env";
import { prisma } from "@/lib/prisma";
async function main() {
  const r = await prisma.$queryRaw<Array<{
    id: string; debit: Prisma.Decimal; credit: Prisma.Decimal;
    description: string | null; sourceTable: string | null;
    sourceId: string | null; transactionId: string;
  }>>`
    SELECT id, debit, credit, description, "sourceTable", "sourceId", "transactionId"
      FROM "LedgerEntry"
     WHERE "accountId" = 'CASH'
       AND period = '2026-07'
       AND ("sourceTable" LIKE '%-reversal' OR description LIKE '%re-baseline%')
     ORDER BY id
  `;
  console.log(`Found ${r.length} rows:`);
  for (const row of r) {
    console.log(`{ sourceTable: "${row.sourceTable}", sourceId: "${row.sourceId?.slice(0,8)}", originalDebit: ${Number(row.debit)}, originalCredit: ${Number(row.credit)}, description: "${row.description?.replace(/"/g, '\\"')}", transactionId: "${row.transactionId}" },`);
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
