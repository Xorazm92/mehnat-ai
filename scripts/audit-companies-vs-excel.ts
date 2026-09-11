// =====================================================
// FIRMA REYESTRI: EXCEL ↔ ASRO — FAQAT O'QISH (Faza 2)
// =====================================================
//
// ⚠️ BU SKRIPT HECH NARSA YOZMAYDI va `--apply` bayrog'i YO'Q — ataylab.
//
// NEGA. Avgust yakunida ikki reyestr bir-biriga to'g'ri kelmaydi:
//   Excel  216 firma / 762 950 000 so'm shartnoma
//   ASRO   268 firma / 948 655 555 so'm
//   farq    52 firma / 185 705 555 so'm
//
// Bu farq yopilmasa oylik ham, qarzdorlik ham, kassa bazasi ham taxminiy
// raqam ustida ishlaydi. Lekin farqning QAYSI tomoni to'g'ri ekani kodga
// ma'lum emas: firma sentyabrda qo'shilgan bo'lishi ham, Excel chala
// bo'lishi ham, mijoz yopilgan bo'lishi ham mumkin. Shuning uchun skript
// faqat qatorma-qator taqqoslash chiqaradi — qaror odamniki.
//
// MANBA: `kassa/Фирмалар 31.08.2026.md` (gitga tushmaydi). Markdown jadval,
// ma'lumot qatorlari 5–220 (216 firma), 221-qator — jamlama.
//
// ⚠️ QATOR ORALIG'I QATTIQ YOZILGAN. Faylni "№ raqami bor har qanday qator"
// bo'yicha o'qish XATO: 227–252 qatorlarda XODIMLAR jadvali turibdi va u ham
// raqamlangan — butun fayl o'qilsa jami 762 950 000 o'rniga boshqa chiqadi.
// Shu sabab quyida ikkita qo'riqchi bor (qator soni + shartnoma jami); ular
// mos kelmasa skript ishlamaydi, chunki chala parse qilingan ro'yxat
// "firma yo'qolgan" degan soxta xulosaga olib keladi.
//
// ISHLATISH:
//   npx tsx scripts/audit-companies-vs-excel.ts
//   npx tsx scripts/audit-companies-vs-excel.ts --json > /tmp/audit.json
//   npx tsx scripts/audit-companies-vs-excel.ts --file="kassa/boshqa.md"
//
// PROD ma'lumotiga qarshi o'lchash uchun (lokal baza prod emas):
//   ssh -i ~/Downloads/ASRO.pem -N -L 15432:localhost:5432 ubuntu@16.192.135.23
//   DATABASE_URL="postgresql://debora:root@localhost:15432/inbola?schema=public" \
//     npx tsx scripts/audit-companies-vs-excel.ts

import "./load-env";
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { editDistance, nameCandidates, scoreMatch } from "@/lib/nameMatch";

// ---------- manba fayl konstantalari ----------

const DEFAULT_FILE = "kassa/Фирмалар 31.08.2026.md";
/** Ma'lumot qatorlari (1-indeksli, fayldagi haqiqiy qator raqami). */
const FIRST_DATA_LINE = 5;
const LAST_DATA_LINE = 220;
/** Qo'riqchilar — 221-qator jamlamasidan olingan. */
const EXPECTED_ROWS = 216;
const EXPECTED_CONTRACT_SUM = 762_950_000;

/** Ustun indekslari (0-indeksli, `|` bo'yicha bo'lingandan keyin). */
const COL = {
  no: 0,
  name: 1,
  inn: 2,
  vat: 3,
  accountant: 4,
  bankClient: 5,
  contract: 6,
  supervisor: 7,
  bankSum: 9,
  accountantSum: 10,
  chiefSum: 11,
  supervisorSum: 12,
} as const;

/**
 * Excel ustuni → ASRO'dagi biriktiruv(lar).
 *
 * `chief_accountant` bu yerda YO'Q: Excel'da "Ёркиной" ustuni ism emas, SUMMA
 * (7%) — bosh buxgalter hamma firmada bitta odam, shuning uchun ustunga ism
 * yozilmagan. Uni ism bo'yicha solishtirib bo'lmaydi, faqat summasini.
 *
 * ⚠️ ROL NOMI BITTA EMAS — bu skript birinchi yozilganda AYNAN SHU YERDA
 * xato qilingandi. "Назоратчи" uchun faqat `supervisor` qidirilgandi, chunki
 * LOKAL bazada shunday edi (209 ta `supervisor`, 3 ta `controller`). PRODDA
 * esa TESKARI: 198 ta `controller`, 24 ta `supervisor`. Natijada audit 166 ta
 * firmada "nazoratchi biriktirilmagan" deb SOXTA ogohlantirish berdi —
 * biriktiruvlar joyida turgan holda.
 *
 * Shuning uchun har ustun ro'yxat qabul qiladi va `Company` ning o'z SLOTI
 * ham hisobga olinadi: biriktiruv uch joyda yashaydi (slot, `ContractAssignment`,
 * majburiyat kesimi) va ularning birortasida bo'lsa — biriktirilgan sanaladi.
 */
const ROLES_BY_COLUMN = {
  accountant: ["accountant"],
  bankClient: ["bank_manager"],
  supervisor: ["controller", "supervisor"],
} as const;

/** Excel ustuni → `Company` dagi mos slot maydoni. */
const SLOT_BY_COLUMN = {
  accountant: "accountant",
  bankClient: "bankClient",
  supervisor: "supervisor",
} as const;

type ExcelRoleKey = keyof typeof ROLES_BY_COLUMN;

// ---------- normallashtirish ----------

/** Kirill → lotin. Firma nomlarida "ООО", "ЧП" aynan shu harflar bilan yozilgan. */
const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sh",
  ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
  ў: "o", қ: "q", ғ: "g", ҳ: "h",
};

/**
 * Yuridik shakl belgilari — solishtirishda tashlanadi.
 *
 * Sabab: bitta firma ikki reyestrda uch xil yoziladi — `"FINANCE COUNCIL" MCHJ`,
 * `ООО "FINANCE COUNCIL"`, `FINANCE COUNCIL`. Shakl nomning bir qismi emas.
 */
const LEGAL_FORMS = new Set([
  "ooo", "mchj", "mchi", "chj", "chp", "ychj", "yaatj", "atj", "aj", "xk", "qk",
  "mschj", "ok", "uk", "ip", "dk", "ff", "xt",
]);

/** Nomni solishtirish kalitiga aylantiradi: kirill→lotin, shakl tashlanadi. */
function companyKey(raw: string): string {
  const latin = raw
    .toLowerCase()
    .replace(/[ʻʼ‘’'`´"«»]/g, "")
    .replace(/[Ѐ-ӿ]/g, (ch) => CYRILLIC[ch] ?? "");
  const tokens = latin
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !LEGAL_FORMS.has(t));
  return tokens.join("");
}

/** INN kaliti — faqat raqamlar; bo'sh bo'lsa `null` (kalit sifatida ishlatilmaydi). */
function innKey(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

/** "1,000,000.00" / " 26 760 000 " → son. Bo'sh katak → 0. */
function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[\s ,]/g, "");
  if (cleaned === "" || cleaned === "-") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US").replace(/,/g, " ");
}

// ---------- Excel tomoni ----------

interface ExcelRow {
  no: string;
  line: number;
  name: string;
  inn: string | null;
  contract: number;
  people: Record<ExcelRoleKey, string>;
  sums: { accountant: number; bankClient: number; chief: number; supervisor: number };
}

function parseExcel(file: string): ExcelRow[] {
  const lines = readFileSync(file, "utf8").split("\n");
  const rows: ExcelRow[] = [];

  for (let line = FIRST_DATA_LINE; line <= LAST_DATA_LINE; line++) {
    const raw = lines[line - 1];
    if (raw === undefined) {
      throw new Error(`${file}: ${line}-qator yo'q — fayl kutilganidan qisqa.`);
    }
    // `|a|b|` → ["", "a", "b", ""] — chekka bo'shlarni tashlaymiz.
    const cells = raw.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < COL.supervisorSum + 1) {
      throw new Error(`${file}:${line} — ${cells.length} ta katak, kamida ${COL.supervisorSum + 1} kutilgan.`);
    }
    rows.push({
      no: cells[COL.no],
      line,
      name: cells[COL.name],
      inn: innKey(cells[COL.inn]),
      contract: parseAmount(cells[COL.contract]),
      people: {
        accountant: cells[COL.accountant],
        bankClient: cells[COL.bankClient],
        supervisor: cells[COL.supervisor],
      },
      sums: {
        accountant: parseAmount(cells[COL.accountantSum]),
        bankClient: parseAmount(cells[COL.bankSum]),
        chief: parseAmount(cells[COL.chiefSum]),
        supervisor: parseAmount(cells[COL.supervisorSum]),
      },
    });
  }

  // Qo'riqchilar — yuqoridagi izohga qarang.
  if (rows.length !== EXPECTED_ROWS) {
    throw new Error(`Kutilgan ${EXPECTED_ROWS} qator, o'qilgani ${rows.length}. Qator oralig'i o'zgargan bo'lishi mumkin.`);
  }
  const sum = rows.reduce((a, r) => a + r.contract, 0);
  if (sum !== EXPECTED_CONTRACT_SUM) {
    throw new Error(
      `Shartnoma jami mos emas: o'qilgani ${fmt(sum)}, kutilgani ${fmt(EXPECTED_CONTRACT_SUM)}. ` +
        `Ustun indeksi yoki qator oralig'i o'zgargan — natija ishonchsiz.`,
    );
  }
  return rows;
}

// ---------- ASRO tomoni ----------

type DbCompany = Awaited<ReturnType<typeof loadCompanies>>[number];

async function loadCompanies() {
  // ⚠️ FILTRSIZ — ataylab. Dastlab bu yerda `isOwnFirm: false` turgan edi va
  // natija YOLG'ON bo'lgan: Excel reyestrida ASRO'ning o'z 10 firmasi ham bor
  // (FINANCE COUNCIL, SOFI TEAM, TASTIFY, MOLIYA AI, …), shuning uchun ular
  // "ASROda yo'q" ro'yxatiga tushib qolgandi. `isActive: false` ham
  // qoldirilgan: "faqat ASROda" ro'yxatining asosiy izohi — yopilgan mijozlar.
  return prisma.company.findMany({
    select: {
      id: true,
      name: true,
      inn: true,
      isActive: true,
      isOwnFirm: true,
      // Biriktiruv UCH JOYDA yashaydi; slot ham hisobga olinadi.
      accountant: { select: { fullName: true } },
      bankClient: { select: { fullName: true } },
      supervisor: { select: { fullName: true } },
      contractAmount: true,
      createdAt: true,
      contractAssignments: {
        where: { isActive: true },
        select: {
          role: true,
          salaryType: true,
          salaryValue: true,
          user: { select: { fullName: true } },
        },
      },
    },
  });
}

/**
 * Firmaga biriktirilgan odam(lar)ning ismi.
 *
 * IKKALA MANBA ham o'qiladi: `ContractAssignment` qatorlari VA `Company` ning
 * o'z sloti. Ular bir-birini almashtirmaydi — prodda ba'zi firmada faqat slot
 * to'ldirilgan, boshqasida faqat biriktiruv qatori bor.
 */
function assignedNames(c: DbCompany, key: ExcelRoleKey): string[] {
  const roles = ROLES_BY_COLUMN[key] as readonly string[];
  const fromAssignments = c.contractAssignments
    .filter((a) => roles.includes(a.role))
    .map((a) => a.user.fullName);
  const slot = c[SLOT_BY_COLUMN[key]]?.fullName;
  return slot ? [...new Set([...fromAssignments, slot])] : fromAssignments;
}

// ---------- solishtirish ----------

/**
 * Aniq kalit topilmaganda ENG YAQIN ASRO yozuvini taklif qiladi.
 *
 * Nega kerak: Excel'ning INN'siz qatorlarida nom qo'lda yozilgan va bir harf
 * farq qiladi — "GARANT KOMPLEKS" ↔ "GARANT COMPLEX". Qat'iy kalit bularni
 * "firma yo'qolgan" deb ko'rsatadi va ro'yxatni shovqinga to'ldiradi.
 *
 * Bu MOSLIK EMAS, TAKLIF: natija alohida "taxmin" sifatida chiqadi va hech
 * qayerda moslik o'rnida ishlatilmaydi — qaror odamniki.
 */
function nearestCandidate(key: string, byName: Map<string, DbCompany[]>): DbCompany | null {
  if (key.length < 5) return null; // qisqa kalitda masofa ma'nosini yo'qotadi
  const limit = Math.max(2, Math.floor(key.length * 0.25));
  let best: DbCompany | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const [k, list] of byName) {
    const d = editDistance(k, key);
    if (d < bestDist) {
      bestDist = d;
      best = list[0];
    }
  }
  return bestDist <= limit ? best : null;
}

interface Diff {
  no: string;
  name: string;
  inn: string | null;
  detail: string;
}

interface Report {
  source: { file: string; rows: number; contractSum: number };
  db: { companies: number; active: number; ownFirms: number; contractSum: number };
  onlyExcel: Diff[];
  onlyAsro: Diff[];
  contractMismatch: Diff[];
  assignmentMismatch: Diff[];
}

function compare(excel: ExcelRow[], companies: DbCompany[], file: string): Report {
  const byInn = new Map<string, DbCompany[]>();
  const byName = new Map<string, DbCompany[]>();
  for (const c of companies) {
    const ik = innKey(c.inn);
    if (ik) {
      const list = byInn.get(ik) ?? [];
      list.push(c);
      byInn.set(ik, list);
    }
    const nk = companyKey(c.name);
    if (nk) {
      const list = byName.get(nk) ?? [];
      list.push(c);
      byName.set(nk, list);
    }
  }

  const matched = new Set<string>();
  const onlyExcel: Diff[] = [];
  const contractMismatch: Diff[] = [];
  const assignmentMismatch: Diff[] = [];

  for (const row of excel) {
    // Avval INN, keyin nom — INN yagona ishonchli kalit, nom qo'lda yoziladi.
    const hits = (row.inn ? byInn.get(row.inn) : undefined) ?? byName.get(companyKey(row.name)) ?? [];
    if (hits.length === 0) {
      const guess = nearestCandidate(companyKey(row.name), byName);
      onlyExcel.push({
        no: row.no,
        name: row.name,
        inn: row.inn,
        detail:
          `shartnoma ${fmt(row.contract)} · buxgalter "${row.people.accountant}" · ` +
          `nazoratchi "${row.people.supervisor}"` +
          (guess ? `\n       ↳ taxmin (moslik EMAS): ASROda "${guess.name}" [${guess.inn}]` : ""),
      });
      continue;
    }
    // Dublikat INN prodda tozalangan, lekin qo'riqchi qoladi: bir nechta
    // moslik bo'lsa hammasini belgilaymiz va birinchisi bilan solishtiramiz.
    for (const h of hits) matched.add(h.id);
    const c = hits[0];
    if (hits.length > 1) {
      assignmentMismatch.push({
        no: row.no,
        name: row.name,
        inn: row.inn,
        detail: `⚠ ${hits.length} ta ASRO yozuvi mos keldi: ${hits.map((h) => h.name).join(" · ")}`,
      });
    }

    const dbContract = Number(c.contractAmount ?? 0);
    if (dbContract !== row.contract) {
      contractMismatch.push({
        no: row.no,
        name: row.name,
        inn: row.inn,
        detail: `Excel ${fmt(row.contract)} ≠ ASRO ${fmt(dbContract)} (farq ${fmt(dbContract - row.contract)})`,
      });
    }

    const problems: string[] = [];
    for (const key of Object.keys(ROLES_BY_COLUMN) as ExcelRoleKey[]) {
      const role = key;
      const excelName = row.people[key].trim();
      const dbNames = assignedNames(c, key);
      if (!excelName && dbNames.length === 0) continue;
      if (!excelName) {
        problems.push(`${role}: Excel bo'sh, ASRO "${dbNames.join(", ")}"`);
        continue;
      }
      if (dbNames.length === 0) {
        problems.push(`${role}: Excel "${excelName}", ASRO biriktirmagan`);
        continue;
      }
      // Ism moslashtirish TAXMINIY: Excel'da faqat ism, bazada to'liq F.I.Sh.
      const ok = dbNames.some((db) => {
        const tier = scoreMatch(nameCandidates(db), excelName).tier;
        return tier === "exact" || tier === "near";
      });
      if (!ok) problems.push(`${role}: Excel "${excelName}" ≠ ASRO "${dbNames.join(", ")}"`);
    }
    if (problems.length > 0) {
      assignmentMismatch.push({ no: row.no, name: row.name, inn: row.inn, detail: problems.join(" · ") });
    }
  }

  const onlyAsro: Diff[] = companies
    .filter((c) => !matched.has(c.id))
    .map((c) => ({
      no: "—",
      name: c.name,
      inn: innKey(c.inn),
      detail:
        `${c.isOwnFirm ? "O'Z FIRMAMIZ · " : ""}` +
        `shartnoma ${fmt(Number(c.contractAmount ?? 0))} · ` +
        `${c.isActive ? "faol" : "NOFAOL"} · qo'shilgan ${c.createdAt.toISOString().slice(0, 10)} · ` +
        `${c.contractAssignments.length} biriktiruv`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    source: {
      file,
      rows: excel.length,
      contractSum: excel.reduce((a, r) => a + r.contract, 0),
    },
    db: {
      companies: companies.length,
      active: companies.filter((c) => c.isActive).length,
      ownFirms: companies.filter((c) => c.isOwnFirm).length,
      contractSum: companies.reduce((a, c) => a + Number(c.contractAmount ?? 0), 0),
    },
    onlyExcel,
    onlyAsro,
    contractMismatch,
    assignmentMismatch,
  };
}

// ---------- chiqarish ----------

function printSection(title: string, rows: Diff[]) {
  console.log();
  console.log(`── ${title} — ${rows.length} ta ${"─".repeat(Math.max(0, 52 - title.length))}`);
  if (rows.length === 0) {
    console.log("   (bo'sh)");
    return;
  }
  for (const r of rows) {
    console.log(`   ${r.no.padStart(3)} ${(r.inn ?? "INN yo'q").padEnd(10)} ${r.name}`);
    console.log(`       ${r.detail}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const fileArg = args.find((a) => a.startsWith("--file="));
  const file = fileArg ? fileArg.slice("--file=".length) : DEFAULT_FILE;

  const excel = parseExcel(file);
  const companies = await loadCompanies();
  const report = compare(excel, companies, file);

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("═".repeat(64));
  console.log("FIRMA REYESTRI: EXCEL ↔ ASRO  (faqat o'qish, hech narsa yozilmaydi)");
  console.log("═".repeat(64));
  console.log(`Manba : ${report.source.file}`);
  console.log(`Excel : ${report.source.rows} firma · shartnoma ${fmt(report.source.contractSum)}`);
  console.log(
    `ASRO  : ${report.db.companies} firma (${report.db.active} faol · ${report.db.ownFirms} o'z firmamiz) · ` +
      `shartnoma ${fmt(report.db.contractSum)}`,
  );
  console.log(
    `Farq  : ${report.db.companies - report.source.rows} firma · ` +
      `${fmt(report.db.contractSum - report.source.contractSum)}`,
  );

  printSection("1. FAQAT EXCEL'DA (ASROda yo'q)", report.onlyExcel);
  printSection("2. FAQAT ASRODA (Excel'da yo'q)", report.onlyAsro);
  printSection("3. SHARTNOMA SUMMASI FARQ QILADI", report.contractMismatch);
  printSection("4. BIRIKTIRUV FARQ QILADI", report.assignmentMismatch);

  console.log();
  console.log("─".repeat(64));
  console.log("Keyingi qadam: har qator uchun QAYSI TOMON to'g'ri ekani belgilanadi.");
  console.log("Bu skript hech narsani o'zgartirmaydi — tuzatish alohida qadam.");
}

main()
  .catch((e) => {
    console.error("XATO:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
