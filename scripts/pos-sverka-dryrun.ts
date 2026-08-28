import "./load-env";
import { prisma } from "@/lib/prisma";
import { classifySettlement, settlementSign, CHANNEL_LABELS } from "@/lib/pos/classifySettlement";

// QURUQ ISHGA TUSHIRISH: bazadagi haqiqiy vipiska qatorlarida klassifikator
// nimani taniydi. Hech narsa yozmaydi.
async function main() {
  const txs = await prisma.bankTransaction.findMany({
    select: { direction: true, amount: true, purpose: true },
    take: 20000,
  });
  const by = new Map<string, { n: number; sum: number; channel: string }>();
  let skipped = 0;
  for (const tx of txs) {
    const info = classifySettlement(tx.purpose);
    const sign = settlementSign(tx.direction as "income" | "expense", info);
    if (sign === 0) { skipped++; continue; }
    const k = info.terminalCode;
    const e = by.get(k) ?? { n: 0, sum: 0, channel: info.channel };
    e.n++; e.sum += sign * Number(tx.amount);
    by.set(k, e);
  }
  console.log(`Jami qator: ${txs.length} · sverkaga kirdi: ${txs.length - skipped} · chetda: ${skipped}`);
  const rows = [...by.entries()].sort((a, b) => b[1].sum - a[1].sum);
  for (const [code, e] of rows.slice(0, 25)) {
    console.log(`  ${code.padEnd(26)} ${CHANNEL_LABELS[e.channel as keyof typeof CHANNEL_LABELS].padEnd(12)} ${e.n.toString().padStart(5)} qator  ${e.sum.toLocaleString("ru-RU").padStart(18)}`);
  }
  await prisma.$disconnect();
}
main();
