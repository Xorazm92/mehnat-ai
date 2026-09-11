// PLASTIK KARTA TUSHUMLARI — 1C "Реализация (акт, накладная)" reestridan.
//
// Bank vipiskasidan FARQI: bu bank fayli emas, 1C hisoboti. Oy oxirida bitta
// jamlanma bo'lib chiqadi (44 qatorning 43 tasi 31.07.2026 sanasida) va deyarli
// hammasi "Без договора" — mijozlar plastik karta bilan shartnomasiz to'laydi.
//
// IKKI O'ZIGA XOSLIK:
//
// 1) Fayl QOIDAGA TO'G'RI KELMAYDIGAN JSON: tashqi `[ ]` qavslari yo'q,
//    obyektlar vergul bilan ajratilgan va orasida `null` lar bor. Shuning
//    uchun o'qishdan oldin qavsga o'raladi (xuddi data/umumiy malumot
//    firmalar.json kabi).
//
// 2) Ustun kalitlari `Column2`, `Column14` ko'rinishida va sahifa nomi
//    ("Plastik") birinchi ustun kaliti bo'lib turadi. Kalitlar QATTIQ
//    YOZILMAYDI — sarlavha qatoridan ("Контрагент.ИНН" bor qator) topiladi,
//    chunki eksportdan eksportga o'zgaradi.
//
// ── UMUMIY SHARTNOMA (Faza 3.4) ────────────────────────────────────────
//
// Ilgari bu parser o'z tiplarini (`ParsedPlastik` / `PlastikReceipt`)
// qaytarardi va shu sababli dispetcherdan (`parseStatementRows`) TASHQARIDA
// turardi: `server/bankImport.ts` faylni oldindan o'zi skanerlab, plastik
// varag'ini topsa alohida yo'lga burardi. Beshta formatdan to'rttasi bitta
// shartnomaga (`ParsedStatement`) bo'ysunar, bittasi esa yo'q edi.
//
// Endi u ham `ParsedStatement` qaytaradi va formatni dispetcher aniqlaydi.
//
// ⚠️ YOZISH YO'LI BARIBIR ALOHIDA va shunday qolishi KERAK: plastik tushumi
// bank hisobiga tushmaydi, shuning uchun `BankTransaction` qatori yaratmaydi
// va to'g'ridan-to'g'ri `allocatePlastikReceipt` orqali `PaymentAllocation`
// yozadi. Birlashtirilgani — O'QISH shartnomasi, yozish emas.

import { BankStatementParseError, type ParsedStatement, type ParsedTransaction, type SheetRow } from "./types";
import { toDate } from "./normalize";

/** Tashqi qavssiz, `null` aralashgan obyektlar ketma-ketligini o'qiydi. */
export function readLooseJsonArray(raw: string): Record<string, unknown>[] {
  const text = raw.trim();
  const wrapped = text.startsWith("[") ? text : `[${text}]`;
  let parsed: unknown;
  try {
    parsed = JSON.parse(wrapped);
  } catch (e) {
    throw new BankStatementParseError(`Faylni JSON sifatida o'qib bo'lmadi: ${(e as Error).message}`);
  }
  if (!Array.isArray(parsed)) throw new BankStatementParseError("Kutilgani — obyektlar ro'yxati");
  const rows = parsed.filter((r): r is Record<string, unknown> => !!r && typeof r === "object");

  // ── VARAQ O'RAMINI OCHISH ──────────────────────────────────────────────
  //
  // Excel→JSON o'giruvchilari qatorlarni VARAQ NOMI bilan o'raydi:
  //   {"TDSheet": [ {...}, {...} ]}
  // Bunday fayl bu yerda BITTA qator bo'lib qaytardi va har bir o'quvchi
  // "sarlavha qatori topilmadi" deb to'xtardi — 2026-09-07 da
  // `scripts/import-debt-snapshot.ts` aynan shu sababdan ishlamay qoldi
  // (31.07 va 01.08 fayllari o'ramli ko'rinishda qayta eksport qilingan).
  //
  // Shart ataylab tor: FAQAT bitta qator bo'lsa va uning ichida FAQAT BITTA
  // massiv bo'lsa ochiladi. Haqiqiy vipiska/kesim qatorida massiv maydon
  // bo'lmaydi, ya'ni to'g'ri fayl xato ochilib ketmaydi.
  if (rows.length === 1) {
    const inner = Object.values(rows[0]).filter(Array.isArray);
    if (inner.length === 1) {
      return (inner[0] as unknown[]).filter(
        (r): r is Record<string, unknown> => !!r && typeof r === "object"
      );
    }
  }

  return rows;
}

const HEADER_MARK = "Контрагент.ИНН";

/** Dispetcher uchun format tanigichi — sarlavhada 1C reestri belgisi bormi. */
export function isPlastikFormat(rows: SheetRow[]): boolean {
  return rows.some((r) => Object.values(r).some((v) => String(v ?? "").trim() === HEADER_MARK));
}

export function parsePlastik(rows: SheetRow[]): ParsedStatement {
  const headerIndex = rows.findIndex((r) =>
    Object.values(r).some((v) => String(v ?? "").trim() === HEADER_MARK)
  );
  if (headerIndex === -1) {
    throw new BankStatementParseError(
      `Sarlavha qatori topilmadi — "${HEADER_MARK}" ustuni bo'lishi kerak. ` +
        `Bu 1C "Реализация (акт, накладная)" reestri bo'lishi shart.`
    );
  }

  const header = rows[headerIndex];
  const col: Record<string, string> = {};
  for (const [key, value] of Object.entries(header)) {
    const name = String(value ?? "").trim();
    if (name) col[name] = key;
  }

  const colNo = col["№ п/п"];
  const colDate = col["Дата"];
  const colDoc = col["Номер"];
  const colSum = col["Сумма"];
  const colName = col["Информация"];
  const colInn = col["Контрагент.ИНН"];
  const colContract = col["Договор"];

  if (!colNo || !colSum || !colDate) {
    throw new BankStatementParseError("Reestrda majburiy ustunlar yo'q (№ п/п, Дата, Сумма)");
  }

  const transactions: ParsedTransaction[] = [];
  let declaredTotal: number | null = null;

  for (const row of rows.slice(headerIndex + 1)) {
    const marker = row[colNo];

    // "Итого" — yakuniy yig'indi qatori, ma'lumot emas.
    if (typeof marker === "string" && marker.trim() === "Итого") {
      const value = Number(row[colSum]);
      if (Number.isFinite(value)) declaredTotal = value;
      continue;
    }
    // Ma'lumot qatorining birinchi ustuni — tartib raqami (son).
    if (typeof marker !== "number") continue;

    const date = toDate(row[colDate]);
    const amount = Number(row[colSum]) || 0;
    if (!date || amount <= 0) continue;

    const innRaw = colInn ? String(row[colInn] ?? "").trim() : "";
    transactions.push({
      valueDate: date,
      // HECH QACHON null EMAS: bu qiymat `allocatePlastikReceipt` da
      // idempotentlik kaliti bo'lib ishlatiladi, shuning uchun hujjat raqami
      // bo'sh bo'lsa qator tartibidan zaxira kalit yasaladi.
      docNumber: String(row[colDoc] ?? "").trim() || `row-${marker}`,
      opCode: null,
      direction: "income",
      amount,
      counterpartyInn: /^\d{9}$/.test(innRaw) ? innRaw : null,
      counterpartyName: colName ? String(row[colName] ?? "").trim() || null : null,
      counterpartyAccount: null,
      purpose: colContract ? String(row[colContract] ?? "").trim() || null : null,
    });
  }

  // ⚠️ CHALA FAYL — QATTIQ TO'XTASH, ogohlantirish emas.
  //
  // Ilgari bu tekshiruv `server/bankImport.ts` da, parserdan tashqarida
  // turardi va shu sababli faqat VEB yo'lida ishlardi. Endi parserning o'zida:
  // chala o'qilgan reestr pulning bir qismini jim yo'qotadi, shuning uchun
  // hech bir chaqiruvchi bu tekshiruvni tushirib qoldira olmasligi kerak.
  const total = transactions.reduce((sum, t) => sum + t.amount, 0);
  if (declaredTotal != null && Math.round(declaredTotal) !== Math.round(total)) {
    throw new BankStatementParseError(
      `Yig'indi mos kelmadi: fayldagi "Итого" ${Math.round(declaredTotal).toLocaleString("en-US")}, ` +
        `o'qilgani ${Math.round(total).toLocaleString("en-US")}. Fayl to'liq emas bo'lishi mumkin.`
    );
  }

  const dates = transactions.map((t) => t.valueDate.getTime());
  return {
    format: "plastik",
    // Plastik tushumi bank hisobiga tushmaydi — hisob raqami YO'Q.
    accountNumber: null,
    accountInn: null,
    holderName: null,
    periodFrom: dates.length > 0 ? new Date(Math.min(...dates)) : null,
    periodTo: dates.length > 0 ? new Date(Math.max(...dates)) : null,
    openingBalance: null,
    closingBalance: null,
    transactions,
  };
}

/** Faylni to'g'ridan-to'g'ri o'qiydi (skript va server uchun bitta yo'l). */
export function parsePlastikFile(raw: string): ParsedStatement {
  return parsePlastik(readLooseJsonArray(raw));
}
