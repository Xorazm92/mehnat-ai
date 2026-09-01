// =====================================================
// KUNLIK XO'JALIK XARAJATLARI ("Obed harajatlar")
// =====================================================
//
// Har oy alohida varaq. Tuzilishi — MATRITSA:
//   qatorlar = toifa (Taksi, Non, Kofe, Shakar, Idishlar …)
//   ustunlar = kun (sarlavhada Excel serial sana)
//   katak    = o'sha kuni o'sha toifaga sarflangan pul
//
// IKKI TUZOQ (ikkalasi ham summani bir necha barobar oshiradi):
//
// 1) Oxirgi ustun "Umumuy" — QATOR YIG'INDISI, kun emas. Faqat sarlavhasi
//    Excel serial (son) bo'lgan ustunlar olinadi.
//
// 2) Tafsilot qatorlaridan keyin JAMI qatorlari turadi: "Umumiy:",
//    "Dostavka va nonlar:", "Berildi Layloga", "Layloda qolgan pul",
//    "утган ойдан колган пул". Ular xarajat emas — hisob-kitob.
//
// Bu ikkisini hisobga olmasak 32 mln o'rniga 229 mln chiqadi.
//
// TEKSHIRUV: hisoblangan yig'indi varaqdagi "Umumiy:" qatori bilan
// solishtiriladi — 15 varaqdan 14 tasi aynan mos tushadi.

import { toAmount, cleanText, excelSerialToDate } from "@/lib/bank/normalize";

type Row = Record<string, unknown>;

/** Tafsilot tugab, hisob-kitob qatorlari boshlanganini bildiruvchi so'zlar. */
const SUMMARY_WORDS = [
  "umumiy", "dostavka", "qolgan", "berildi", "layloda",
  "утган", "овкат", "jami", "итого", "всего",
];

export interface MealExpense {
  date: Date;
  category: string;
  amount: number;
}

export interface ParsedMealSheet {
  sheet: string;
  expenses: MealExpense[];
  total: number;
  /** Varaqdagi "Umumiy:" qatori — tekshirish uchun. */
  declaredTotal: number | null;
  /** Hisoblangan va e'lon qilingan yig'indi mos keldimi. */
  matches: boolean;
  /** Varaq nomidagi oy (o'qilsa). */
  declaredMonth: { year: number; month: number } | null;
  /**
   * Katak sanalari varaq nomidagi oyga tushmaydi — FAYLDAGI xato.
   * Bunday varaqni jim import qilish yozuvni boshqa davrga tashlaydi.
   */
  monthMismatch: boolean;
}

const isSummaryLabel = (label: string): boolean => {
  const l = label.toLowerCase();
  return label.trim().endsWith(":") || SUMMARY_WORDS.some((w) => l.includes(w));
};


/**
 * Varaq nomidan oy — "Январь 2026", "август 2026", "Avgust | 2025",
 * "декабр 2025" (imlo xatosi bilan) kabi shakllar.
 *
 * NEGA KERAK: varaq nomi va katak ichidagi sana bir-biriga MOS KELMASLIGI
 * mumkin. Real faylda shunday bo'lgan: "Январь 2026" varag'idagi ustun
 * sarlavhalari 2026-DEKABR ni ko'rsatadi (Excel serial 46361 = 2026-12-05),
 * "февраль 2026" esa 2025-FEVRAL ni. Xato faylda, parserda emas — lekin uni
 * jimgina o'tkazib yuborish 39 ta yozuvni KELAJAK davriga tushirgan edi:
 * joriy oy hisobotida ko'rinmaydi, keyin o'sha oy kelganda yo'qdan paydo
 * bo'ladi.
 */
const MONTH_WORDS: [RegExp, number][] = [
  [/янв|yanv/i, 1], [/фев|fevr/i, 2], [/мар|mart/i, 3], [/апр|aprel/i, 4],
  [/ма[йя]|\bmay\b/i, 5], [/июн|iyun/i, 6], [/июл|iyul/i, 7], [/авг|avgust/i, 8],
  [/сен|sentyabr/i, 9], [/окт|oktyabr/i, 10], [/ноя|noyabr/i, 11], [/дек|dekabr/i, 12],
];

export function sheetMonthOf(sheet: string): { year: number; month: number } | null {
  const year = /(20\d{2})/.exec(sheet)?.[1];
  if (!year) return null;
  for (const [re, month] of MONTH_WORDS) {
    if (re.test(sheet)) return { year: Number(year), month };
  }
  return null;
}

export function parseMealSheet(sheet: string, rows: Row[]): ParsedMealSheet {
  const declaredMonth = sheetMonthOf(sheet);
  const empty: ParsedMealSheet = {
    sheet, expenses: [], total: 0, declaredTotal: null, matches: true,
    declaredMonth, monthMismatch: false,
  };
  if (rows.length === 0) return empty;

  const header = rows[0];
  const keys = Object.keys(header);
  const labelKey = keys[0];

  // Faqat sarlavhasi Excel serial bo'lgan ustunlar KUN hisoblanadi;
  // "Umumuy" (qator yig'indisi) shu bilan chetlanadi.
  const dayColumns: { key: string; date: Date }[] = [];
  for (const key of keys.slice(1)) {
    const value = header[key];
    if (typeof value !== "number" || value < 20000 || value > 200000) continue;
    dayColumns.push({ key, date: excelSerialToDate(value) });
  }
  if (dayColumns.length === 0) return empty;

  const expenses: MealExpense[] = [];
  let declaredTotal: number | null = null;

  for (const row of rows.slice(1)) {
    const label = cleanText(row[labelKey]);
    if (!label) continue;

    if (isSummaryLabel(label)) {
      // "Umumiy:" — tekshiruv qiymati; undan keyingi qatorlar hisob-kitob.
      if (declaredTotal === null && label.toLowerCase().startsWith("umumiy")) {
        declaredTotal = dayColumns.reduce((sum, c) => sum + toAmount(row[c.key]), 0);
      }
      break;
    }

    for (const col of dayColumns) {
      const amount = toAmount(row[col.key]);
      if (amount > 0) expenses.push({ date: col.date, category: label, amount });
    }
  }

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  // Sanalar varaq nomidagi oyga tushadimi. Bitta-ikkita chetdagi katak
  // bo'lishi mumkin (oy chegarasi), shuning uchun KO'PCHILIK qaraladi.
  const inMonth = declaredMonth
    ? expenses.filter(
        (e) =>
          e.date.getUTCFullYear() === declaredMonth.year &&
          e.date.getUTCMonth() + 1 === declaredMonth.month
      ).length
    : 0;
  const monthMismatch =
    declaredMonth !== null && expenses.length > 0 && inMonth < expenses.length / 2;

  return {
    sheet,
    expenses,
    total,
    declaredTotal,
    matches: declaredTotal === null || Math.abs(declaredTotal - total) < 1,
    declaredMonth,
    monthMismatch,
  };
}

export function parseMealWorkbook(workbook: Record<string, Row[]>): ParsedMealSheet[] {
  return Object.entries(workbook).map(([sheet, rows]) => parseMealSheet(sheet, rows ?? []));
}
