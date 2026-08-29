import "./load-env";
import { prisma } from "@/lib/prisma";

async function main() {
  console.log("═".repeat(60));
  console.log("TO'LIQ MOLIYA AUDITI: CASH BALANCE RECONCILIATION");
  console.log("═".repeat(60));

  // 1. HAR BIR MANBA JADVAL BO'YICHA BALANS
  const kassa = await prisma.$queryRaw<Array<{income: number; expense: number}>>`
    SELECT
      coalesce(sum(CASE WHEN type = 'income'  AND status = 'approved' THEN amount ELSE 0 END), 0)::float8 as income,
      coalesce(sum(CASE WHEN type = 'expense'  AND status = 'approved' THEN amount ELSE 0 END), 0)::float8 as expense
    FROM "KassaEntry"
    WHERE "deletedAt" IS NULL
  `;
  const payment = await prisma.$queryRaw<Array<{total: number}>>`
    SELECT coalesce(sum(amount), 0)::float8 as total
    FROM "Payment"
    WHERE "deletedAt" IS NULL AND status IN ('paid', 'partial')
  `;
  const expense = await prisma.$queryRaw<Array<{total: number}>>`
    SELECT coalesce(sum(amount), 0)::float8 as total
    FROM "Expense"
    WHERE "deletedAt" IS NULL AND status = 'approved'
  `;
  const payout = await prisma.$queryRaw<Array<{total: number}>>`
    SELECT coalesce(sum(amount), 0)::float8 as total
    FROM "Payout"
    WHERE "deletedAt" IS NULL
  `;
  const ledger = await prisma.$queryRaw<Array<{net: number}>>`
    SELECT coalesce(sum(debit) - sum(credit), 0)::float8 as net
    FROM "LedgerEntry"
    WHERE "accountId" = 'CASH'
  `;

  const ki = Number(kassa[0]?.income ?? 0);
  const ke = Number(kassa[0]?.expense ?? 0);
  const pay = Number(payment[0]?.total ?? 0);
  const exp = Number(expense[0]?.total ?? 0);
  const po  = Number(payout[0]?.total ?? 0);
  const led = Number(ledger[0]?.net ?? 0);

  const src = ki - ke + pay - exp - po;
  const drift = src - led;

  console.log("\n1. MANBA JADVALLAR:");
  console.log(`   KassaEntry income  : +${ki.toLocaleString()}`);
  console.log(`   KassaEntry expense : -${ke.toLocaleString()}`);
  console.log(`   KassaEntry net    : ${(ki - ke).toLocaleString()}`);
  console.log(`   Payment (inflow)  : +${pay.toLocaleString()}`);
  console.log(`   Expense (outflow) : -${exp.toLocaleString()}`);
  console.log(`   Payout (outflow)  : -${po.toLocaleString()}`);
  console.log(`   ─────────────────────────────`);
  console.log(`   MANBA JAMI (src) : ${src.toLocaleString()}`);
  console.log(`   JURNAL CASH net  : ${led.toLocaleString()}`);
  console.log(`   TAFOVUT (drift)  : ${drift.toLocaleString()}`);

  // 2. RECOVERY SCRIPT BILAN TAQQOSLASH
  console.log("\n2. RECOVERY SCRIPT TAQQOSLASHI:");
  console.log(`   Recovery source   : -784,556,431`);
  console.log(`   Biz hisobladik   : ${src.toLocaleString()}`);
  console.log(`   Farq             : ${(src - (-784556431)).toLocaleString()}`);

  // 3. LEDGER PERIOD BREAKDOWN
  console.log("\n3. JURNAL DAVR BO'YICHA:");
  const periodLedger = await prisma.$queryRaw<Array<{period: string; net: number}>>`
    SELECT period, (sum(debit) - sum(credit))::float8 as net
    FROM "LedgerEntry"
    WHERE "accountId" = 'CASH'
    GROUP BY period ORDER BY period
  `;
  for (const r of periodLedger) {
    console.log(`   ${r.period}: ${r.net.toLocaleString()}`);
  }

  // 4. KASSA ENTRY PERIOD BREAKDOWN
  console.log("\n4. KASSAENTRY DAVR BO'YICHA:");
  const periodKassa = await prisma.$queryRaw<Array<{period: string; income: number; expense: number}>>`
    SELECT
      to_char(date, 'YYYY-MM') as period,
      sum(CASE WHEN type = 'income'  AND status = 'approved' THEN amount ELSE 0 END)::float8 as income,
      sum(CASE WHEN type = 'expense' AND status = 'approved' THEN amount ELSE 0 END)::float8 as expense
    FROM "KassaEntry"
    WHERE "deletedAt" IS NULL
    GROUP BY period ORDER BY period
  `;
  for (const r of periodKassa) {
    console.log(`   ${r.period}: income=${r.income.toLocaleString()} expense=${r.expense.toLocaleString()} net=${(r.income - r.expense).toLocaleString()}`);
  }

  // 5. THRESHOLD TEXSHIRISH
  console.log("\n5. THRESHOLD TEXSHIRISH:");
  const threshold = 2000000;
  if (Math.abs(drift) <= threshold) {
    console.log(`   ✓ TAFOVUT ${drift.toLocaleString()} so'm — threshold (${threshold.toLocaleString()}) ichida`);
  } else {
    console.log(`   ✗ TAFOVUT ${drift.toLocaleString()} so'm — threshold (${threshold.toLocaleString()}) oshdi`);
    console.log(`   ✗ Kerakli tuzatish: ${Math.abs(drift - threshold).toLocaleString()} so'm`);
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
