/**
 * 1C QARZDORLIK KESIMINI IMPORT QILISH
 * ====================================
 *
 *   npx tsx scripts/import-debt-snapshot.ts            # hisobot, yozmaydi
 *   npx tsx scripts/import-debt-snapshot.ts --apply
 *
 * MANBA — korxona oy oxirida 1C dan ikkita kesim oladi:
 *
 *   "31.07.2026 qarzdorlik.json"  → oyning xizmat haqi HALI YOZILMAGAN holat
 *   "01.08.2026 qarzdorlik.json"  → o'sha xizmat haqi QO'SHILGAN holat
 *
 * Ikkovi ham 1C ichida bir xil sanani ("Расчеты на 31.07.26") ko'rsatadi,
 * shuning uchun ular `asOf` bo'yicha AJRATILADI: birinchisi 31.07, ikkinchisi
 * 01.08. Aks holda ular `@@unique([asOf, rawCustomer, rawContract])` da
 * to'qnashib, biri ikkinchisini bosib yozardi.
 *
 * Ikkovining farqi — SHU OYNING HISOBLANMASI. Boshqa yo'l bilan uni bu
 * fayllardan olib bo'lmaydi: kesim hisoboti aylanmani ko'rsatmaydi.
 *
 * Mijoz va shartnoma bazadagi yozuvlarga bog'lanadi, lekin bog'lanmasa ham
 * qator SAQLANADI (`rawCustomer`/`rawContract`) — moslashmagani ko'rinib
 * tursin, jimgina yo'qolmasin.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { requireImportFile } from "./import-source";
import { readLooseJsonArray } from "@/lib/bank/parsePlastik";
import { parseDebtSnapshot, contractKindOf, type DebtSnapshotLine } from "@/lib/debtReport";
import { formatNum as som } from "@/lib/format";
import fs from "node:fs";

/** Fayl → qaysi sanaga yoziladi. */
const SOURCES = [
  { file: "31.07.2026 qarzdorlik.json", asOf: new Date(Date.UTC(2026, 6, 31)), label: "hisoblanmagacha" },
  { file: "01.08.2026 qarzdorlik.json", asOf: new Date(Date.UTC(2026, 7, 1)), label: "hisoblanmadan keyin" },
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[`'‘’"«»]/g, "")
    .replace(/\b(mchj|mas'uliyati cheklangan jamiyati|xk|ntm|ooo|chp|yatt|ajm)\b/g, "")
    .replace(/[^a-z0-9Ѐ-ӿ]+/g, " ")
    .trim();

/** Shartnoma raqamini solishtirish uchun — kirill/lotin aralash yoziladi. */
const contractKey = (raw: string) =>
  raw
    .toUpperCase()
    .replace(/[\s.]/g, "")
    .replace(/Б/g, "B")
    .replace(/Р/g, "P")
    .replace(/К/g, "K")
    .replace(/С/g, "C")
    .replace(/А/g, "A")
    .replace(/Е/g, "E");

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const companies = await prisma.company.findMany({
    where: { isOwnFirm: false },
    select: { id: true, name: true },
  });
  const byName = new Map(companies.map((c) => [norm(c.name), c]));

  const contracts = await prisma.contract.findMany({
    select: { id: true, number: true, companyId: true },
  });
  const byContract = new Map(contracts.map((c) => [contractKey(c.number), c]));

  for (const src of SOURCES) {
    const path = requireImportFile(src.file);
    const parsed = parseDebtSnapshot(readLooseJsonArray(fs.readFileSync(path, "utf8")));

    const debt = parsed.lines.reduce((s, l) => s + l.debt, 0);
    const advance = parsed.lines.reduce((s, l) => s + l.advance, 0);

    // NAZORAT: shartnoma jamilari mijoz jamilariga teng bo'lishi SHART.
    // Teng bo'lmasa pog'ona adashgan (parser izohiga qarang) va raqamlarga
    // ishonib bo'lmaydi — import to'xtaydi.
    const ok =
      Math.abs(debt - parsed.customerTotals.debt) < 1 &&
      Math.abs(advance - parsed.customerTotals.advance) < 1;

    console.log();
    console.log(`${src.file}  (${src.label})`);
    console.log(`   1C sanasi     : ${parsed.asOf?.toISOString().slice(0, 10) ?? "?"}`);
    console.log(`   yoziladigan   : ${src.asOf.toISOString().slice(0, 10)}`);
    console.log(`   shartnomalar  : ${parsed.lines.length} ta`);
    console.log(`   qarz          : ${som(debt)}`);
    console.log(`   avans         : ${som(advance)}`);
    console.log(`   nazorat       : ${ok ? "✓ mijoz jamilari bilan mos" : "✗ MOS EMAS — import to'xtatiladi"}`);

    if (!ok) {
      console.error("\nPog'onalar adashgan — fayl tuzilishi kutilganidan farq qiladi.");
      process.exit(1);
    }

    const kinds = new Map<string, number>();
    for (const l of parsed.lines) {
      const k = contractKindOf(l.contractNumber);
      kinds.set(k, (kinds.get(k) ?? 0) + 1);
    }
    console.log(`   turlari       : ${[...kinds].map(([k, n]) => `${k} ${n}`).join(" · ")}`);

    let matchedCompany = 0;
    let matchedContract = 0;
    const resolve = (l: DebtSnapshotLine) => {
      const company = byName.get(norm(l.customerName)) ?? null;
      const contract = l.contractNumber ? (byContract.get(contractKey(l.contractNumber)) ?? null) : null;
      if (company) matchedCompany += 1;
      if (contract) matchedContract += 1;
      return { company, contract };
    };

    if (!apply) {
      parsed.lines.forEach(resolve);
      console.log(`   bazaga mos    : firma ${matchedCompany}/${parsed.lines.length} · shartnoma ${matchedContract}/${parsed.lines.length}`);
      continue;
    }

    for (const l of parsed.lines) {
      const { company, contract } = resolve(l);
      await prisma.debtSnapshot.upsert({
        where: {
          asOf_rawCustomer_rawContract_ownFirmName: {
            asOf: src.asOf,
            rawCustomer: l.customerName,
            rawContract: l.contractRaw ?? "",
            // Bo'sh satr, NULL EMAS: Postgres unikal indeksda NULL'larni
            // farqli deb hisoblaydi va kalit ishlamay qolardi.
            ownFirmName: l.ownFirmName ?? "",
          },
        },
        create: {
          asOf: src.asOf,
          companyId: company?.id ?? null,
          contractId: contract?.id ?? null,
          rawCustomer: l.customerName,
          rawContract: l.contractRaw ?? "",
          ownFirmName: l.ownFirmName ?? "",
          debt: l.debt,
          advance: l.advance,
        },
        update: {
          companyId: company?.id ?? null,
          contractId: contract?.id ?? null,
          ownFirmName: l.ownFirmName ?? "",
          debt: l.debt,
          advance: l.advance,
        },
      });
    }
    console.log(`   ✓ yozildi     : ${parsed.lines.length} qator · firma ${matchedCompany} · shartnoma ${matchedContract}`);
  }

  if (!apply) {
    console.log("\nHech narsa yozilmadi. Yozish uchun: --apply");
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
