import "./load-env";
import { prisma } from "@/lib/prisma";

async function main() {
  const gaps = await prisma.$queryRaw<Array<{ id: string; date: Date; amount: number }>>`
    SELECT k.id, k.date, k.amount
      FROM "KassaEntry" k
     WHERE k."deletedAt" IS NULL
       AND k.status = 'approved'
       AND k."companyId" IS NULL
       AND k.description LIKE 'obed:%'
       AND NOT EXISTS (SELECT 1 FROM "LedgerEntry" l
                        WHERE l."sourceId" = k.id AND l."sourceTable" = 'KassaEntry')
  `;

  console.log(`Nishon: ${gaps.length} ta Obed yozuv (test data, kelajakka yozilgan, ledger izsiz)`);
  if (gaps.length === 0) {
    console.log("Hech narsa yo'q.");
    await prisma.$disconnect();
    return;
  }

  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) {
    console.log("\n--dry-run: hech narsa o'zgartirilmadi.");
    console.log("Amalni bajarish uchun --dry-run olib tashlang.");
  } else {
    const ids = gaps.map((g) => g.id);
    const result = await prisma.kassaEntry.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: new Date(), deletedBy: "recovery-obed-2026-08" },
    });
    console.log(`✓ ${result.count} ta yozuv soft-delete qilindi.`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
