// «ЧЕКЛАР РЎЙХАТИ» — soliq kabinetidan olinadigan CHEKMA-CHEK ro'yxat.
//
// «Кунлик ҳисобот» dan farqi: bu yerda bitta qator — chekning bitta MAHSULOT
// SATRI. To'lov summasi ("Жами банк карта", "Жами нақд пул") esa CHEK
// darajasida bo'lib, har bir mahsulot satrida TAKRORLANADI.
//
// TUZOQ: satrlarni to'g'ridan-to'g'ri yig'ish ko'p mahsulotli chekni necha
// marta takrorlangan bo'lsa shuncha marta sanaydi. Shuning uchun avval chek
// bo'yicha yagonalashtiriladi (ФМ + chek raqami + kun), keyin kun bo'yicha
// jamlanadi.

import { FiscalReportParseError, type FiscalDailyRow, type ParsedFiscalReport, type SheetRow } from "./types";

/** Sarlavhalarni solishtirish uchun: registr, bo'shliq va satr uzilishi tashlanadi. */
function norm(v: unknown): string {
  return String(v ?? "").toLowerCase().replace(/[\s\r\n./]/g, "");
}

type Field = "fm" | "inn" | "date" | "no" | "cash" | "card" | "type";

const LABELS: Record<Field, string[]> = {
  fm: ["фмрақами", "фмраками"],
  inn: ["стиржишшр", "стир"],
  date: ["чексанаси"],
  no: ["чекрақами", "чекраками"],
  cash: ["жаминақдпул", "жаминакдпул"],
  card: ["жамибанккарта"],
  type: ["чектури"],
};

function headerMap(row: SheetRow): Partial<Record<Field, string>> | null {
  const map: Partial<Record<Field, string>> = {};
  for (const [key, value] of Object.entries(row)) {
    const s = norm(value);
    if (!s) continue;
    for (const [field, variants] of Object.entries(LABELS) as [Field, string[]][]) {
      if (variants.includes(s)) map[field] = key;
    }
  }
  return map.card && map.date && map.no ? map : null;
}

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").replace(/[\s ]/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** "17.05.2026 20:31:05" → UTC kun boshi. */
function cellDay(v: unknown): Date | null {
  if (v instanceof Date) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
  const m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(String(v ?? "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Qaytarish cheki summani KAMAYTIRADI (Сотув — sotuv, Қайтариш — qaytarish). */
function isReturn(v: unknown): boolean {
  const s = String(v ?? "").toLowerCase();
  return s.includes("қайтар") || s.includes("кайтар") || s.includes("возврат");
}

export function parseChecksRows(rows: SheetRow[]): ParsedFiscalReport {
  if (!rows?.length) throw new FiscalReportParseError("Faylda ma'lumot yo'q");

  let cols: Partial<Record<Field, string>> | null = null;
  let start = 0;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const m = headerMap(rows[i]);
    if (m) { cols = m; start = i + 1; break; }
  }
  if (!cols) {
    throw new FiscalReportParseError('Cheklar ro\'yxati tanilmadi: "Жами банк карта" ustuni topilmadi.');
  }

  // Chek bo'yicha yagonalashtirish — takrorlangan mahsulot satrlari yig'ilmaydi.
  const checks = new Map<string, { day: Date; fm: string | null; inn: string | null; card: number; cash: number; ret: boolean }>();
  const warnings: string[] = [];
  let skipped = 0;

  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const day = cellDay(r[cols.date!]);
    if (!day) { if (String(r[cols.date!] ?? "").trim()) skipped++; continue; }
    const fm = cols.fm ? String(r[cols.fm] ?? "").trim() || null : null;
    const no = String(r[cols.no!] ?? "").trim();
    const key = `${fm ?? ""}|${no}|${day.getTime()}`;
    const card = num(r[cols.card!]);
    const cash = cols.cash ? num(r[cols.cash]) : 0;

    const seen = checks.get(key);
    if (seen) {
      // Bir chekning satrlari bir xil summani ko'rsatishi SHART. Farq bo'lsa
      // fayl buzuq — jim o'tkazib yubormaymiz.
      if (Math.abs(seen.card - card) > 0.01 && warnings.length < 20) {
        warnings.push(`Chek ${no} (${day.toISOString().slice(0, 10)}): satrlarda karta summasi har xil (${seen.card} ≠ ${card})`);
      }
      continue;
    }
    checks.set(key, {
      day, fm,
      inn: cols.inn ? String(r[cols.inn] ?? "").trim() || null : null,
      card, cash,
      ret: cols.type ? isReturn(r[cols.type]) : false,
    });
  }

  // Kun + apparat kesimida jamlash.
  const byDay = new Map<string, FiscalDailyRow>();
  for (const c of checks.values()) {
    const key = `${c.fm ?? ""}|${c.day.getTime()}`;
    let row = byDay.get(key);
    if (!row) {
      row = {
        fmNumber: c.fm, inn: c.inn, date: c.day,
        cashAmount: 0, cardAmount: 0, totalAmount: 0, returnedAmount: 0, receiptCount: 0,
      };
      byDay.set(key, row);
    }
    const sign = c.ret ? -1 : 1;
    row.cardAmount += sign * c.card;
    row.cashAmount += sign * c.cash;
    row.totalAmount += sign * (c.card + c.cash);
    if (c.ret) row.returnedAmount += c.card + c.cash;
    row.receiptCount++;
  }

  const out = [...byDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  if (!out.length) throw new FiscalReportParseError("Cheklar ro'yxatida birorta chek topilmadi");
  if (skipped) warnings.push(`${skipped} ta qator sanasi o'qilmadi va tashlab ketildi`);

  const times = out.map((r) => r.date.getTime());
  return {
    rows: out,
    periodFrom: new Date(Math.min(...times)),
    periodTo: new Date(Math.max(...times)),
    warnings,
    // Cheklar ro'yxati har doim TO'LIQ savdo — kanal kesimi bo'lmaydi.
    isBreakdown: false,
    channel: null,
  };
}

/** Kitobdagi birinchi mos sahifadan o'qiydi. */
export function parseChecksWorkbook(workbook: Record<string, SheetRow[]>): ParsedFiscalReport {
  const errors: string[] = [];
  for (const [name, rows] of Object.entries(workbook)) {
    try {
      return parseChecksRows(rows);
    } catch (e) {
      errors.push(`${name}: ${(e as Error).message}`);
    }
  }
  throw new FiscalReportParseError(errors.join(" · ") || "Faylda sahifa yo'q");
}
