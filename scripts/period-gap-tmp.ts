import "./load-env";
import { prisma } from "@/lib/prisma";
async function main() {
  // Jurnal davrlari
  const ledgers = await prisma.$queryRaw<Array<{period:string; net:number}>>`
    SELECT period, sum(debit - credit)::float8 as net
      FROM "LedgerEntry"
     WHERE "accountId" = 'CASH'
     GROUP BY period
     ORDER BY period
  `;
  // KassaEntry davrlari
  const kassa = await prisma.$queryRaw<Array<{period:string; net:number}>>`
    SELECT to_char(date, 'YYYY-MM') as period,
           sum(CASE WHEN type='income' THEN amount ELSE -amount END)::float8 as net
      FROM "KassaEntry"
     WHERE "deletedAt" IS NULL AND status='approved'
     GROUP BY period
     ORDER BY period
  `;
  // Payment davrlari
  const payments = await prisma.$queryRaw<Array<{period:string; net:number}>>`
    SELECT period, sum(amount)::float8 as net
      FROM "Payment"
     WHERE "deletedAt" IS NULL AND status IN ('paid','partial')
     GROUP BY period
     ORDER BY period
  `;
  // Expense davrlari
  const expenses = await prisma.$queryRaw<Array<{period:string; net:number}>>`
    SELECT to_char(date, 'YYYY-MM') as period, -sum(amount)::float8 as net
      FROM "Expense"
     WHERE "deletedAt" IS NULL AND status='approved'
     GROUP BY period
     ORDER BY period
  `;
  // Payout davrlari (paidAt → paid_at)
  const payouts = await prisma.$queryRaw<Array<{period:string; net:number}>>`
    SELECT to_char("paidAt", 'YYYY-MM') as period, -sum(amount)::float8 as net
      FROM "Payout"
     WHERE "deletedAt" IS NULL
     GROUP BY period
    ORDER BY period
  `;

  // Merge
  const map = new Map<string, {src: number; led: number}>();
  for (const r of kassa) { map.set(r.period, { src: (map.get(r.period)?.src ?? 0) + r.net, led: map.get(r.period)?.led ?? 0 }); }
  for (const r of payments) { map.set(r.period, { src: (map.get(r.period)?.src ?? 0) + r.net, led: map.get(r.period)?.led ?? 0 }); }
  for (const r of expenses) { map.set(r.period, { src: (map.get(r.period)?.src ?? 0) + r.net, led: map.get(r.period)?.led ?? 0 }); }
  for (const r of payouts) { map.set(r.period, { src: (map.get(r.period)?.src ?? 0) + r.net, led: map.get(r.period)?.led ?? 0 }); }
  for (const r of ledgers) { const cur = map.get(r.period) ?? { src: 0, led: 0 }; map.set(r.period, { ...cur, led: r.net }); }

  console.log("Davr          Manba                    Jurnal                   Farq");
  let totalSrc=0, totalLed=0;
  for (const [period, v] of [...map.entries()].sort()) {
    const farq = v.src - v.led;
    if (Math.abs(farq) > 10) {
      console.log(`${period}  ${v.src.toLocaleString().padStart(20)}  ${v.led.toLocaleString().padStart(20)}  ${farq.toLocaleString().padStart(15)}`);
    }
    totalSrc += v.src;
    totalLed += v.led;
  }
  console.log(`\nJAMI:  ${totalSrc.toLocaleString().padStart(20)}  ${totalLed.toLocaleString().padStart(20)}  ${(totalSrc-totalLed).toLocaleString().padStart(15)}`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
