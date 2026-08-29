import "./load-env";
import { prisma } from "@/lib/prisma";

async function main() {
  // Jurnal CASH oyog'ining oylik yig'indisi
  const ledger = await prisma.$queryRaw<Array<{ period: string; net: number; cnt: number }>>`
    SELECT period, sum(debit - credit)::float8 AS net, count(*)::int AS cnt
      FROM "LedgerEntry"
     WHERE "accountId" = 'CASH'
     GROUP BY period
     ORDER BY period
  `;
  console.log("JURNAL (CASH) davr bo'yicha:");
  for (const r of ledger) {
    console.log(`  ${r.period}: ${r.net.toLocaleString().padStart(20)} (${r.cnt} ta)`);
  }
  const ledgerTotal = ledger.reduce((s, r) => s + r.net, 0);
  console.log(`  JAMI: ${ledgerTotal.toLocaleString()}\n`);

  // Manba jadvallardan oylik yig'indisi
  const src = await prisma.$queryRaw<Array<{ source: string; type: string; net: number; cnt: number }>>`
    SELECT 'KassaEntry' as source, type,
           sum(CASE WHEN type='income' THEN amount ELSE -amount END)::float8 AS net,
           count(*)::int as cnt
      FROM "KassaEntry"
     WHERE "deletedAt" IS NULL AND status='approved'
     GROUP BY type
     UNION ALL
    SELECT 'Payment' as source, 'paid' as type,
           sum(amount)::float8 AS net, count(*)::int as cnt
      FROM "Payment"
     WHERE "deletedAt" IS NULL AND status IN ('paid','partial')
     UNION ALL
    SELECT 'Expense' as source, 'expense' as type,
           -sum(amount)::float8 AS net, count(*)::int as cnt
      FROM "Expense"
     WHERE "deletedAt" IS NULL AND status='approved'
     UNION ALL
    SELECT 'Payout' as source, 'payout' as type,
           -sum(amount)::float8 AS net, count(*)::int as cnt
      FROM "Payout"
     WHERE "deletedAt" IS NULL
  `;
  console.log("MANBA jadvallar (NET = balans ta'siri):");
  let srcTotal = 0;
  for (const r of src) {
    console.log(`  ${r.source.padEnd(12)} ${r.type.padEnd(8)} ${r.net.toLocaleString().padStart(20)} (${r.cnt} ta)`);
    srcTotal += r.net;
  }
  console.log(`  JAMI: ${srcTotal.toLocaleString()}\n`);

  console.log(`TAFOVUT: ${(srcTotal - ledgerTotal).toLocaleString()}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
