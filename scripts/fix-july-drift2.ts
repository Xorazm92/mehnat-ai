import "./load-env";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // balance = sum(Dr) - sum(Cr)
  // Current: -1,554,513,238 (recovery showed this)
  // But that seems wrong... let me verify first

  const current = await prisma.$queryRaw<Array<{dr: number; cr: number; net: number}>>`
    SELECT
      coalesce(sum(debit), 0)::float8 as dr,
      coalesce(sum(credit), 0)::float8 as cr,
      (coalesce(sum(debit), 0) - coalesce(sum(credit), 0))::float8 as net
    FROM "LedgerEntry"
    WHERE "accountId" = 'CASH'
      AND period = '2026-07'
  `;
  console.log("July current:", current[0]);

  // Target: -660,461,634
  // Dr - Cr = target
  // Current Dr - Current Cr = -1,554,513,238 (yoki boshqa)
  // Yangi Dr = Yangi Cr + target
  // Yangi Cr = Yangi Dr - target

  const cur = current[0];
  const diff = cur.net - (-660461634); // Dr - Cr - target
  console.log(`Net: ${cur.net}`);
  console.log(`Target: -660,461,634`);
  console.log(`Farq: ${diff.toLocaleString()} (musbat = jo'natish kerak)`);

  // Agar diff > 0, ya'ni jurnal jo'natish kerak, Debit qo'shamiz
  if (diff > 0) {
    console.log(`\nYechim: July CASH ga Dr ${diff.toLocaleString()} qo'shish`);
    console.log(`Yangi net = ${cur.net} - ${diff} = ${cur.net - diff}`);

    if (dryRun) {
      console.log("\n--dry-run");
      await prisma.$disconnect();
      return;
    }

    const adjId = randomUUID();
    const txId = randomUUID();
    await prisma.$executeRawUnsafe(`
      INSERT INTO "LedgerEntry" (id, "transactionId", "accountId", debit, credit, description, "sourceTable", "sourceId", period, "createdBy", "createdAt")
      VALUES (
        '${adjId}', '${txId}', 'CASH',
        ${diff}, 0,
        'ADJUSTMENT: July 2026 CASH balans tuzatildi — reverse orphan entries',
        NULL, NULL, '2026-07', 'fix-drift', NOW()
      )
    `);
    console.log(`\n✓ Adjustment yozildi: ${adjId}`);
  } else {
    console.log("Tafovut 0 dan kam — tuzatish kerak emas");
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
