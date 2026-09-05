/**
 * KASSA TOIFALARI VA XO'JALIK XARAJATLARI IMPORTI.
 *
 *   npx tsx scripts/import-kassa-data.ts --dry-run
 *   npx tsx scripts/import-kassa-data.ts
 *
 * Ikki manba (`others_json_files/`):
 *   `Kassa.json` DICTIONARY          → toifalar ro'yxati (SystemSetting)
 *   `FinCo Obed harajatlar …`        → kunlik xo'jalik xarajatlari (KassaEntry)
 *
 * Toifalar bungacha `lib/bank/classifyExpense.ts` da QATTIQ yozilgan edi.
 * Endi ular sozlamada — korxona o'z ro'yxatini yuritadi, kod o'zgarmaydi.
 *
 * Xarajatlar `KassaEntry(expense)` ga tushadi, ya'ni balansda hisobga
 * olinadi. Idempotent: `description` ichida barqaror kalit saqlanadi.
 */
import "./load-env"; // birinchi bo'lishi shart
import { prisma } from "@/lib/prisma";
import { formatNum as som } from "@/lib/platform/format";
import fs from "node:fs";
import { findImportFile, findImportFileByPrefix, requireImportFile } from "./import-source";
import { parseMealWorkbook } from "@/lib/mealExpenses";
import { KASSA_CATEGORIES_KEY } from "@/lib/kassaCategories";
import { ACCOUNTS, postLedger, reverseLedger } from "@/lib/ledger";
import { periodKeyOf } from "@/lib/periods";


async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // ── 1. Toifalar lug'ati ────────────────────────────────────────────────
  const kassaPath = findImportFile("Kassa.json");
  let categories: { income: string[]; expense: string[] } | null = null;
  if (kassaPath) {
    const dict = JSON.parse(fs.readFileSync(kassaPath, "utf8"))["DICTIONARY"] ?? [];
    const pick = (col: string) =>
      Array.from(
        new Set(
          dict
            .map((r: Record<string, unknown>) => String(r[col] ?? "").trim())
            .filter((v: string) => v.length > 0)
        )
      ) as string[];
    categories = { income: pick("Kirim"), expense: pick("Chiqim") };
    console.log(`Toifalar: kirim ${categories.income.length} ta, chiqim ${categories.expense.length} ta`);
    console.log(`   kirim : ${categories.income.join(", ")}`);
    console.log(`   chiqim: ${categories.expense.join(", ")}`);
  }

  // ── 2. Xo'jalik xarajatlari ────────────────────────────────────────────
  const obedFile = findImportFileByPrefix("FinCo Obed");
  const sheets = obedFile
    ? parseMealWorkbook(JSON.parse(fs.readFileSync(requireImportFile(obedFile), "utf8")))
    : [];

  console.log(`\n${"═".repeat(70)}\nXO'JALIK XARAJATLARI\n${"═".repeat(70)}`);
  let total = 0;
  let count = 0;
  const mismatched: string[] = [];
  for (const s of sheets) {
    total += s.total;
    count += s.expenses.length;
    if (!s.matches) {
      mismatched.push(
        `${s.sheet}: hisoblangan ${som(s.total)}, varaqda ${som(s.declaredTotal ?? 0)}`
      );
    }
    console.log(
      `  ${s.sheet.padEnd(18)} ${String(s.expenses.length).padStart(4)} yozuv ${som(s.total).padStart(12)}  ${s.matches ? "✓" : "✗"}`
    );
  }
  console.log(`  ${"JAMI".padEnd(18)} ${String(count).padStart(4)} yozuv ${som(total).padStart(12)}`);

  if (mismatched.length > 0) {
    console.log(`\n⚠️  Varaqdagi "Umumiy" bilan mos kelmadi (${mismatched.length}):`);
    for (const m of mismatched) console.log(`   ${m}`);
    console.log(`   Bu varaqlar baribir import qilinadi — farqi kichik va tafsilot to'g'ri.`);
  }

  // ── SANA VARAQ NOMIGA MOS KELMASA — TO'XTAYMIZ ─────────────────────────
  // Yig'indi farqidan FARQLI o'laroq bu jimgina o'tkazilmaydi: sana xato
  // bo'lsa, yozuv butunlay boshqa davrga tushadi. Real faylda "Январь 2026"
  // varag'idagi ustunlar 2026-DEKABR ni ko'rsatgan va 39 ta yozuv (1 221 000)
  // kelajak davriga tushib ketgan edi — joriy hisobotda ko'rinmay, keyin
  // o'sha oy kelganda yo'qdan paydo bo'ladigan pul.
  const wrongMonth = sheets.filter((s) => s.monthMismatch);
  if (wrongMonth.length > 0) {
    console.error(`\n❌ SANA VARAQ NOMIGA MOS KELMADI (${wrongMonth.length}):`);
    for (const s of wrongMonth) {
      const dates = s.expenses.map((e) => e.date.toISOString().slice(0, 7));
      const uniq = [...new Set(dates)].sort().join(", ");
      const want = s.declaredMonth
        ? `${s.declaredMonth.year}-${String(s.declaredMonth.month).padStart(2, "0")}`
        : "?";
      console.error(`   "${s.sheet}" — nomida ${want}, kataklarda ${uniq}`);
    }
    console.error(
      `\n   Xato FAYLDA: ustun sarlavhalaridagi Excel sanasi noto'g'ri.\n` +
        `   Fayl tuzatilsin yoki shu varaqlar chiqarib tashlansin.`
    );
    if (!process.argv.includes("--force")) process.exit(1);
    console.error("   --force berilgan — baribir davom etilmoqda.\n");
  }

  if (dryRun) {
    console.log("\n--dry-run: hech narsa yozilmadi.");
    return;
  }

  if (categories) {
    await prisma.systemSetting.upsert({
      where: { key: KASSA_CATEGORIES_KEY },
      create: { key: KASSA_CATEGORIES_KEY, value: categories },
      update: { value: categories } });
    console.log(`\n✓ Toifalar sozlamaga yozildi (${KASSA_CATEGORIES_KEY})`);
  }

  // Bir kun + bir toifa = bir yozuv. Takroriy importda yangilanadi.
  let written = 0;
  for (const s of sheets) {
    for (const e of s.expenses) {
      const key = `obed:${e.date.toISOString().slice(0, 10)}:${e.category}`;
      const existing = await prisma.kassaEntry.findFirst({
        where: { description: { startsWith: key }, deletedAt: null },
        select: { id: true } });
      let entryId: string;
      if (existing) {
        await prisma.kassaEntry.update({ where: { id: existing.id }, data: { amount: e.amount } });
        entryId = existing.id;
        await reverseLedger(prisma, {
          sourceTable: "KassaEntry",
          sourceId: entryId,
          createdBy: "import_kassa_data",
          reason: "import xarajat yangilandi" });
      } else {
        const created = await prisma.kassaEntry.create({
          data: {
            type: "expense",
            category: "ovqat_xojalik",
            amount: e.amount,
            date: e.date,
            description: `${key} — ${e.category}`,
            status: "approved" } });
        entryId = created.id;
      }
      await postLedger(prisma, {
        legs: [
          { accountId: ACCOUNTS.OPERATING_EXPENSE, debit: e.amount },
          { accountId: ACCOUNTS.CASH, credit: e.amount, channelId: null },
        ],
        period: periodKeyOf(e.date),
        sourceTable: "KassaEntry",
        sourceId: entryId,
        createdBy: "import_kassa_data",
        description: `${key} — ${e.category}` });
      written++;
    }
  }
  console.log(`✓ ${written} ta xarajat yozuvi (KassaEntry) yozildi · ${som(total)} so'm`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
