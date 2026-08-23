/**
 * YETIM BANK-CHIQIMLARNI BEKOR QILISH (bir martalik)
 * ===================================================
 *
 *   npx tsx scripts/wipe-orphan-bank-expenses.ts           # DRY-RUN
 *   npx tsx scripts/wipe-orphan-bank-expenses.ts --apply
 *
 * KONTEKST: eski vipiskalar re-baseline'da o'chirilganda, ulardan
 * yozilgan KassaEntry(expense) qatorlari qolib ketgan va ularning
 * dedupKey='bank:<txId>' havolasi ENDI MAVJUD BO'LMAGAN tranzaksiyaga
 * ko'rsatadi. Bu yetimlar manbasiz (channelId=NULL) — ya'ni 12 ta manba
 * modelida hech qaysi balansni kamaytirmaydi va faqat umumiy raqamni
 * buzadi.
 *
 * Haqiqiy pul o'zining yangi vipiska qatorida NAVBATDA turibdi — u yerdan
 * toifalanganda endi avtomatik manbali yoziladi. Shu sababli yetimlarni
 * saqlash dublikat xavfi emas, chalkashlik manbasi.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { serializable } from "@/lib/tx";
import { reverseLedger } from "@/lib/ledger";
import { formatNum as som } from "@/lib/format";

const REASON = "yetim: manba vipiskasi re-baseline'da o'chirilgan — navbatdan qayta yoziladi";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const rows = await prisma.kassaEntry.findMany({
    where: { deletedAt: null, channelId: null, dedupKey: { startsWith: "bank:" } },
    select: { id: true, amount: true, dedupKey: true },
  });

  // Yetimlikni TASDIQLAYMIZ: har biriga havola qilingan tx rostdan yo'qmi.
  const orphans: typeof rows = [];
  let sum = 0;
  for (const r of rows) {
    const txId = r.dedupKey!.slice("bank:".length);
    const exists = await prisma.bankTransaction.findUnique({ where: { id: txId }, select: { id: true } });
    if (!exists) {
      orphans.push(r);
      sum += Number(r.amount);
    }
  }

  console.log("═".repeat(64));
  console.log(apply ? "REJIM: --apply" : "REJIM: DRY-RUN");
  console.log("═".repeat(64));
  console.log(`Kanalsiz bank-chiqim : ${rows.length} ta`);
  console.log(`Yetim (tx yo'q)      : ${orphans.length} ta / ${som(sum)} so'm`);
  if (!apply || orphans.length === 0) {
    console.log("\nHech narsa o'zgarmadi.");
    return;
  }

  let done = 0;
  await serializable(async (tx) => {
    for (const r of orphans) {
      const cur = await tx.kassaEntry.findUnique({ where: { id: r.id }, select: { deletedAt: true } });
      if (!cur || cur.deletedAt) continue;
      await tx.kassaEntry.update({
        where: { id: r.id },
        data: { deletedAt: new Date(), deleteReason: REASON },
      });
      await reverseLedger(tx, { sourceTable: "KassaEntry", sourceId: r.id, reason: REASON });
      done++;
    }
  });
  console.log(`\n✓ ${done} ta yetim chiqim bekor qilindi (${som(sum)} so'm)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
