/**
 * PLASTIK KARTA TUSHUMLARINI IMPORT QILISH.
 *
 * Manba: cash_json_files/plastik.json — 1C "Реализация (акт, накладная)"
 * reestri (bank vipiskasi EMAS, shuning uchun alohida skript).
 *
 * Tushum mijozning oylik `Payment` qatoriga `PaymentAllocation(source=plastik)`
 * sifatida qo'shiladi — bank tushumi bilan aynan bir xil yo'l. Shu tufayli
 * bir oyda ham bankdan, ham plastikdan to'lagan mijozning (iyulda 4 ta firma)
 * qarzi to'g'ri yopiladi.
 *
 *   npx tsx scripts/import-plastik.ts --dry-run
 *   npx tsx scripts/import-plastik.ts
 *
 * Idempotent: PaymentAllocation.dedupKey = "plastik:<hujjat>:<STIR>".
 */
import "./load-env"; // birinchi bo'lishi shart
import { prisma } from "@/lib/prisma";
import { formatNum as som } from "@/lib/platform/format";
import fs from "node:fs";
import path from "node:path";
import { parsePlastikFile } from "@/lib/bank/parsePlastik";
import { allocatePlastikReceipt } from "@/lib/bank/importStatement";

const SOURCE = path.join(process.cwd(), "cash_json_files", "plastik.json");

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  if (!fs.existsSync(SOURCE)) {
    console.error(`Fayl topilmadi: ${SOURCE}`);
    process.exit(1);
  }

  // Parser endi `ParsedStatement` qaytaradi (Faza 3.4) — beshala format bitta
  // shartnomada. Fayldagi "Итого" bilan solishtirish PARSER ICHIDA: mos
  // kelmasa u `BankStatementParseError` tashlaydi, ya'ni chala fayl bu yergacha
  // yetib kelmaydi va tekshiruvni chaqiruvchi tushirib qoldira olmaydi.
  const { transactions: receipts } = parsePlastikFile(fs.readFileSync(SOURCE, "utf8"));
  const total = receipts.reduce((s, r) => s + r.amount, 0);

  console.log(`O'qildi: ${receipts.length} ta tushum · ${som(total)} so'm`);

  // STIR bo'yicha mijozni topamiz. STIR unikal emas, bir nechta mos kelsa
  // qo'lda hal qilinadi — pulni noto'g'ri firmaga yozish qarzni buzadi.
  const inns = Array.from(
    new Set(receipts.map((r) => r.counterpartyInn).filter((v): v is string => !!v))
  );
  const companies = await prisma.company.findMany({
    where: { inn: { in: inns }, isOwnFirm: false },
    select: { id: true, inn: true, name: true },
  });
  const byInn = new Map<string, typeof companies>();
  for (const c of companies) {
    const list = byInn.get(c.inn) ?? [];
    list.push(c);
    byInn.set(c.inn, list);
  }

  const matched: { receipt: (typeof receipts)[number]; docNumber: string; companyId: string; name: string }[] = [];
  const noDocNumber: typeof receipts = [];
  const noInn: typeof receipts = [];
  const notFound: typeof receipts = [];
  const ambiguous: typeof receipts = [];

  for (const r of receipts) {
    // `docNumber` — `allocatePlastikReceipt` ning idempotentlik kaliti.
    // Parser uni bo'sh qoldirmaydi (qator tartibidan zaxira kalit yasaydi),
    // lekin kalitsiz tushumni yozish qayta ishga tushirishda DUBLIKAT hosil
    // qilardi — shuning uchun bo'sh kalit jim to'ldirilmaydi, chetga chiqadi.
    if (!r.docNumber) {
      noDocNumber.push(r);
      continue;
    }
    if (!r.counterpartyInn) {
      noInn.push(r);
      continue;
    }
    const hits = byInn.get(r.counterpartyInn);
    if (!hits || hits.length === 0) {
      notFound.push(r);
      continue;
    }
    if (hits.length > 1) {
      ambiguous.push(r);
      continue;
    }
    matched.push({ receipt: r, docNumber: r.docNumber, companyId: hits[0].id, name: hits[0].name });
  }

  const sum = (list: { amount: number }[]) => list.reduce((s, r) => s + r.amount, 0);

  console.log(`\n${"═".repeat(70)}`);
  console.log("MOSLASHTIRISH");
  console.log("═".repeat(70));
  console.log(`Bazadagi firmaga bog'landi : ${matched.length} ta · ${som(sum(matched.map((m) => m.receipt)))} so'm`);
  console.log(`STIR ko'rsatilmagan        : ${noInn.length} ta · ${som(sum(noInn))} so'm`);
  console.log(`STIR bor, firma topilmadi  : ${notFound.length} ta · ${som(sum(notFound))} so'm`);
  if (ambiguous.length) console.log(`Bir STIR, ko'p firma       : ${ambiguous.length} ta`);
  if (noDocNumber.length) console.log(`Hujjat raqami yo'q         : ${noDocNumber.length} ta · ${som(sum(noDocNumber))} so'm`);

  if (noInn.length + notFound.length > 0) {
    console.log(`\n📋 QO'LDA KO'RIB CHIQISH (${noInn.length + notFound.length}):`);
    for (const r of [...noInn, ...notFound].sort((a, b) => b.amount - a.amount)) {
      const tag = r.counterpartyInn ? `STIR ${r.counterpartyInn}` : "STIR yo'q";
      console.log(`   ${som(r.amount).padStart(12)} | ${tag.padEnd(16)} | ${r.counterpartyName ?? "?"}`);
    }
  }

  if (dryRun) {
    console.log("\n--dry-run: hech narsa yozilmadi.");
    return;
  }

  console.log(`\n${"═".repeat(70)}`);
  console.log("PAYMENT'GA QO'SHISH");
  console.log("═".repeat(70));

  let posted = 0;
  let failed = 0;
  const superseded: { name: string; was: number; now: number }[] = [];

  for (const m of matched) {
    try {
      const res = await allocatePlastikReceipt(prisma, {
        docNumber: m.docNumber,
        companyId: m.companyId,
        amount: m.receipt.amount,
        receivedAt: m.receipt.valueDate,
        counterpartyInn: m.receipt.counterpartyInn,
      });
      posted++;
      if (res.supersededManualAmount != null) {
        superseded.push({ name: m.name, was: res.supersededManualAmount, now: res.paymentTotal });
      }
    } catch (e) {
      failed++;
      console.log(`  ✗ ${m.name}: ${(e as Error).message}`);
    }
  }

  console.log(`Qo'shildi: ${posted}, xato: ${failed}`);

  if (superseded.length > 0) {
    console.log(`\n⚠️  QO'LDA KIRITILGAN SUMMA ALMASHTIRILDI (${superseded.length} ta):`);
    for (const s of superseded) {
      console.log(`   ${s.name.slice(0, 38).padEnd(40)} ${som(s.was).padStart(12)} → ${som(s.now).padStart(12)}`);
    }
  }

  const agg = await prisma.paymentAllocation.groupBy({
    by: ["source"],
    _count: { _all: true },
    _sum: { amount: true },
  });
  console.log("\nTaqsimotlar (manba bo'yicha):");
  for (const a of agg) {
    console.log(`   ${(a.source ?? "?").padEnd(10)} ${String(a._count._all).padStart(4)} ta · ${som(Number(a._sum.amount))} so'm`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
