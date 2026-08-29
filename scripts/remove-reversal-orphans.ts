import "./load-env";
import { prisma } from "@/lib/prisma";

async function main() {
  // July CASH reversal entries that couldn't find their originals
  const orphans = await prisma.$queryRawUnsafe<Array<{id: string; debit: number; credit: number; description: string | null}>>(`
    SELECT l.id, l.debit, l.credit, l.description
      FROM "LedgerEntry" l
     WHERE l."accountId" = 'CASH'
       AND l.period = '2026-07'
       AND (l."sourceTable" LIKE '%-reversal' OR l.description LIKE '%re-baseline%')
  `);

  console.log(`Nishon: ${orphans.length} ta re-baseline reversal yozuvi (July 2026, CASH, orphan)`);
  if (orphans.length === 0) {
    console.log("Hech narsa yo'q.");
    await prisma.$disconnect();
    return;
  }

  const totalNet = orphans.reduce((s, r) => s + Number(r.debit) - Number(r.credit), 0);
  console.log(`Umumiy net ta'sir: ${totalNet.toLocaleString()} (musbat = jurnal ortiqcha debitorlik ko'rsatadi)`);

  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) {
    console.log("\n--dry-run: hech narsa o'zgartirilmadi.");
    console.log("Amalni bajarish uchun --dry-run olib tashlang.");
  } else {
    const ids = orphans.map(r => r.id);
    const result = await prisma.ledgerEntry.deleteMany({
      where: { id: { in: ids } },
    });
    console.log(`\n✓ ${result.count} ta reversal yozuv o'chirildi.`);
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
