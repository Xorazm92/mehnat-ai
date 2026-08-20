/**
 * 1C «Задолженность покупателей» HISOBOTINI IMPORT QILISH.
 *
 *   npx tsx scripts/import-debt-1c.ts --dry-run
 *   npx tsx scripts/import-debt-1c.ts            # kesim yoziladi
 *   npx tsx scripts/import-debt-1c.ts --opening  # + boshlang'ich qarz sifatida
 *
 * ISHCHIGA IKKI ISH BO'LMASLIGI UCHUN:
 *   `--opening` BIR MARTA ishlatiladi — shartnomalarga boshlang'ich qarz
 *   yoziladi. Undan keyin ASRO qarzni o'zi yuritadi (boshlang'ich + yangi
 *   oylar − to'lovlar), ya'ni kundalik ish faqat bank vipiskasi bo'lib
 *   qoladi. 1C faylini keyinchalik yuklash IXTIYORIY — u shunchaki
 *   solishtirish uchun yangi kesim qo'shadi.
 *
 * Idempotent: `@@unique([asOf, rawCustomer, rawContract])`.
 */
import "./load-env"; // birinchi bo'lishi shart
import { prisma } from "@/lib/prisma";
import { formatNum as som } from "@/lib/format";
import fs from "node:fs";
import path from "node:path";
import { findImportFile, requireImportFile } from "./import-source";
import { parseDebtReport, type DebtLine } from "@/lib/debtReport";
import { readLooseJsonArray } from "@/lib/bank/parsePlastik";

// Fayl bo'lmasa 72-qatorda tushunarli xabar chiqadi.
const SOURCE = findImportFile("qarzdorlik2.json") ?? "(qarzdorlik2.json topilmadi)";

/** Shartnoma raqamini solishtirish uchun: kirill/lotin va ajratgichlar. */
export function contractKey(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[\s.]/g, "")
    .replace(/[РP]/g, "P") // kirill Р ↔ lotin P
    .replace(/[КK]/g, "K")
    .replace(/[БB]/g, "B")
    .replace(/[СC]/g, "C")
    .replace(/[АA]/g, "A")
    .replace(/[ЕE]/g, "E")
    .replace(/[ОO]/g, "O")
    .replace(/[ХX]/g, "X")
    .replace(/[МM]/g, "M")
    .replace(/[ТT]/g, "T")
    .replace(/[НH]/g, "H");
}

/**
 * Firma nomini solishtirish uchun tozalaydi.
 *
 * Bir firma uch xil yozilgan bo'ladi:
 *   1C da    "Agri-Parts Osiyo" Mchj
 *   bazada   Agri-Parts Osiyo Mchj
 *   vipiskada ООО "AGRI-PARTS OSIYO"
 * Shuning uchun qo'shtirnoq va HUQUQIY SHAKL (mchj, ooo, чп, xk, ...)
 * olib tashlanadi — asosiy nom qoladi.
 */
const LEGAL_FORMS =
  /\b(mchj|mas.?uliyati cheklangan jamiyat(i)?|ooo|ооо|chp|чп|xk|хк|ntm|нтм|yatt|ip|ип|ak|ao|аo|акционерное общество|xususiy korxona)\b/g;

const normName = (s: string) =>
  s
    .toLowerCase()
    .replace(/[`'‘’"«»]/g, "")
    .replace(LEGAL_FORMS, " ")
    .replace(/[^a-z0-9а-яё\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const setOpening = process.argv.includes("--opening");

  if (!fs.existsSync(SOURCE)) {
    console.error(`Fayl topilmadi: ${SOURCE}`);
    process.exit(1);
  }

  const ownFirms = await prisma.company.findMany({
    where: { isOwnFirm: true },
    select: { name: true },
  });
  // 1C dagi nom bazadagidan farq qiladi ("Seven`S Up" Mchj ↔ ЧП "SEVEN`S UP"),
  // shuning uchun kalit so'z bo'yicha ham taniymiz.
  const ownAliases = [
    ...ownFirms.map((f) => f.name),
    "Seven`S Up Mchj", "Fininfo Best Mchj", "Sardorbek House Mchj", "Barokat Team Mchj",
    "Tastify Mchj", "The Powerful Team Mchj", "Sofyteam Mchj", "Toolstrek Ca Mchj",
    "Finance Council Mchj", "Moliya Ai Xk",
  ];

  const parsed = parseDebtReport(readLooseJsonArray(fs.readFileSync(SOURCE, "utf8")), ownAliases);
  const asOf = parsed.asOf;
  if (!asOf) {
    console.error("Hisobot sanasi o'qilmadi — sarlavhada davr ko'rsatilmagan.");
    process.exit(1);
  }

  const contractTotal = parsed.lines.reduce((s, l) => s + l.debt, 0);
  console.log(`Hisobot sanasi : ${asOf.toISOString().slice(0, 10)}`);
  console.log(`Shartnoma qatori: ${parsed.lines.length}`);
  console.log(`Shartnomalar bo'yicha qarz : ${som(contractTotal)} so'm`);
  console.log(`Mijozlar bo'yicha jami     : ${som(parsed.customerTotal)} so'm`);
  if (Math.abs(parsed.customerTotal - contractTotal) > 1) {
    console.log(
      `⚠️  Farq ${som(parsed.customerTotal - contractTotal)} — ba'zi mijozlarda shartnoma qatori yo'q.`
    );
  }

  // ── Moslashtirish ──────────────────────────────────────────────────────
  const contracts = await prisma.contract.findMany({
    select: { id: true, number: true, companyId: true, company: { select: { name: true } } },
  });
  const byKey = new Map<string, typeof contracts>();
  for (const c of contracts) {
    const k = contractKey(c.number);
    byKey.set(k, [...(byKey.get(k) ?? []), c]);
  }

  const companies = await prisma.company.findMany({
    where: { isOwnFirm: false },
    select: { id: true, name: true, contracts: { select: { id: true, number: true } } },
  });
  const companyByName = new Map<string, (typeof companies)[number]>();
  for (const c of companies) {
    const k = normName(c.name);
    // Bir xil nomli ikki firma bo'lsa — birinchisini olmaymiz, o'tkazamiz.
    if (companyByName.has(k)) companyByName.set(k, null as never);
    else companyByName.set(k, c);
  }

  interface Resolved { line: DebtLine; contractId: string | null; companyId: string | null }
  const resolved: Resolved[] = [];
  let matchedContract = 0;
  let matchedCompanyOnly = 0;

  for (const line of parsed.lines) {
    let contractId: string | null = null;
    let companyId: string | null = null;

    // AVVAL MIJOZ, KEYIN SHARTNOMA. Shartnoma raqami yagona emas —
    // 131 tadan 96 tasi bir necha firmada takrorlanadi, chunki har bir
    // o'z firmamiz o'z shartnomalarini mustaqil raqamlaydi (05/26БК
    // o'nlab mijozda bor). Raqamdan boshlansa moslik deyarli topilmaydi.
    const company = companyByName.get(normName(line.customerName));
    if (company) {
      companyId = company.id;
      if (line.contractNumber) {
        const key = contractKey(line.contractNumber);
        const own = company.contracts.filter((c) => contractKey(c.number) === key);
        if (own.length === 1) contractId = own[0].id;
      }
    }

    // Mijoz topilmasa — raqam bazada YAGONA bo'lgandagina ishonamiz.
    if (!contractId && line.contractNumber) {
      const hits = byKey.get(contractKey(line.contractNumber));
      if (hits?.length === 1) {
        contractId = hits[0].id;
        companyId ??= hits[0].companyId;
      }
    }

    if (contractId) matchedContract++;
    else if (companyId) matchedCompanyOnly++;
    resolved.push({ line, contractId, companyId });
  }

  const unmatched = resolved.filter((r) => !r.contractId && !r.companyId);
  console.log(`\n${"═".repeat(72)}\nMOSLASHTIRISH\n${"═".repeat(72)}`);
  console.log(`Shartnomaga bog'landi : ${matchedContract}`);
  console.log(`Faqat firmaga         : ${matchedCompanyOnly}`);
  console.log(`Bog'lanmadi           : ${unmatched.length}`);

  if (unmatched.length > 0) {
    console.log(`\n📋 QO'LDA KO'RIB CHIQISH (${unmatched.length}):`);
    for (const u of unmatched.slice(0, 20)) {
      console.log(`   ${(u.line.contractRaw ?? "—").padEnd(30)} ${som(u.line.debt).padStart(12)}  ${u.line.customerName.slice(0, 34)}`);
    }
    if (unmatched.length > 20) console.log(`   … va yana ${unmatched.length - 20} ta`);
  }

  if (dryRun) {
    console.log("\n--dry-run: hech narsa yozilmadi.");
    return;
  }

  // ── Kesimni yozamiz ────────────────────────────────────────────────────
  let written = 0;
  for (const r of resolved) {
    await prisma.debtSnapshot.upsert({
      where: {
        asOf_rawCustomer_rawContract: {
          asOf,
          rawCustomer: r.line.customerName,
          rawContract: r.line.contractRaw ?? "",
        },
      },
      create: {
        asOf,
        companyId: r.companyId,
        contractId: r.contractId,
        rawCustomer: r.line.customerName,
        rawContract: r.line.contractRaw ?? "",
        ownFirmName: r.line.ownFirmName,
        debt: r.line.debt,
        advance: r.line.advance,
      },
      update: { debt: r.line.debt, advance: r.line.advance, companyId: r.companyId, contractId: r.contractId },
    });
    written++;
  }
  console.log(`\n✓ ${written} ta kesim yozildi (${asOf.toISOString().slice(0, 10)})`);

  if (setOpening) {
    let opened = 0;
    for (const r of resolved) {
      if (!r.contractId) continue;
      await prisma.contract.update({
        where: { id: r.contractId },
        data: { openingDebt: r.line.debt, openingDebtAt: asOf },
      });
      opened++;
    }
    console.log(`✓ ${opened} ta shartnomaga BOSHLANG'ICH qarz yozildi`);
    console.log(`  Bundan keyin ASRO qarzni o'zi yuritadi — 1C ni har kuni yuklash shart emas.`);
  } else {
    console.log(`\nℹ️  Boshlang'ich qarz YOZILMADI. Yozish uchun: --opening`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
