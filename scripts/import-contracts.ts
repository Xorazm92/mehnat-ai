/**
 * 1C "Реализация (акт, накладная)" REESTRIDAN SHARTNOMALARNI IMPORT QILISH.
 *
 * Manba: contract_json_files/*.json — har bir o'z firmamiz uchun bitta fayl.
 * Har qatorda: mijoz nomi, Контрагент.ИНН, Договор ("№11/26БК от 05.01.2026")
 * va Сумма (oylik shartnoma summasi).
 *
 * NEGA BU KERAK: bazadagi 213 firmaning HAMMASIDA `contractAmount = 1 000 000`
 * (zaglushka) va atigi 2 tasida shartnoma raqami bor. Reestrda esa haqiqiy
 * summalar turibdi.
 *
 * ⚠️  DIQQAT — OYLIKKA TA'SIR QILADI.
 * `lib/kpiLogic.ts` xodimlarning ulushini aynan `Company.contractAmount` dan
 * foizda hisoblaydi. Shuning uchun summa YOZILISHIDAN OLDIN farq hisoboti
 * ko'rsatiladi va tasdiq talab qilinadi:
 *
 *   npx tsx scripts/import-contracts.ts            # farq hisoboti (hech narsa yozilmaydi)
 *   npx tsx scripts/import-contracts.ts --apply    # shartnomalarni yozadi
 *   npx tsx scripts/import-contracts.ts --apply --with-amounts
 *                                                  # + contractAmount ni ham yangilaydi
 *
 * Idempotent: Contract @@unique([companyId, number]).
 */
import "./load-env"; // birinchi bo'lishi shart
import { prisma } from "@/lib/prisma";
import { formatNum as som } from "@/lib/format";
import fs from "node:fs";
import path from "node:path";
import { parseContractCell } from "@/lib/bank/extractContract";

const SOURCE_DIR = path.join(process.cwd(), "contract_json_files");

/** Fayl nomi → o'z firmamiz STIR'i (shartnoma kim nomidan tuzilgan). */
const FILE_TO_OWN_INN: Record<string, string> = {
  "barokat.json": "304868808",
  "council.json": "302672452",
  "fininfo.json": "310844581",
  "moliya.json": "307077420",
  "powerful.json": "310224847",
  "sardorbek.json": "308435425",
  "seven.json": "306918663",
  "sofy tim.json": "309058750",
  "tastify.json": "307609477",
  "toolstreak.json": "309850241",
};

interface RegistryRow {
  sourceFile: string;
  ownInn: string;
  clientInn: string;
  clientName: string | null;
  contractNumber: string;
  signedAt: Date | null;
  amount: number;
}

/**
 * Reestr faylini o'qiydi.
 *
 * TUZOQ: sarlavha qatori har faylda HAR XIL indeksda (1 yoki 2), va ustunlar
 * `__EMPTY_N` kalitlariga tushadi — "Договор" ba'zi faylda `__EMPTY_15`,
 * ba'zisida `__EMPTY_16`. Shuning uchun ustun kalitlari SARLAVHA QATORIDAN
 * topiladi, hech qachon qattiq yozilmaydi.
 */
function readRegistry(file: string): RegistryRow[] {
  const ownInn = FILE_TO_OWN_INN[file];
  if (!ownInn) return [];

  const workbook = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, file), "utf8"));
  const rows: Record<string, unknown>[] = workbook[Object.keys(workbook)[0]] ?? [];

  const headerIndex = rows.findIndex((r) =>
    Object.values(r).some((v) => String(v).trim() === "Контрагент.ИНН")
  );
  if (headerIndex === -1) return [];

  const header = rows[headerIndex];
  const col: Record<string, string> = {};
  for (const [key, value] of Object.entries(header)) {
    const name = String(value ?? "").trim();
    if (name) col[name] = key;
  }

  const out: RegistryRow[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const clientInn = row[col["Контрагент.ИНН"]];
    if (!clientInn) continue;

    const contract = parseContractCell(row[col["Договор"]]);
    if (!contract) continue;

    out.push({
      sourceFile: file,
      ownInn,
      clientInn: String(clientInn).trim(),
      clientName: col["Информация"] ? (String(row[col["Информация"]] ?? "").trim() || null) : null,
      contractNumber: contract.number,
      signedAt: contract.signedAt,
      amount: Number(row[col["Сумма"]]) || 0,
    });
  }
  return out;
}


async function main() {
  const apply = process.argv.includes("--apply");
  const withAmounts = process.argv.includes("--with-amounts");

  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`Manba papka topilmadi: ${SOURCE_DIR}`);
    process.exit(1);
  }

  // ── 1. Reestrlarni o'qish ─────────────────────────────────────────────
  const files = fs.readdirSync(SOURCE_DIR).filter((f) => f.endsWith(".json") && !f.includes("conversion_log"));
  const registry: RegistryRow[] = [];
  for (const file of files.sort()) {
    const rows = readRegistry(file);
    console.log(`${file.padEnd(20)} ${String(rows.length).padStart(3)} ta shartnoma qatori`);
    registry.push(...rows);
  }
  console.log(`\nJami ${registry.length} qator, ${new Set(registry.map((r) => r.clientInn)).size} ta unikal mijoz STIR.`);

  // ── 2. STIR bo'yicha bazadagi firmalarga bog'lash ─────────────────────
  const ownFirms = await prisma.company.findMany({
    where: { isOwnFirm: true },
    select: { id: true, inn: true },
  });
  const ownByInn = new Map(ownFirms.map((c) => [c.inn, c.id]));

  const clientInns = Array.from(new Set(registry.map((r) => r.clientInn)));
  const clients = await prisma.company.findMany({
    where: { inn: { in: clientInns }, isOwnFirm: false },
    select: { id: true, inn: true, name: true, contractAmount: true, contractNumber: true },
  });
  // Bir STIR bir nechta firmaga to'g'ri kelishi mumkin (inn @unique EMAS).
  const clientsByInn = new Map<string, typeof clients>();
  for (const c of clients) {
    const list = clientsByInn.get(c.inn) ?? [];
    list.push(c);
    clientsByInn.set(c.inn, list);
  }

  const unmatched: RegistryRow[] = [];
  const ambiguous: string[] = [];
  const amountChanges: {
    name: string;
    inn: string;
    from: number;
    to: number;
  }[] = [];
  const toCreate: (RegistryRow & { companyId: string; ownFirmId: string | null })[] = [];

  for (const row of registry) {
    const matches = clientsByInn.get(row.clientInn);
    if (!matches || matches.length === 0) {
      unmatched.push(row);
      continue;
    }
    if (matches.length > 1) {
      ambiguous.push(
        `${row.clientInn} (${row.clientName ?? "?"}) → ${matches.map((m) => m.name).join(" | ")}`
      );
    }
    const company = matches[0];
    toCreate.push({
      ...row,
      companyId: company.id,
      ownFirmId: ownByInn.get(row.ownInn) ?? null,
    });

    const currentAmount = Number(company.contractAmount ?? 0);
    if (row.amount > 0 && row.amount !== currentAmount) {
      amountChanges.push({
        name: company.name,
        inn: company.inn,
        from: currentAmount,
        to: row.amount,
      });
    }
  }

  // ── 3. Farq hisoboti ──────────────────────────────────────────────────
  console.log(`\n${"═".repeat(72)}`);
  console.log("FARQ HISOBOTI");
  console.log("═".repeat(72));
  console.log(`Bazadagi firmaga bog'landi : ${toCreate.length} / ${registry.length}`);
  console.log(`Mos firma topilmadi        : ${unmatched.length}`);
  console.log(`Shubhali (bir STIR, ko'p firma): ${ambiguous.length}`);

  if (amountChanges.length > 0) {
    console.log(`\n⚠️  SHARTNOMA SUMMASI O'ZGARADI — ${amountChanges.length} ta firma.`);
    console.log("   Bu xodimlar oyligiga TA'SIR QILADI (lib/kpiLogic.ts foizni shundan hisoblaydi).\n");
    const sorted = [...amountChanges].sort((a, b) => b.to - a.to);
    for (const c of sorted.slice(0, 25)) {
      console.log(
        `   ${c.name.slice(0, 34).padEnd(36)} ${som(c.from).padStart(12)} → ${som(c.to).padStart(14)}`
      );
    }
    if (sorted.length > 25) console.log(`   … va yana ${sorted.length - 25} ta`);

    const before = amountChanges.reduce((s, c) => s + c.from, 0);
    const after = amountChanges.reduce((s, c) => s + c.to, 0);
    console.log(`\n   Jami shartnoma summasi: ${som(before)} → ${som(after)} so'm`);
    console.log(`   Farq: ${after - before >= 0 ? "+" : ""}${som(after - before)} so'm`);
  }

  if (unmatched.length > 0) {
    console.log(`\n📋 QO'LDA KO'RIB CHIQISH — bazada topilmagan mijozlar (${unmatched.length}):`);
    const seen = new Set<string>();
    for (const r of unmatched) {
      if (seen.has(r.clientInn)) continue;
      seen.add(r.clientInn);
      console.log(`   ${r.clientInn}  ${(r.clientName ?? "?").slice(0, 46).padEnd(48)} [${r.sourceFile}]`);
    }
  }

  if (ambiguous.length > 0) {
    console.log(`\n⚠️  BIR STIR — BIR NECHTA FIRMA (${ambiguous.length}):`);
    ambiguous.slice(0, 10).forEach((a) => console.log("   " + a));
  }

  if (!apply) {
    console.log(`\n${"─".repeat(72)}`);
    console.log("Hech narsa yozilmadi. Yozish uchun:");
    console.log("   npx tsx scripts/import-contracts.ts --apply");
    console.log("   npx tsx scripts/import-contracts.ts --apply --with-amounts   (summani ham)");
    return;
  }

  // ── 4. Yozish ─────────────────────────────────────────────────────────
  let created = 0;
  let skipped = 0;
  for (const row of toCreate) {
    const existing = await prisma.contract.findUnique({
      where: { companyId_number: { companyId: row.companyId, number: row.contractNumber } },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.contract.create({
      data: {
        companyId: row.companyId,
        ownFirmId: row.ownFirmId,
        number: row.contractNumber,
        signedAt: row.signedAt,
        amount: row.amount > 0 ? row.amount : null,
        source: "1c_import",
      },
    });
    created++;
  }
  console.log(`\n✓ Shartnoma yozildi: ${created} ta yangi, ${skipped} ta allaqachon bor edi.`);

  if (withAmounts) {
    let updated = 0;
    for (const row of toCreate) {
      if (row.amount <= 0) continue;
      await prisma.company.update({
        where: { id: row.companyId },
        data: { contractAmount: row.amount, contractNumber: row.contractNumber, contractDate: row.signedAt },
      });
      updated++;
    }
    console.log(`✓ contractAmount yangilandi: ${updated} ta firma.`);
  } else {
    console.log("ℹ️  contractAmount TEGILMADI (--with-amounts berilmagan).");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
