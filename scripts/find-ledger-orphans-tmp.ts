import "./load-env";
import { prisma } from "@/lib/prisma";

async function main() {
  // July CASH ledger entries that have NO corresponding source record
  const orphans = await prisma.$queryRaw<Array<{
    ledger_id: string; source_table: string | null; source_id: string | null;
    debit: number; credit: number; description: string | null;
  }>>`
    SELECT l.id as ledger_id, l."sourceTable" as source_table, l."sourceId" as source_id,
           l.debit, l.credit, l.description
      FROM "LedgerEntry" l
     WHERE l."accountId" = 'CASH'
       AND l.period = '2026-07'
       AND (
         l."sourceTable" IS NULL
         OR l."sourceTable" = 'unknown_source'
         OR NOT EXISTS (
           SELECT 1 FROM "KassaEntry" k WHERE k.id = l."sourceId" AND l."sourceTable" = 'KassaEntry'
           UNION ALL
           SELECT 1 FROM "Payment" p WHERE p.id = l."sourceId" AND l."sourceTable" = 'Payment'
           UNION ALL
           SELECT 1 FROM "Expense" e WHERE e.id = l."sourceId" AND l."sourceTable" = 'Expense'
           UNION ALL
           SELECT 1 FROM "Payout" o WHERE o.id = l."sourceId" AND l."sourceTable" = 'Payout'
         )
       )
     ORDER BY l.id
  `;

  console.log(`July CASH ledger — manbasiz yozuvlar: ${orphans.length} ta`);
  let total = 0;
  for (const r of orphans) {
    const net = Number(r.debit) - Number(r.credit);
    total += net;
    console.log(`  ${r.ledger_id.slice(0,8)} | ${(r.source_table ?? 'NULL').padEnd(12)} | ${r.source_id?.slice(0,8) ?? 'NULL'} | Dr:${Number(r.debit).toLocaleString().padStart(12)} Cr:${Number(r.credit).toLocaleString().padStart(12)} | ${r.description ?? ''}`);
  }
  console.log(`\nJami net ta'sir: ${total.toLocaleString()}`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
