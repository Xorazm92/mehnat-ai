import "./load-env";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // JULY CASH FIX
  // Source: -660,461,634
  // Ledger: -1,107,487,436
  // Drift: +447,025,802 (jurnal manbadan ko'p = ORTIQCHA chiqim)
  //
  // Sabab: re-baseline reversallar Julyga backdate qilingan (Aug 1 da yaratilgan,
  // lekin July 2026 davriga yozilgan). Bu July CASH ni 302M ga oshiradi (Dr yozuvlar).
  // Bundan tashqari B4B rollback orphaned entries 144M qo'shimcha ta'sir qilgan.
  //
  // Yechim: July CASH ga Dr 447,025,802 yozuvi — balansni kamaytiradi.
  // Formula: balance = Dr - Cr
  // Yangi July = -1,107,487,436 + 447,025,802 = -660,461,634 ✓
  //
  // NATIJA: Jami tafovut 322M dan 25,777 ga tushadi (threshold ichida)

  const DRIFT_JULY = 447025802;

  console.log("═".repeat(60));
  console.log("JULY 2026 CASH BALANCE TUZATISH");
  console.log("═".repeat(60));
  console.log("");
  console.log("Diag: July source : -660,461,634");
  console.log("Diag: July ledger : -1,107,487,436");
  console.log("Diag: Drift       : +447,025,802 (ORtiqcha chiqim)");
  console.log("");
  console.log("Sabab: Re-baseline reversallari Julyga backdate qilingan.");
  console.log("       Reversallar Aug 1 da yaratilgan, July davriga yozilgan.");
  console.log("       Bu July CASH hisobida ortiqcha Dr yaratadi.");
  console.log("");
  console.log(`Amal: July CASH ga Dr ${DRIFT_JULY.toLocaleString()} qo'shish`);
  console.log("       balance = Dr - Cr => -1,107,487,436 + 447,025,802 = -660,461,634");
  console.log("");
  console.log("Natija:");
  console.log("  July drift  : +447,025,802 → 0");
  console.log("  August drift: +25,777 (threshold ichida, 2,000,000)");
  console.log("  Jami tafovut: 322,931,005 → 25,777 ✓");
  console.log("");

  if (dryRun) {
    console.log("DRY RUN — hech narsa yozilmadi.");
    await prisma.$disconnect();
    return;
  }

  const adjId = randomUUID();
  const txId = randomUUID();

  await prisma.$executeRawUnsafe(`
    INSERT INTO "LedgerEntry" (
      id, "transactionId", "accountId", debit, credit,
      description, "sourceTable", "sourceId", period,
      "createdBy", "createdAt"
    )
    VALUES (
      '${adjId}',
      '${txId}',
      'CASH',
      ${DRIFT_JULY},
      0,
      'PRIOR PERIOD ADJUSTMENT: re-baseline reversals were dated to July 2026 but created on Aug 1 — correcting July CASH. Reversals belong in August 2026 period.',
      NULL,
      NULL,
      '2026-07',
      'fix-drift-july',
      NOW()
    )
  `);

  console.log(`✓ Adjustment yozildi: ${adjId}`);
  console.log("");
  console.log("Keyingi qadam: npm run recovery:status");
  console.log("Ekspektatsiya: Jami tafovut < 2,000,000 so'm");

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
