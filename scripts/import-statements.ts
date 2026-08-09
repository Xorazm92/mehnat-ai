/**
 * BANK VIPISKALARINI BIR MARTALIK IMPORT QILISH (07.2026 backfill).
 *
 * Manba: cash_json_files/*.json — 10 ta o'z firmamiz vipiskasi.
 * Veb-yuklash bilan AYNAN BIR XIL kod ishlatiladi (lib/bank/), shuning uchun
 * bu yerdagi natija keyingi kunlik yuklashlar bilan mos keladi.
 *
 *   npx tsx scripts/import-statements.ts --dry-run   # faqat tahlil
 *   npx tsx scripts/import-statements.ts             # yozadi va moslashtiradi
 *   npx tsx scripts/import-statements.ts --post      # + kirimni Payment'ga o'tkazadi
 *
 * Idempotent: BankTransaction.rawHash unikal — qayta ishga tushirish dublikat
 * yaratmaydi.
 *
 * ⚠️  `--post` QARZDORLIKNI O'ZGARTIRADI: moslashtirilgan kirimlar Payment
 * qatorlariga yoziladi va firmalarning qarzi yopiladi. Avval `--dry-run`.
 */
import "./load-env"; // birinchi bo'lishi shart
import { prisma } from "@/lib/prisma";
import { formatNum as som } from "@/lib/format";
import fs from "node:fs";
import path from "node:path";
import { parseWorkbook } from "@/lib/bank/parseStatement";
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from "@/lib/bank/classifyExpense";
import {
  commitStatement,
  autoMatchTransactions,
  postIncomeTransaction,
} from "@/lib/bank/importStatement";

const SOURCE_DIR = path.join(process.cwd(), "cash_json_files");

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const doPost = process.argv.includes("--post");

  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`Manba papka topilmadi: ${SOURCE_DIR}`);
    process.exit(1);
  }

  const accounts = await prisma.bankAccount.findMany({
    select: { id: true, accountNumber: true, label: true },
  });
  if (accounts.length === 0) {
    console.error("Bank hisoblari yo'q. Avval: npx tsx scripts/mark-own-firms.ts");
    process.exit(1);
  }
  const byNumber = new Map(accounts.map((a) => [a.accountNumber, a]));

  const ownFirms = await prisma.company.findMany({
    where: { isOwnFirm: true },
    select: { inn: true },
  });
  const ownFirmInns = new Set(ownFirms.map((c) => c.inn));

  const files = fs
    .readdirSync(SOURCE_DIR)
    .filter((f) => f.endsWith(".json") && !f.includes("conversion_log"))
    .sort();

  let totalTx = 0;
  let totalIn = 0;
  let totalOut = 0;
  let inserted = 0;
  let duplicate = 0;
  const categories: Record<string, number> = {};
  const importIds: string[] = [];
  const unknownAccounts: string[] = [];

  console.log(`${"═".repeat(78)}`);
  console.log("VIPISKALARNI O'QISH");
  console.log("═".repeat(78));

  for (const file of files) {
    const workbook = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, file), "utf8"));

    let parsed;
    try {
      parsed = parseWorkbook(workbook);
    } catch (e) {
      console.log(`✗ ${file}: ${(e as Error).message}`);
      continue;
    }

    const account = parsed.accountNumber ? byNumber.get(parsed.accountNumber) : undefined;
    if (!account) {
      unknownAccounts.push(`${file} → ${parsed.accountNumber ?? "hisob raqami o'qilmadi"}`);
      console.log(`✗ ${file}: hisob bazada topilmadi (${parsed.accountNumber})`);
      continue;
    }

    const income = parsed.transactions.filter((t) => t.direction === "income");
    const expense = parsed.transactions.filter((t) => t.direction === "expense");
    const sumIn = income.reduce((s, t) => s + t.amount, 0);
    const sumOut = expense.reduce((s, t) => s + t.amount, 0);
    totalTx += parsed.transactions.length;
    totalIn += sumIn;
    totalOut += sumOut;

    let line =
      `${account.label.padEnd(20)} ${parsed.format.padEnd(10)} ` +
      `tx=${String(parsed.transactions.length).padStart(3)} ` +
      `kirim=${som(sumIn).padStart(14)} chiqim=${som(sumOut).padStart(14)}`;

    if (!dryRun) {
      const res = await commitStatement(prisma, {
        parsed,
        accountId: account.id,
        accountNumber: account.accountNumber,
        fileName: file,
        ownFirmInns,
      });
      importIds.push(res.importId);
      inserted += res.rowsInserted;
      duplicate += res.rowsDuplicate;
      line += `  → yozildi ${res.rowsInserted}, dublikat ${res.rowsDuplicate}`;
    }
    console.log(line);
  }

  console.log(
    `\nJAMI: ${totalTx} tranzaksiya · kirim ${som(totalIn)} so'm · chiqim ${som(totalOut)} so'm`
  );
  if (!dryRun) console.log(`Bazaga yozildi: ${inserted}, dublikat sifatida tashlandi: ${duplicate}`);

  if (unknownAccounts.length > 0) {
    console.log("\n⚠️  HISOBI TOPILMAGAN FAYLLAR:");
    unknownAccounts.forEach((u) => console.log("   " + u));
  }

  if (dryRun) {
    console.log("\n--dry-run: hech narsa yozilmadi.");
    return;
  }

  // ── Moslashtirish ─────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(78)}`);
  console.log("MOSLASHTIRISH (STIR va shartnoma raqami bo'yicha)");
  console.log("═".repeat(78));
  const match = await autoMatchTransactions(prisma, {});
  console.log(`Ko'rildi              : ${match.examined} ta kirim`);
  console.log(`STIR bo'yicha topildi : ${match.matchedByInn}`);
  console.log(`Shartnomasi ham bor   : ${match.matchedContract}`);
  console.log(`Qo'lda hal qilinadi   : ${match.stillUnmatched}`);

  // ── Chiqim toifalari ──────────────────────────────────────────────────
  const expenseRows = await prisma.bankTransaction.groupBy({
    by: ["expenseCategory"],
    where: { direction: "expense" },
    _count: { _all: true },
    _sum: { amount: true },
  });
  console.log(`\n${"═".repeat(78)}`);
  console.log("CHIQIM TOIFALARI");
  console.log("═".repeat(78));
  for (const row of expenseRows.sort((a, b) => Number(b._sum.amount) - Number(a._sum.amount))) {
    const key = (row.expenseCategory ?? "boshqa") as ExpenseCategory;
    categories[key] = row._count._all;
    console.log(
      `  ${(EXPENSE_CATEGORY_LABELS[key] ?? key).padEnd(24)} ` +
        `${String(row._count._all).padStart(4)} ta  ${som(Number(row._sum.amount)).padStart(16)} so'm`
    );
  }

  // ── Kirimni Payment'ga o'tkazish (ixtiyoriy) ──────────────────────────
  if (!doPost) {
    console.log(
      `\nℹ️  Kirimlar hali Payment'ga O'TKAZILMADI (qarzdorlik o'zgarmadi).\n` +
        `   O'tkazish uchun: npx tsx scripts/import-statements.ts --post`
    );
    return;
  }

  console.log(`\n${"═".repeat(78)}`);
  console.log("KIRIMNI PAYMENT'GA O'TKAZISH");
  console.log("═".repeat(78));
  const matched = await prisma.bankTransaction.findMany({
    where: { direction: "income", status: "matched", matchedCompanyId: { not: null } },
    select: { id: true, matchedCompanyId: true, matchedContractId: true },
  });

  let posted = 0;
  let failed = 0;
  const superseded: { company: string; was: number; now: number }[] = [];

  for (const tx of matched) {
    try {
      const res = await postIncomeTransaction(prisma, {
        transactionId: tx.id,
        companyId: tx.matchedCompanyId as string,
        contractId: tx.matchedContractId,
      });
      posted++;
      if (res.supersededManualAmount != null) {
        const company = await prisma.company.findUnique({
          where: { id: tx.matchedCompanyId as string },
          select: { name: true },
        });
        superseded.push({
          company: company?.name ?? tx.matchedCompanyId!,
          was: res.supersededManualAmount,
          now: res.paymentTotal,
        });
      }
    } catch (e) {
      failed++;
      console.log(`  ✗ ${tx.id.slice(0, 8)}: ${(e as Error).message}`);
    }
  }
  console.log(`O'tkazildi: ${posted}, xato: ${failed}`);

  if (superseded.length > 0) {
    console.log(
      `\n⚠️  QO'LDA KIRITILGAN SUMMA BANK MA'LUMOTI BILAN ALMASHTIRILDI (${superseded.length} ta):`
    );
    console.log("   Payment.amount endi bank taqsimotlari yig'indisidan hisoblanadi.");
    for (const s of superseded) {
      console.log(`   ${s.company.slice(0, 40).padEnd(42)} ${som(s.was).padStart(14)} → ${som(s.now).padStart(14)}`);
    }
  }

  const payments = await prisma.payment.aggregate({
    where: { deletedAt: null },
    _count: { _all: true },
    _sum: { amount: true },
  });
  console.log(
    `\nPayment jadvali: ${payments._count._all} qator, jami ${som(Number(payments._sum.amount))} so'm`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
