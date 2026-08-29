import "./load-env";
import { prisma } from "@/lib/prisma";
import { ACCOUNTS } from "@/lib/ledger";

async function main() {
  // KassaEntry lar: Julyda yozilgan, lekin jurnalda Augustda
  // Ya'ni: KassaEntry.date avgust 2026, ledger period = 2026-08, ammo source iyulda
  const misposted = await prisma.$queryRaw<Array<{
    ledger_id: string; ledger_period: string; source_id: string;
    kassa_date: Date; kassa_amount: number; kassa_type: string;
  }>>`
    SELECT
      l.id as ledger_id,
      l.period as ledger_period,
      l."sourceId" as source_id,
      k.date as kassa_date,
      k.amount as kassa_amount,
      k.type as kassa_type
    FROM "LedgerEntry" l
    JOIN "KassaEntry" k ON k.id = l."sourceId" AND l."sourceTable" = 'KassaEntry'
    WHERE l."accountId" = 'CASH'
      AND l.period = '2026-08'
      AND to_char(k.date, 'YYYY-MM') = '2026-07'
      AND k."deletedAt" IS NULL
      AND k.status = 'approved'
    ORDER BY k.date
  `;

  console.log(`Topildi: ${misposted.length} ta KassaEntry July sanada, August jurnalda`);
  if (misposted.length === 0) {
    console.log("Muammo yo'q.");
    await prisma.$disconnect();
    return;
  }

  const totalAmount = misposted.reduce((s, r) => s + Number(r.kassa_amount), 0);
  console.log(`Umumiy summa: ${totalAmount.toLocaleString()}`);
  console.log("\nBirinchi 5 tasi:");
  for (const r of misposted.slice(0, 5)) {
    console.log(`  ${r.kassa_date.toISOString().slice(0,10)} | ${r.kassa_type.padEnd(7)} | ${Number(r.kassa_amount).toLocaleString()} | ledger period: ${r.ledger_period}`);
  }

  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) {
    console.log("\n--dry-run: hech narsa o'zgartirilmadi.");
    console.log("Amalni bajarish uchun --dry-run olib tashlang.");
  } else {
    // Har bir LedgerEntry uchun: period ni July ga o'zgartiramiz
    const ids = misposted.map(r => r.ledger_id);
    const result = await prisma.ledgerEntry.updateMany({
      where: { id: { in: ids } },
      data: { period: "2026-07" },
    });
    console.log(`\n✓ ${result.count} ta LedgerEntry period '2026-08' → '2026-07' o'zgartirildi.`);
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
