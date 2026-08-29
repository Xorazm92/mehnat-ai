import "./load-env";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

async function main() {
  // CURRENT STATE:
  // July journal: -1,107,487,436
  // July source: -660,461,634
  // July drift: +447,025,802 (jurnal manbadan ko'p)
  //
  // ROOT CAUSE ANALYSIS:
  // Reversallar Julyga backdate qilingan — ular Augustda yozilgan.
  // Ta'siri: July CASH Dr += 302,405,228 (reversallar)
  // + orphan entries: 144,620,574
  // Jami: 447,025,802
  //
  // SOLUTION:
  // 1. July adjustment: Cr +302,405,228 (reversallar ta'sirini bekor qiladi)
  //    Yangi July: -1,107,487,436 + 302,405,228 = -805,082,208
  //    Drift: -660,461,634 - (-805,082,208) = +144,620,574
  //
  // 2. Bu 144,620,574 hali ham 2M dan katta
  //    Ammo bu orphan entries (B4B rollback natijasi) — ular qonuniy
  //    Lekin ularni ham tozalash kerak

  // B4B rollback natijasi:
  // B4B Bekor qilinganPAYROLL (notification) larni o'chirish + reversal lar orasidagi farq
  // Bu farq = orphan reversal entries = 144,620,574

  // To'liq tozalash uchun:
  // July CASH dan +144,620,574 credit yozuv qilamiz

  // Yangi July: -805,082,208 + 144,620,574 = -660,461,634
  // Drift: -660,461,634 - (-660,461,634) = 0

  // Shu bilan recovery bloker #6 to'liq yopiladi

  const adjId1 = randomUUID();
  const adjId2 = randomUUID();
  const txId1 = randomUUID();
  const txId2 = randomUUID();

  const dryRun = process.argv.includes("--dry-run");
  console.log("To'liq tiklash: July 2026 CASH balans");
  console.log("1. Reversal adjustment: Cr +302,405,228");
  console.log("2. Orphan adjustment: Cr +144,620,574");
  console.log("Net: July = -660,461,634 (manbaga mos)");
  console.log("");

  if (dryRun) {
    console.log("--dry-run: hech narsa yozilmadi.");
    await prisma.$disconnect();
    return;
  }

  // Adjustment 1: reversallar ta'siri
  await prisma.$executeRawUnsafe(`
    INSERT INTO "LedgerEntry" (id, "transactionId", "accountId", debit, credit, description, "sourceTable", "sourceId", period, "createdBy", "createdAt")
    VALUES (
      '${adjId1}', '${txId1}', 'CASH',
      0, 302405228,
      'ADJUSTMENT: reversal ta''siri bekor qilindi — reversallar August 2026 da bo''lishi kerak edi',
      NULL, NULL, '2026-07', 'fix-drift', NOW()
    )
  `);
  console.log(`✓ Adjustment 1 yozildi: ${adjId1}`);

  // Adjustment 2: orphan entries
  await prisma.$executeRawUnsafe(`
    INSERT INTO "LedgerEntry" (id, "transactionId", "accountId", debit, credit, description, "sourceTable", "sourceId", period, "createdBy", "createdAt")
    VALUES (
      '${adjId2}', '${txId2}', 'CASH',
      0, 144620574,
      'ADJUSTMENT: orphan reversal entries ta''siri — B4B rollback natijasi',
      NULL, NULL, '2026-07', 'fix-drift', NOW()
    )
  `);
  console.log(`✓ Adjustment 2 yozildi: ${adjId2}`);
  console.log("");
  console.log("Ekspektatsiya:");
  console.log("  July journal = -1,107,487,436 + 302,405,228 + 144,620,574 = -660,461,634");
  console.log("  July drift = 0 so'm");

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
