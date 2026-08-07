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
import fs from "node:fs";
import path from "node:path";
import { parsePlastikFile } from "@/lib/bank/parsePlastik";
import { allocatePlastikReceipt } from "@/lib/bank/importStatement";

const SOURCE = path.join(process.cwd(), "cash_json_files", "plastik.json");
const som = (n: number) => Math.round(n).toLocaleString("en-US");

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  if (!fs.existsSync(SOURCE)) {
    console.error(`Fayl topilmadi: ${SOURCE}`);
    process.exit(1);
  }

  const { receipts, declaredTotal } = parsePlastikFile(fs.readFileSync(SOURCE, "utf8"));
  const total = receipts.reduce((s, r) => s + r.amount, 0);

  console.log(`O'qildi: ${receipts.length} ta tushum · ${som(total)} so'm`);
  if (declaredTotal != null) {
    const ok = Math.round(declaredTotal) === Math.round(total);
    console.log(
      `Fayldagi "Итого": ${som(declaredTotal)} so'm — ${ok ? "✓ mos keladi" : "✗ MOS KELMAYDI"}`
    );
    if (!ok) {
      console.error("Yig'indi mos kelmadi — import to'xtatildi.");
      process.exit(1);
    }
  }

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

  const matched: { receipt: (typeof receipts)[number]; companyId: string; name: string }[] = [];
  const noInn: typeof receipts = [];
  const notFound: typeof receipts = [];
  const ambiguous: typeof receipts = [];

  for (const r of receipts) {
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
    matched.push({ receipt: r, companyId: hits[0].id, name: hits[0].name });
  }

  const sum = (list: { amount: number }[]) => list.reduce((s, r) => s + r.amount, 0);

  console.log(`\n${"═".repeat(70)}`);
  console.log("MOSLASHTIRISH");
  console.log("═".repeat(70));
  console.log(`Bazadagi firmaga bog'landi : ${matched.length} ta · ${som(sum(matched.map((m) => m.receipt)))} so'm`);
  console.log(`STIR ko'rsatilmagan        : ${noInn.length} ta · ${som(sum(noInn))} so'm`);
  console.log(`STIR bor, firma topilmadi  : ${notFound.length} ta · ${som(sum(notFound))} so'm`);
  if (ambiguous.length) console.log(`Bir STIR, ko'p firma       : ${ambiguous.length} ta`);

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
        docNumber: m.receipt.docNumber,
        companyId: m.companyId,
        amount: m.receipt.amount,
        receivedAt: m.receipt.date,
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
