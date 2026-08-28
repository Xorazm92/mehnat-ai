// EXCEL / HTML FAYLNI XOM JADVALGA O'GIRISH — vipiska va kassa hisoboti uchun
// bitta manba.
//
// Fayl SERVERDA o'qiladi: kirish ma'lumotiga ishonmaymiz va parser mantiqi
// bitta joyda qoladi.

import { looksLikeHtml, readHtmlTables } from "./readHtmlTables";
import type { Workbook } from "./types";

export async function readWorkbook(file: File): Promise<Workbook> {
  const buffer = Buffer.from(await file.arrayBuffer());

  // ".xls" HAR DOIM ham Excel emas. Bank Klient-Bank tizimlari vipiskani
  // HTML jadval qilib berib, unga .xls kengaytmasini qo'yadi. Bunday faylni
  // `xlsx` ga bersak, u sanani MM.DD deb o'qib kun bilan oyni almashtiradi
  // (05.08.2026 → 8-may) va bu XATO JIM O'TADI. Shuning uchun HTML alohida,
  // xom matn sifatida o'qiladi.
  if (looksLikeHtml(buffer)) {
    const workbook = readHtmlTables(buffer);
    if (Object.keys(workbook).length === 0) {
      throw new Error("HTML faylda jadval topilmadi");
    }
    return workbook;
  }

  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false, codepage: 1251 });
  const workbook: Workbook = {};
  for (const name of wb.SheetNames) {
    workbook[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null });
  }
  return workbook;
}
