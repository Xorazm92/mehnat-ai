/**
 * "MATCHED" LEKIN YOZILMAGAN KIRIMLARNI HISOBGA OLISH (bir martalik)
 * ===================================================================
 *
 *   npx tsx scripts/post-matched-income.ts            # DRY-RUN — faqat ro'yxat
 *   npx tsx scripts/post-matched-income.ts --apply    # hisobga oladi
 *
 * KONTEKST. `autoMatchTransactions` uzoq vaqt faqat BELGI qo'yardi:
 * `status='matched'`, lekin `PaymentAllocation` yozilmasdi. Natijada vipiska
 * tizimga "kirdi", qarz va balans esa umuman o'zgarmasdi. `commitStatementUpload`
 * endi avto-post qiladi; bu skript o'sha tuzatishdan OLDIN tiyilgan qatorlarni
 * hisobga oladi.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { postIncomeTransaction } from "@/lib/bank/importStatement";
import { assertPeriodOpen } from "@/lib/periodLock";
import { periodKeyOf } from "@/lib/periods";
import { formatNum as som } from "@/lib/format";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const rows = await prisma.bankTransaction.findMany({
    where: { direction: "income", status: "matched" },
    select: {
      id: true, amount: true, valueDate: true,
      matchedCompanyId: true, matchedContractId: true,
    },
    orderBy: { valueDate: "asc" },
  });

  // Allaqachon taqsimoti borlarini o'tkazib yuboramiz (dedupKey bilan).
  const withAlloc = new Set(
    (
      await prisma.paymentAllocation.findMany({
        where: { dedupKey: { in: rows.map((r) => `bank:${r.id}`) } },
        select: { dedupKey: true },
      })
    ).map((a) => a.dedupKey)
  );
  const pending = rows.filter((r) => !withAlloc.has(`bank:${r.id}`));

  const total = pending.reduce((s, r) => s + Number(r.amount), 0);
  console.log("═".repeat(64));
  console.log(apply ? "REJIM: --apply" : "REJIM: DRY-RUN");
  console.log("═".repeat(64));
  console.log(`matched kirim qatorlari : ${rows.length} ta`);
  console.log(`hisobga olinadigan      : ${pending.length} ta / ${som(total)} so'm`);
  console.log(`allaqachon yozilgan     : ${rows.length - pending.length} ta`);

  if (!apply || pending.length === 0) {
    console.log("\nHech narsa yozilmadi.");
    return;
  }

  let posted = 0;
  let postedAmount = 0;
  let failed = 0;
  for (const r of pending) {
    if (!r.matchedCompanyId) continue; // firma bog'lanmagan — navbatda qoladi
    try {
      await assertPeriodOpen(prisma, periodKeyOf(r.valueDate), "bank kirimi");
      await postIncomeTransaction(prisma, {
        transactionId: r.id,
        companyId: r.matchedCompanyId,
        contractId: r.matchedContractId,
      });
      posted++;
      postedAmount += Number(r.amount);
    } catch (e) {
      failed++;
      if (failed <= 5) console.error(`   ✗ ${r.id}: ${(e as Error).message}`);
    }
  }
  console.log(`\n✓ ${posted} ta / ${som(postedAmount)} so'm hisobga olindi${failed ? ` · ✗ ${failed} ta yiqildi` : ""}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
