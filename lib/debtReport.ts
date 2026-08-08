// =====================================================
// 1C «Задолженность покупателей» HISOBOTINI O'QISH
// =====================================================
//
// Bu hisobot mijozlarning HAQIQIY qarzini beradi — jamg'arilgan, ya'ni
// o'tgan oylardan qolgani ham ichida. ASRO o'zi hisoblaganida faqat joriy
// oyni ko'radi (`Company.contractAmount` − shu oy to'lovi), shuning uchun
// 759 mln chiqadi, 1C esa 2.09 mlrd deydi.
//
// TUZILISHI — uch pog'onali daraxt, tekis qatorlarga yoyilgan. Pog'ona
// belgisi JSON'da yo'q, shuning uchun qator TURI mazmunidan aniqlanadi:
//
//   "Academy Rizomulk" Ntm        ← MIJOZ        (jami 1 500 000)
//     №25/26БК от 05.01.2026      ← SHARTNOMA      900 000
//       "Seven`S Up" Mchj         ← BIZNING FIRMA  900 000
//     №29/БК от 12.08.2025        ← SHARTNOMA      600 000
//       "Seven`S Up" Mchj         ← BIZNING FIRMA  600 000
//
// Ya'ni "Seven`S Up" qatori mijoz EMAS — u shartnoma qaysi o'z firmamiz
// nomidan tuzilganini bildiradi. Buni farqlamasak, o'z firmalarimiz mijoz
// bo'lib qarzdorlar ro'yxatiga tushib qolardi.

import { toAmount, cleanText } from "@/lib/bank/normalize";

export class DebtReportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DebtReportParseError";
  }
}

type Row = Record<string, unknown>;

export interface DebtLine {
  customerName: string;
  /** "25/26БК" — № va sana olib tashlangan holda. */
  contractNumber: string | null;
  /** Faylda qanday yozilgan bo'lsa ("№25/26БК от 05.01.2026"). */
  contractRaw: string | null;
  /** Shartnoma qaysi o'z firmamiz nomidan tuzilgan. */
  ownFirmName: string | null;
  /** Davr boshidagi qarz. */
  debtBefore: number;
  /** Davr oxiridagi qarz — asosiy qiymat. */
  debt: number;
  advance: number;
}

export interface ParsedDebtReport {
  /** Hisobot sanasi (davr oxiri). */
  asOf: Date | null;
  lines: DebtLine[];
  /** Faqat mijoz darajasidagi jami — tekshirish uchun. */
  customerTotal: number;
}

const TITLE_RE = /Задолженность покупателей за\s*([\d.]+)\s*-\s*([\d.]+)/i;

/** "№25/26БК от 05.01.2026" → "25/26БК" */
export function contractNumberOf(raw: string): string | null {
  const m = /^№\s*([^\s]+?)\s*(?:от|$)/i.exec(raw.trim());
  return m ? m[1].trim() : null;
}

function toDateDmy(text: string): Date | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{2,4})$/.exec(text.trim());
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1])));
}

/**
 * @param ownFirmNames bizning firmalarimiz nomlari — shartnoma egasini
 *   mijozdan ajratish uchun. Bo'sh berilsa, "bizning firma" qatorlari
 *   MIJOZ deb qabul qilinadi va qarzdorlik soxta ko'tariladi.
 */
export function parseDebtReport(rows: Row[], ownFirmNames: Iterable<string>): ParsedDebtReport {
  if (rows.length === 0) throw new DebtReportParseError("Hisobot bo'sh");

  const norm = (s: string) => s.toLowerCase().replace(/[`'‘’"«»]/g, "").replace(/\s+/g, " ").trim();
  const ownSet = new Set([...ownFirmNames].map(norm));

  // Ustun kalitlari QATORDAN QATORGA farq qiladi: birinchi qatorda atigi
  // ikkitasi bor, sarlavhada esa o'nga yaqin. Shuning uchun birlashma
  // olinadi va tartib saqlanadi.
  const keys: string[] = [];
  for (const row of rows) {
    for (const k of Object.keys(row)) if (!keys.includes(k)) keys.push(k);
  }
  const nameKeyCol = keys[0];

  // Sarlavhadan davr oxirini olamiz.
  let asOf: Date | null = null;
  const title = keys.find((k) => TITLE_RE.test(k)) ?? "";
  const titleMatch = TITLE_RE.exec(title);
  if (titleMatch) asOf = toDateDmy(titleMatch[2]);

  // Ustunlarni sarlavha qatoridan topamiz: "Долг" ikki marta uchraydi
  // (davr boshi va oxiri), shuning uchun TARTIB bo'yicha olinadi.
  const headerIndex = rows.findIndex((r) =>
    Object.values(r).some((v) => String(v ?? "").trim() === "Договор")
  );
  if (headerIndex === -1) {
    throw new DebtReportParseError(
      'Sarlavha qatori topilmadi — "Договор" ustuni bo\'lishi kerak. ' +
        "Bu 1C «Задолженность покупателей» hisoboti bo'lishi shart."
    );
  }
  const header = rows[headerIndex];
  const debtCols = keys.filter((k) => String(header[k] ?? "").trim() === "Долг");
  const advanceCols = keys.filter((k) => String(header[k] ?? "").trim() === "Аванс");
  if (debtCols.length < 2) {
    throw new DebtReportParseError(`Ikkita "Долг" ustuni kutilgan, ${debtCols.length} ta topildi`);
  }
  const [debtBeforeCol, debtCol] = debtCols;
  const advanceCol = advanceCols[advanceCols.length - 1];

  const lines: DebtLine[] = [];
  let customer: string | null = null;
  let pending: DebtLine | null = null;
  let customerTotal = 0;

  const flush = () => {
    if (pending) lines.push(pending);
    pending = null;
  };

  for (const row of rows.slice(headerIndex + 1)) {
    const name = cleanText(row[nameKeyCol]);
    if (!name) continue;
    if (/^(Итого|Всего)/i.test(name)) continue;

    const debtBefore = toAmount(row[debtBeforeCol]);
    const debt = toAmount(row[debtCol]);
    const advance = advanceCol ? toAmount(row[advanceCol]) : 0;

    if (name.startsWith("№")) {
      // Shartnoma qatori — joriy mijozga tegishli.
      flush();
      pending = {
        customerName: customer ?? "(mijoz ko'rsatilmagan)",
        contractNumber: contractNumberOf(name),
        contractRaw: name,
        ownFirmName: null,
        debtBefore,
        debt,
        advance,
      };
      continue;
    }

    if (ownSet.has(norm(name))) {
      // Bizning firma — shartnoma egasi, mijoz emas.
      if (pending) pending.ownFirmName = name;
      continue;
    }

    // Yangi mijoz.
    flush();
    customer = name;
    customerTotal += debt;
  }
  flush();

  return { asOf, lines, customerTotal };
}
