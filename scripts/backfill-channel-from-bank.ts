/**
 * KANALSIZ CHIQIMLARNI MANBAGA BOG'LASH (bir martalik data-fix)
 * ============================================================
 *
 *   npx tsx scripts/backfill-channel-from-bank.ts            # DRY-RUN
 *   npx tsx scripts/backfill-channel-from-bank.ts --apply
 *
 * KONTEKST. Vipiskadan yozilgan chiqimlar ilgari channelId=NULL bilan
 * ketgan edi — natijada summa umumiy balansdan ayirilib, manba (firma hisobi,
 * Plastik, Cash) ichki qoldig'i O'ZGARMASDI. Endi har chiqim o'z hisobining
 * firmasi kanaliga avtomatik bog'lanadi; bu skript eski qatorlarni ham shu
 * qoida bo'yicha tuzatadi.
 *
 * NIMA BO'LADI:
 *   · KassaEntry.channelId          ← bank tx hisobining firma kanali
 *   · LedgerEntry CASH oyog'i       ← xuddi shu channelId (jurnal dimensiyasi)
 *
 * Bog'lanmaganlari (manba aniqlanmasdi) KANALSIZ qoladi va Kassalar
 * jadvalida alohida halol qator sifatida ko'rinadi.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { formatNum as som } from "@/lib/platform/format";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const rows = await prisma.kassaEntry.findMany({
    where: { deletedAt: null, channelId: null, dedupKey: { startsWith: "bank:" } },
    select: { id: true, amount: true, dedupKey: true },
  });

  // Firma → kanal xaritasi (bir marta).
  const channels = await prisma.disbursementChannel.findMany({
    where: { type: "own_firm_account", isActive: true },
    select: { id: true, ownFirmId: true, label: true },
  });
  const byFirm = new Map<string, string>();
  for (const c of channels) if (c.ownFirmId) byFirm.set(c.ownFirmId, c.id);

  let resolvable = 0;
  let resolvableSum = 0;
  const perChannel = new Map<string, number>();
  for (const r of rows) {
    const txId = r.dedupKey!.slice("bank:".length);
    const tx = await prisma.bankTransaction.findUnique({
      where: { id: txId },
      select: { account: { select: { ownerCompanyId: true } } },
    });
    const channelId = tx ? byFirm.get(tx.account.ownerCompanyId) : undefined;
    if (channelId) {
      resolvable++;
      resolvableSum += Number(r.amount);
      perChannel.set(channelId, (perChannel.get(channelId) ?? 0) + Number(r.amount));
    }
  }

  console.log("═".repeat(64));
  console.log(apply ? "REJIM: --apply" : "REJIM: DRY-RUN");
  console.log("═".repeat(64));
  console.log(`Kanalsiz bank-chiqimlar : ${rows.length} ta`);
  console.log(`Manbaga bog'lanadigan   : ${resolvable} ta / ${som(resolvableSum)} so'm`);
  for (const [chId, s] of perChannel) {
    const label = channels.find((c) => c.id === chId)?.label ?? chId;
    console.log(`   ${label.padEnd(28)} ${som(s).padStart(14)}`);
  }
  if (!apply || resolvable === 0) {
    console.log("\nHech narsa o'zgarmadi.");
    return;
  }

  let fixed = 0;
  for (const r of rows) {
    const txId = r.dedupKey!.slice("bank:".length);
    const tx = await prisma.bankTransaction.findUnique({
      where: { id: txId },
      select: { account: { select: { ownerCompanyId: true } } },
    });
    const channelId = tx ? byFirm.get(tx.account.ownerCompanyId) : undefined;
    if (!channelId) continue;

    await prisma.kassaEntry.update({ where: { id: r.id }, data: { channelId } });
    await prisma.ledgerEntry.updateMany({
      where: { sourceTable: "KassaEntry", sourceId: r.id, accountId: "CASH" },
      data: { channelId },
    });
    fixed++;
  }
  console.log(`\n✓ ${fixed} ta chiqim manbaga bog'landi (jurnal dimensiyalari bilan)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
