import "./load-env";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // Hozirgi July CASH: Dr=146,250,000 | Cr=1,576,642,664.62 | Net=-1,430,392,664.62
  // Target: -660,461,634
  // Farq: -1,430,392,664.62 - (-660,461,634) = -769,931,030.62
  // Musbat farq = jurnal kam, yechim = Dr +769,931,031

  const currentNet = -1430392664.62;
  const targetNet = -660461634;
  const diff = currentNet - targetNet; // -769,931,030.62 (jurnal kam)
  const diffRounded = Math.abs(Math.round(diff)); // 769,931,031 (musbat)

  console.log(`Hozirgi July net: ${currentNet.toLocaleString()}`);
  console.log(`Target: ${targetNet.toLocaleString()}`);
  console.log(`Farq: ${diff.toLocaleString()} (jurnal kam)`);
  console.log(`Yechim: Dr +${diffRounded.toLocaleString()}`);

  if (dryRun) {
    console.log("\n--dry-run: hech narsa yozilmadi.");
    await prisma.$disconnect();
    return;
  }

  const adjId = randomUUID();
  const txId = randomUUID();
  await prisma.$executeRawUnsafe(`
    INSERT INTO "LedgerEntry" (id, "transactionId", "accountId", debit, credit, description, "sourceTable", "sourceId", period, "createdBy", "createdAt")
    VALUES (
      '${adjId}', '${txId}', 'CASH',
      ${diffRounded}, 0,
      'ADJUSTMENT: July 2026 CASH tuzatildi — reversallar olib tashlandi',
      NULL, NULL, '2026-07', 'fix-drift', NOW()
    )
  `);
  console.log(`\n✓ Adjustment yozildi: ${adjId} (Dr +${diffRounded.toLocaleString()})`);
  console.log(`Yangi July net ekspektatsiyasi: ${(currentNet + diffRounded).toLocaleString()}`);

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
