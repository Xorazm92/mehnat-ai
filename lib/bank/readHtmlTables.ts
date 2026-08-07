// HTML KO'RINISHIDAGI VIPISKA (".xls" deb nomlangan, aslida HTML).
//
// Bank Klient-Bank tizimlari vipiskani ko'pincha HTML jadval qilib beradi va
// unga `.xls` kengaytmasini qo'yadi. Fayl ichida:
//   <HTML><head><title>Выписка</title>
//   <meta http-equiv="Content-Type" content="text/html; charset=windows-1251"/>
//
// NEGA `xlsx` GA ISHONMAYMIZ — bu eng muhim sabab:
//
//   `xlsx` HTML'dagi "05.08.2026" ni MM.DD.YYYY deb o'qib, uni 8-MAY ga
//   aylantirib qo'ydi (serial 46150). Ya'ni KUN bilan OY almashib ketdi.
//   Bunday xato JIM o'tadi: fayl muvaffaqiyatli "o'qilgan" bo'lib ko'rinadi,
//   lekin to'lovlar boshqa oyga tushib, mijozning qarzi noto'g'ri hisoblanadi.
//
// Shuning uchun bu yerda kataklar XOM MATN sifatida olinadi va sana keyin
// `toDate` orqali o'zbek/rus formatida (dd.mm.yyyy) o'qiladi.
//
// `<br>` `\n` ga aylantiriladi: kontragent katagida uch satr bir joyda turadi
// (МФО/hisob/STIR ⏎ nomi ⏎ to'lov maqsadi).

import type { SheetRow, Workbook } from "./types";

/** Fayl HTML ekanini aniqlaydi (kengaytmaga ishonmaymiz). */
export function looksLikeHtml(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 1024).toString("latin1").toLowerCase();
  return head.includes("<html") || head.includes("<table") || head.includes("<!doctype html");
}

/** `<meta charset=...>` dan kodlashni o'qiydi; topilmasa cp1251 (bank standarti). */
function detectCharset(buffer: Buffer): string {
  const head = buffer.subarray(0, 2048).toString("latin1");
  const m = /charset\s*=\s*["']?\s*([\w-]+)/i.exec(head);
  const found = m?.[1]?.toLowerCase();
  if (!found) return "windows-1251";
  // Node TextDecoder nomlari
  if (found === "utf8") return "utf-8";
  return found;
}

export function decodeHtml(buffer: Buffer): string {
  const charset = detectCharset(buffer);
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    // Noma'lum kodlash — kirill uchun eng ehtimolligi bilan urinib ko'ramiz.
    try {
      return new TextDecoder("windows-1251").decode(buffer);
    } catch {
      return buffer.toString("utf8");
    }
  }
}

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  laquo: "«",
  raquo: "»",
  mdash: "—",
  ndash: "–",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole);
}

/** Bitta katak matni: `<br>` → satr tashlash, qolgan teglar olib tashlanadi. */
function cellText(html: string): string | null {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  const text = decodeEntities(withBreaks)
    // Katak ichidagi ortiqcha bo'shliqni yig'amiz, lekin SATRLARNI saqlaymiz.
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
  return text.length > 0 ? text : null;
}

/**
 * HTML'dagi har bir `<table>` ni alohida sahifaga aylantiradi.
 *
 * Kalitlar POZITSIYA bo'yicha ("c0", "c1", …) — sarlavha matnidan emas.
 * Sabab: bu formatda sarlavha katagi ko'p satrli ("Дата/время ⏎ проводки")
 * va turli banklarda har xil yoziladi; parserlar esa ustun TARTIBIGA
 * tayanadi.
 */
export function readHtmlTables(buffer: Buffer): Workbook {
  const html = decodeHtml(buffer);
  const workbook: Workbook = {};

  const tables = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi) ?? [];
  tables.forEach((table, index) => {
    const rows: SheetRow[] = [];
    let width = 0;

    const trList = table.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
    const parsed: (string | null)[][] = trList.map((tr) => {
      const cells = tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) ?? [];
      const values = cells.map((c) =>
        cellText(c.replace(/^<t[dh][^>]*>/i, "").replace(/<\/t[dh]>$/i, ""))
      );
      width = Math.max(width, values.length);
      return values;
    });

    for (const values of parsed) {
      const row: SheetRow = {};
      // Barcha qatorlar bir xil kenglikda bo'lsin — parserlar
      // `Object.keys(rows[0])` bilan ustunlarni oladi.
      for (let i = 0; i < width; i++) row[`c${i}`] = values[i] ?? null;
      rows.push(row);
    }

    if (rows.length > 0) workbook[`Sheet${index + 1}`] = rows;
  });

  return workbook;
}
