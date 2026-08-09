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
}

const isSummaryLabel = (label: string): boolean => {
  const l = label.toLowerCase();
  return label.trim().endsWith(":") || SUMMARY_WORDS.some((w) => l.includes(w));
};

export function parseMealSheet(sheet: string, rows: Row[]): ParsedMealSheet {
  const empty: ParsedMealSheet = { sheet, expenses: [], total: 0, declaredTotal: null, matches: true };
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
  return {
    sheet,
    expenses,
    total,
    declaredTotal,
    matches: declaredTotal === null || Math.abs(declaredTotal - total) < 1,
  };
}

export function parseMealWorkbook(workbook: Record<string, Row[]>): ParsedMealSheet[] {
  return Object.entries(workbook).map(([sheet, rows]) => parseMealSheet(sheet, rows ?? []));
}
