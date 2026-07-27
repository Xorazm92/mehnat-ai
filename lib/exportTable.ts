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

/** Excel (.xlsx). `xlsx` dinamik import qilinadi — u ~800KB. */
export async function exportRowsToExcel<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  filename: string,
  sheetName = "Ma'lumot"
) {
  const { utils, writeFile } = await import("xlsx");
  const { header, body } = buildMatrix(rows, columns);
  const ws = utils.aoa_to_sheet([header, ...body]);

  ws["!cols"] = header.map((h, i) => ({
    wch: Math.min(Math.max(h.length, ...body.map((r) => r[i].length)) + 2, 50),
  }));

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, sheetName);
  writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/**
 * CSV. Excel'ning o'zbekcha/kirill matnni to'g'ri ochishi uchun BOM qo'shiladi —
 * BOM'siz Excel UTF-8 ni cp1251 deb o'qib, "o‘" belgilarini buzadi.
 */
export function exportRowsToCsv<T>(rows: T[], columns: ExportColumn<T>[], filename: string) {
  const { header, body } = buildMatrix(rows, columns);

  const escape = (v: string) => {
    // Formula injection: `=`, `+`, `-`, `@` bilan boshlanuvchi katak Excel'da
    // formula sifatida bajariladi. Oldiga apostrof qo'yib zararsizlantiramiz.
    const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
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
