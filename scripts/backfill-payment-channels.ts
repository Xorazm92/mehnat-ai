/**
 * KANALSIZ KIRIM JURNAL OYOQLARINI MANBAGA BOG'LASH (bir martalik)
 * ================================================================
 *
 *   npx tsx scripts/backfill-payment-channels.ts            # DRY-RUN
 *   npx tsx scripts/backfill-payment-channels.ts --apply
 *
 * Shartnoma to'lovlari jurnali (sourceTable='Payment') ilgari kanalsiz
 * yozilgan — summa umumiy balansga tushardi, lekin QAYSIGA tushgani
 * ko'rinmasdi. Har Payment taqsimotlari orqali manbani aniqlaymiz:
 *   allocation.bankTransaction → account.ownerCompanyId → firma kanali,
 * bank bo'lmasa allocation.channelId.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { formatNum as som } from "@/lib/format";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  // Firma → kanal xaritasi.
  const channels = await prisma.disbursementChannel.findMany({
    where: { type: "own_firm_account", isActive: true },
    select: { id: true, ownFirmId: true, label: true },
  });
  const byFirm = new Map<string, string>();
  for (const c of channels) if (c.ownFirmId) byFirm.set(c.ownFirmId, c.id);

  // Kanalsiz CASH oyoqli Paymentlar.
  const legs = await prisma.ledgerEntry.findMany({
    where: { sourceTable: "Payment", accountId: "CASH", channelId: null },
    select: { sourceId: true },
    distinct: ["sourceId"],
  });
  const paymentIds = [...new Set(legs.map((l) => l.sourceId).filter((v): v is string => !!v))];

  let resolvable = 0;
  let resolvableSum = 0;
  const perChannel = new Map<string, number>();
  interface Fix { paymentId: string; channelId: string }
  const fixes: Fix[] = [];

  for (const paymentId of paymentIds) {
    const allocs = await prisma.paymentAllocation.findMany({
      where: { paymentId },
      select: {
        channelId: true, amount: true,
        bankTransaction: { select: { account: { select: { ownerCompanyId: true } } } },
      },
    });
    if (allocs.length === 0) continue;
    // Barcha taqsimotlar bitta firmaga tegishli (Payment firma+period kalitli).
    let channelId: string | null | undefined;
    for (const a of allocs) {
      channelId =
        (a.bankTransaction
          ? byFirm.get(a.bankTransaction.account.ownerCompanyId)
          : undefined) ??
        a.channelId ??
        channelId;
    }
    if (!channelId) continue;
    const total = allocs.reduce((s, a) => s + Number(a.amount), 0);
    resolvable++;
    resolvableSum += total;
    perChannel.set(channelId, (perChannel.get(channelId) ?? 0) + total);
    fixes.push({ paymentId, channelId });
  }

  console.log("═".repeat(64));
  console.log(apply ? "REJIM: --apply" : "REJIM: DRY-RUN");
  console.log("═".repeat(64));
  console.log(`Kanalsiz Paymentlar : ${paymentIds.length} ta`);
  console.log(`Manbaga bog'lanadi  : ${resolvable} ta / ${som(resolvableSum)} so'm`);
  for (const [chId, s] of perChannel) {
    const label = channels.find((c) => c.id === chId)?.label ?? chId;
    console.log(`   ${label.padEnd(28)} ${som(s).padStart(14)}`);
  }
  if (!apply || fixes.length === 0) {
    console.log("\nHech narsa o'zgarmadi.");
    return;
  }

  let fixed = 0;
  for (const f of fixes) {
    const res = await prisma.ledgerEntry.updateMany({
      where: { sourceTable: "Payment", sourceId: f.paymentId, accountId: "CASH" },
      data: { channelId: f.channelId },
    });
    fixed += res.count;
  }
  console.log(`\n✓ ${fixed} ta jurnal oyogi manbaga bog'landi (${fixes.length} Payment)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
