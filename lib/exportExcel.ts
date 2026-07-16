import * as XLSX from "xlsx";

/**
 * Export an array of flat objects to a downloaded .xlsx file. Object keys become
 * column headers, so build the rows with the Uzbek labels you want to see.
 * Runs client-side only (XLSX.writeFile triggers a browser download).
 */
export function exportToExcel(
  rows: Record<string, unknown>[],
  filename: string,
  sheetName = "Ma'lumot",
) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}
