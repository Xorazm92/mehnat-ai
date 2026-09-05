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
import { matchCompanyByName, matchCompanyByInn } from "@/lib/companyMatch";
import { formatNum as som } from "@/lib/platform/format";
import fs from "node:fs";

/** Fayl → qaysi sanaga yoziladi. */
const SOURCES = [
  { file: "31.07.2026 qarzdorlik.json", asOf: new Date(Date.UTC(2026, 6, 31)), label: "hisoblanmagacha" },
  // STIRli variant — nomi bo'yicha taxmin qilish o'rniga aniq kalit beradi.
  { file: "01.08.2026. qani qarzdorlik (2).json", asOf: new Date(Date.UTC(2026, 7, 1)), label: "hisoblanmadan keyin" },
];

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
  /**
   * --opening: 31.07 kesimi ("hisoblanmagacha") moslashgan shartnomalarga
   * `Contract.openingDebt` yozadi. Bu ASRO hisob yuritishdan OLDINGI qarz:
   * iyul to'lovi hali hisoblanmagan holat, ya'ni iyul+avgust haqlarini ASRO
   * o'zi qo'shadi (BILLING_START=2026-07). Qo'shilmasa, eski qarz umuman
   * ko'rinmay qoladi va qarzdorlik 1C bilan hech qachon mos kelmasdi.
   *
   * Yagona son: debt − advance (manfiy = mijoz avans to'lagan — formula
   * `lib/debt.ts` manfiy outstanding ni avans deb talqin qiladi).
   */
  const setOpening = process.argv.includes("--opening");

  // `isActive` ham kerak: bazada arxivlangan egizak qatorlar bor va ular
  // STIR bo'yicha moslashtirishni bloklardi (`matchCompanyByInn` izohi).
  const companies = await prisma.company.findMany({
    where: { isOwnFirm: false },
    select: { id: true, name: true, inn: true, isActive: true },
  });

  // ── OLDINDAN: STIRLI FAYLLARDAN TAXALLUS O'RGANISH ─────────────────────
  //
  // STIRli hisobot nom va STIRni YONMA-YON beradi, ya'ni "1C nomi ↔ firma"
  // bog'lanishi TASDIQLANGAN — taxmin emas. Uni saqlab qo'ysak, STIRsiz
  // hisobotlar (31.07 fayli, eski eksportlar) ham to'g'ri bog'lanadi.
  //
  // Bu bosqich import HALQASIDAN OLDIN turadi va ATAYIN: fayllar sana
  // tartibida qayta ishlanadi, ya'ni STIRsiz 31.07 birinchi keladi va
  // halqa ichida o'rganilgan taxallusdan foydalana olmasdi.
  if (apply) {
    let learned = 0;
    for (const src of SOURCES) {
      const p = requireImportFile(src.file);
      const parsedPre = parseDebtSnapshot(readLooseJsonArray(fs.readFileSync(p, "utf8")));
      for (const l of parsedPre.lines) {
        const hit = matchCompanyByInn(l.customerInn, companies);
        if (!hit) continue;
        const existing = await prisma.companyAlias.findUnique({
          where: { alias: l.customerName },
          select: { id: true },
        });
        if (existing) continue;
        await prisma.companyAlias.create({
          data: {
            alias: l.customerName,
            companyId: hit.id,
            source: "1c-inn",
            note: `STIR ${l.customerInn} orqali tasdiqlangan`,
          },
        });
        learned += 1;
      }
    }
    if (learned) console.log(`\nSTIR orqali o'rganilgan taxallus: ${learned} ta`);
  }

  // Qo'lda tasdiqlangan va STIRdan o'rganilgan bog'lanishlar.
  const aliasRows = await prisma.companyAlias.findMany({ select: { alias: true, companyId: true } });
  const aliases = new Map(aliasRows.map((a) => [a.alias, a.companyId]));

  // SHARTNOMA FIRMA ICHIDAN qidiriladi: raqam faqat firma ichida unikal
  // (`@@unique([companyId, number])`). Ilgari u global kalit sifatida
  // ishlatilgan va 228 qatordan 160 tasi TASODIFIY firmaga bog'langan edi —
  // "13/26БК" sakkizta firmada bor.
  const contracts = await prisma.contract.findMany({
    select: { id: true, number: true, companyId: true },
  });
  const byCompanyContract = new Map(
    contracts.map((c) => [`${c.companyId}||${contractKey(c.number)}`, c])
  );

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
      // ── KALITLAR TARTIBI ──────────────────────────────────────────────
      // 1) STIR — eng ishonchli, hisobotda bo'lsa boshqasi qaralmaydi.
      //    Bazada bir nechta firma bir xil STIR bilan tursa TANLANMAYDI:
      //    dublikat STIR allaqachon bir marta muammo bo'lgan.
      // 2) Qo'lda tasdiqlangan taxallus.
      // 3) Nom (normalizatsiya bilan).
      const company =
        matchCompanyByInn(l.customerInn, companies) ??
        matchCompanyByName(l.customerName, companies, aliases);
      // Firma topilmasa shartnoma ham qidirilmaydi — firmasiz shartnoma
      // raqami hech narsani anglatmaydi.
      const contract =
        company && l.contractNumber
          ? (byCompanyContract.get(`${company.id}||${contractKey(l.contractNumber)}`) ?? null)
          : null;
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

    // ── BOSHLANG'ICH QARZ — faqat "hisoblanmagacha" kesimdan ─────────────
    // Ikkinchi fayl (hisoblanmagan keyin) ishlatilsa, iyul haqi IKKI MARTA
    // sanalar edi (ASRO ham o'zi qo'shadi).
    if (setOpening && apply && src.label === "hisoblanmagacha") {
      let opened = 0;
      let skippedNoContract = 0;
      const perContract = new Map<string, number>();
      for (const l of parsed.lines) {
        if (!l.contractNumber || !l.contractRaw) continue;
        const company =
          matchCompanyByInn(l.customerInn, companies) ??
          matchCompanyByName(l.customerName, companies, aliases);
        const contract =
          company && l.contractNumber
            ? (byCompanyContract.get(`${company.id}||${contractKey(l.contractNumber)}`) ?? null)
            : null;
        if (!contract) { skippedNoContract++; continue; }
        // Yagona son: qarz minus avans (manfiy natija = mijoz avansida).
        perContract.set(
          contract.id,
          (perContract.get(contract.id) ?? 0) + (Number(l.debt) - Number(l.advance))
        );
      }
      for (const [contractId, net] of perContract) {
        await prisma.contract.update({
          where: { id: contractId },
          data: { openingDebt: net.toFixed(2), openingDebtAt: src.asOf },
        });
        opened++;
      }
      console.log(`   ✓ boshlang'ich qarz: ${opened} ta shartnoma` +
        (skippedNoContract ? ` · ${skippedNoContract} qator shartnomaga bog'lanmadi (kesimda ko'rinadi, bazada hisoblanmaydi)` : ""));
    }


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
