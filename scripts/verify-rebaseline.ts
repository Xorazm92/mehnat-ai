/**
 * RE-BASELINE TEKSHIRUVI — o'qish uchun, hech narsa yozmaydi.
 *
 *   npx tsx scripts/verify-rebaseline.ts
 *
 * Bank kirim tozalangandan va 1C kesimlari yozilgandan keyingi holat.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { getLedgerCashBalance } from "@/lib/ledger";
import { formatNum as som } from "@/lib/platform/format";

async function main(): Promise<void> {
  const [allocGroups, imports, snapshots, openings, cash] = await Promise.all([
    prisma.paymentAllocation.groupBy({
      by: ["source"],
      _count: true,
      _sum: { amount: true },
    }),
    prisma.bankStatementImport.count(),
    prisma.debtSnapshot.groupBy({ by: ["asOf"], _count: true, _sum: { debt: true, advance: true } }),
    prisma.contract.findMany({
      where: { openingDebtAt: { not: null } },
      select: { openingDebt: true },
    }),
    getLedgerCashBalance(prisma as never),
  ]);

  console.log("═".repeat(60));
  console.log("TAQSIMOTLAR (kirim manbalari):");
  for (const g of allocGroups) {
    console.log(`   ${g.source.padEnd(8)}: ${String(g._count).padStart(4)} ta / ${som(Number(g._sum.amount ?? 0))} so'm`);
  }
  console.log(`VIPISKA YUKLAMALARI       : ${imports} ta`);
  console.log(`JURNAL CASH QOLDIG'I      : ${som(cash)} so'm`);

  console.log("─".repeat(60));
  console.log("1C KESIMLARI (DebtSnapshot):");
  for (const s of snapshots.sort((a, b) => a.asOf.getTime() - b.asOf.getTime())) {
    console.log(
      `   ${s.asOf.toISOString().slice(0, 10)}: ${s._count} qator · qarz ${som(Number(s._sum.debt ?? 0))} · avans ${som(Number(s._sum.advance ?? 0))}`
    );
  }
  const openSum = openings.reduce((s, c) => s + Number(c.openingDebt ?? 0), 0);
  console.log(`BOSHLANG'ICH QARZ         : ${openings.length} ta shartnoma / ${som(openSum)} so'm`);
  console.log("═".repeat(60));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
