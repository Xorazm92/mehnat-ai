import "./load-env";
import { prisma } from "@/lib/prisma";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("═".repeat(60));
  console.log("PERIOD-BY-PERIOD RECONCILIATION (to'liq formula)");
  console.log("═".repeat(60));

  // Ledger by period
  const ledgers = await prisma.$queryRaw<Array<{period: string; led_net: number}>>`
    SELECT period, (sum(debit) - sum(credit))::float8 as led_net
    FROM "LedgerEntry"
    WHERE "accountId" = 'CASH'
    GROUP BY period ORDER BY period
  `;

  // Source by period
  const sources = await prisma.$queryRaw<Array<{period: string; src_net: number}>>`
    SELECT period, sum(net)::float8 as src_net FROM (
      SELECT to_char(date, 'YYYY-MM') as period,
             sum(CASE WHEN type='income' THEN amount ELSE -amount END) as net
        FROM "KassaEntry" WHERE "deletedAt" IS NULL AND status='approved' GROUP BY period
      UNION ALL
      SELECT period, sum(amount) as net
        FROM "Payment" WHERE "deletedAt" IS NULL AND status IN ('paid','partial') GROUP BY period
      UNION ALL
      SELECT to_char(date, 'YYYY-MM'), -sum(amount) as net
        FROM "Expense" WHERE "deletedAt" IS NULL AND status='approved' GROUP BY period
      UNION ALL
      SELECT to_char("paidAt", 'YYYY-MM'), -sum(amount) as net
        FROM "Payout" WHERE "deletedAt" IS NULL GROUP BY period
    ) sub GROUP BY period ORDER BY period
  `;

  const srcMap = new Map<string, number>();
  for (const s of sources) srcMap.set(s.period, s.src_net);

  let totalSrc = 0, totalLed = 0;
  console.log("\nDavr      JurnalNet      ManbaNet      Drift");
  for (const l of ledgers) {
    const src = srcMap.get(l.period) ?? 0;
    const drift = src - l.led_net;
    totalSrc += src;
    totalLed += l.led_net;
    const driftStr = drift >= 0 ? `+${Math.round(drift).toLocaleString()}` : Math.round(drift).toLocaleString();
    const flag = Math.abs(drift) > 2000000 ? " <<<<" : "";
    console.log(`${l.period}  ${String(Math.round(l.led_net)).padStart(13)}  ${String(Math.round(src)).padStart(13)}  ${driftStr.padStart(12)}${flag}`);
  }
  const totalDrift = totalSrc - totalLed;
  console.log(`${"JAMI".padEnd(8)}  ${String(Math.round(totalLed)).padStart(13)}  ${String(Math.round(totalSrc)).padStart(13)}  ${totalDrift >= 0 ? '+' : ''}${Math.round(totalDrift).toLocaleString()}`);
  console.log("\nRecovery script: source=-784,556,431 (KassaEntry+Payment+Expense+Payout)");
  console.log("Bizning: source=%d (faqat KassaEntry+Payment)", Math.round(totalSrc));

  if (!dryRun) {
    console.log("\n(Hech narsa yozilmadi — bu faqat hisobot)");
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
