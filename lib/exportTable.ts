/**
 * Jadval eksporti — ustun ta'riflaridan CSV yoki Excel.
 *
 * Ilgari eksport uch joyda alohida yozilgan edi va HAMMASI faqat Excel:
 * CSV yo'q, PDF yo'q, chop etish uslubi yo'q. Buxgalter uchun CSV ko'pincha
 * qulayroq — 1C ham, bank mijozi ham uni to'g'ridan-to'g'ri o'qiydi.
 *
 * Muhim: eksport MA'NOni oladi, ko'rinishni emas. Ustunda `exportValue`
 * bo'lsa o'sha ishlatiladi, aks holda `sortValue`. React tugunlarini
 * (`accessor` natijasi) hech qachon eksportga qo'ymaymiz — u `<span>` bo'lishi
 * mumkin va faylga `[object Object]` tushardi.
 */

export interface ExportColumn<T> {
  key: string;
  header: string;
  exportValue?: (row: T) => string | number | null | undefined;
  sortValue?: (row: T) => string | number | null | undefined;
}

function cellText<T>(col: ExportColumn<T>, row: T): string {
  const raw = col.exportValue ? col.exportValue(row) : col.sortValue ? col.sortValue(row) : "";
  if (raw === null || raw === undefined) return "";
  return String(raw);
}

function buildMatrix<T>(rows: T[], columns: ExportColumn<T>[]) {
  const header = columns.map((c) => c.header);
  const body = rows.map((row) => columns.map((c) => cellText(c, row)));
  return { header, body };
}

/**
 * Formula injection himoyasi. `=`, `+`, `-`, `@` bilan boshlangan katak Excel'da
 * FORMULA sifatida bajariladi — `=cmd|...` kabi qator boshqa mashinada buyruq
 * ishga tushirishi mumkin. Oldiga apostrof qo'yamiz.
 *
 * Bu ilgari faqat CSV yo'lida bor edi; xlsx yo'li himoyasiz qolgan, holbuki
 * xavf aynan Excel'da. Endi ikkalasi bitta funksiyadan o'tadi.
 */
export function neutralizeFormula(v: string): string {
  return /^[=+\-@]/.test(v) ? `'${v}` : v;
}

/**
 * Yagona .xlsx yozuvchi — matritsa beriladi, brauzer faylni yuklab oladi.
 *
 * Ilgari eksport TO'RT joyda alohida yozilgan edi (`lib/exportExcel.ts`,
 * shu fayl, `OperationModule`, `OrganizationModule`) va faqat bittasida
 * formula himoyasi bor edi. Endi hammasi shu yerdan o'tadi.
 *
 * `exceljs` dinamik import qilinadi — u katta, va eksport kamdan-kam kerak.
 */
export async function writeSheet(
  header: string[],
  // `null`/`undefined` ataylab qabul qilinadi: chaqiruvchilar ixtiyoriy
  // maydonlarni to'g'ridan-to'g'ri uzatadi va ular bo'sh katakka aylanadi.
  body: (string | number | null | undefined)[][],
  filename: string,
  sheetName = "Ma'lumot",
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  // Excel varaq nomini 31 belgi bilan cheklaydi va : \ / ? * [ ] ni rad etadi.
  const ws = wb.addWorksheet(sheetName.replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || "Sheet1");

  ws.addRow(header.map(neutralizeFormula));
  for (const row of body) {
    ws.addRow(row.map((c) => (typeof c === "number" ? c : neutralizeFormula(String(c ?? "")))));
  }
  ws.getRow(1).font = { bold: true };

  ws.columns.forEach((col, i) => {
    const widest = Math.max(header[i]?.length ?? 0, ...body.map((r) => String(r[i] ?? "").length));
    col.width = Math.min(widest + 2, 50);
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Ustun ta'riflaridan .xlsx. */
export async function exportRowsToExcel<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  filename: string,
  sheetName = "Ma'lumot",
) {
  const { header, body } = buildMatrix(rows, columns);
  await writeSheet(header, body, filename, sheetName);
}

/**
 * Tekis obyektlar massividan .xlsx — kalitlar sarlavhaga aylanadi.
 * `lib/exportExcel.ts` ning o'rnini bosadi.
 */
export async function exportObjectsToExcel(
  rows: Record<string, unknown>[],
  filename: string,
  sheetName = "Ma'lumot",
) {
  const header = rows.length ? Object.keys(rows[0]) : [];
  const body = rows.map((r) => header.map((h) => (r[h] === null || r[h] === undefined ? "" : String(r[h]))));
  await writeSheet(header, body, filename, sheetName);
}

/**
 * CSV. Excel'ning o'zbekcha/kirill matnni to'g'ri ochishi uchun BOM qo'shiladi —
 * BOM'siz Excel UTF-8 ni cp1251 deb o'qib, "o‘" belgilarini buzadi.
 */
export function exportRowsToCsv<T>(rows: T[], columns: ExportColumn<T>[], filename: string) {
  const { header, body } = buildMatrix(rows, columns);

  const escape = (v: string) => {
    const safe = neutralizeFormula(v);
    return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };

  const csv = [header, ...body].map((r) => r.map(escape).join(";")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
