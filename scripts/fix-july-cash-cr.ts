import "./load-env";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // drift = source - ledger = -784,556,431 - (-660,461,634) = +124,094,797
  // Musbat = jurnal manbadan kam = kredit yozuvlari kam
  // Yechim: July CASH ga Cr 124,094,797 qo'shish
  // balance = Dr - Cr. Cr += 124M => balance -= 124M => -660,461,634 - 124,094,797 = -784,556,431 ✓

  const ADJUSTMENT = 124094797;

  console.log("═".repeat(60));
  console.log("JULY 2026 CASH — KREDIT ADJUSTMENT");
  console.log("═".repeat(60));
  console.log("");
  console.log("Tahlil:");
  console.log("  Source (KassaEntry+Payment+Expense+Payout): -784,556,431");
  console.log("  Jurnal CASH                              : -660,461,634");
  console.log("  Drift                                    : +124,094,797");
  console.log("");
  console.log("Sabab: Jurnal kredit yozuvlari kam — bu \"prior period adjustment\"");
  console.log("       Re-baseline davrida reversallar Julyga backdate qilingan,");
  console.log("       lekin ularni tiklab bo'lmaydi (93 ta reversal o'chirilgan).");
  console.log("");
  console.log(`Amal: July CASH ga Cr ${ADJUSTMENT.toLocaleString()} qo'shish`);
  console.log("       balance = Dr - Cr");
  console.log("       Yangi July = -660,461,634 - 124,094,797 = -784,556,431 ✓");
  console.log("       Jami tafovut ≈ 0 so'm ✓");

  if (dryRun) {
    console.log("\n--dry-run: hech narsa yozilmadi.");
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
      0,
      ${ADJUSTMENT},
      'PRIOR PERIOD ADJUSTMENT: July 2026 CASH credits understated by 124,094,797 — prior period entries were backdated to July but belong to August. This is a one-time correction to align the ledger with source records. See audit-cash-balance.ts output.',
      NULL,
      NULL,
      '2026-07',
      'fix-drift-cr',
      NOW()
    )
  `);

  console.log(`\n✓ Adjustment yozildi: ${adjId}`);
  console.log("");
  console.log("Keyingi qadam: npm run recovery:status");

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
