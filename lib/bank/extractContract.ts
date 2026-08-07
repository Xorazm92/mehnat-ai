// To'lov maqsadidan SHARTNOMA raqamini ajratish.
//
// Bu qism real vipiskalar (10 fayl, 503 to'lov maqsadi) ustida sozlangan.
// Bank operatorlari matnni erkin yozadi, shuning uchun bitta shablon yetmaydi.
//
// UCHRAGAN HAQIQIY VARIANTLAR:
//   "сог дог №02/26БК от 05.01.2026г"
//   "согл дог №12/26БК от 05.01.26г"            ← 2 raqamli yil
//   "согласно договору № 08/26БК от 05.01.2026 г."
//   "согл. к договору №18/26БК от 05.01.2026"
//   "по дог-у № 05/БК от 03.01.2025г"
//   "Дог 19/26БК от 03.01.2026"                  ← "№" umuman yo'q
//   "сог дог №1 от 15.04.2026г"                  ← bir raqamli
//   "01.03.2026 йил №15/26БК шартномага асосан"  ← raqam kalit so'zdan OLDIN
//   "01.03.2026 даги 02/К-сонли шартномага асосан"
//
// IKKI TUZOQ:
//
// 1) JS'da `\w` va `\b` faqat ASCII bilan ishlaydi. `дог\b` HECH QACHON
//    mos kelmaydi (kirill "г" bilan bo'sh joy orasida chegara yo'q), `договор\w*`
//    esa "договору" dagi oxirgi "у" ni qoldirib ketadi. Shuning uchun bu yerda
//    kirill harflari ochiq sinf bilan yoziladi, `\w`/`\b` ishlatilmaydi.
//
// 2) Bitta maqsadda bir nechta "№" bo'lishi mumkin:
//      "... по дог-у №14/БК от 03.01.2025г З/П,№1 от 30.04.2026"
//    14/БК — shartnoma, №1 — oylik vedomosti. Shuning uchun raqam SHARTNOMA
//    KALIT SO'ZIGA yaqin joydan qidiriladi, matnning boshidan emas.

/** Kirill harflari — `\w` ishlamagani uchun ochiq sinf. */
const CYR = "а-яёА-ЯЁ";

/**
 * "shartnoma" ma'nosidagi kalit so'zlar:
 *   сог / согл / согласно  (+ ixtiyoriy nuqta, bo'sh joy, "к")
 *   дог / дог-у / договор / договору / договора ...
 *   шартнома / шартномага / шартномасига ...
 */
const CONTRACT_KEYWORD = new RegExp(
  `(?:сог(?:л|ласно)?\\.?\\s*(?:к\\s*)?)?(?:дог(?:овор)?[${CYR}]*(?:-?у)?|шартнома[${CYR}]*)`,
  "gi"
);

/** Raqamning o'zi: "02/26БК", "05/БК", "11/06", "1", "7". */
const NUMBER_CORE = `\\d{1,4}(?:\\s*\\/\\s*[0-9A-Za-z${CYR}]{1,8})?`;

/**
 * Kalit so'zdan KEYIN: " № 13/26БК", " 19/26БК", "-у № 7".
 * `(?:№|N|#)` takrorlanishi mumkin ("№№03/26БК"), undan keyin tire kelishi
 * mumkin ("№-33/26БК") — ikkalasi ham real vipiskada uchradi.
 */
const NUMBER_AFTER = new RegExp(
  `^[\\s:.,\\-—]*(?:(?:№|N|#)\\s*)*[-–—]?\\s*(${NUMBER_CORE})`
);

/**
 * Kalit so'zdan OLDIN (o'zbekcha so'z tartibi): "№15/26БК шартномага".
 *
 * Yolg'on moslikni kesish uchun raqam quyidagilardan biri bo'lishi shart:
 *   "№" bilan boshlanadi        — "№15/26БК шартномага"
 *   "/" tutadi                  — "13/БК сонли шартномага"
 *   "сонли" bilan tugaydi       — "7- сонли шартномага"
 * Aks holda oldindagi yil ("2026 йил шартнома") raqam deb olinardi.
 *
 * Raqam bilan kalit so'z orasida bitta o'zbekcha so'z ("сонли", "-сонли")
 * turishi mumkin.
 */
const NUMBER_BEFORE = new RegExp(
  `(?:(?:№|N|#)\\s*(${NUMBER_CORE})` +
    `|(\\d{1,4}\\s*\\/\\s*[0-9A-Za-z${CYR}]{1,8})` +
    `|(\\d{1,4})(?=\\s*-?\\s*сонли))` +
    `\\s*(?:-?\\s*[${CYR}]+)?[\\s,]*$`
);

/** "от 05.01.2026" yoki "от 05.01.26" — shartnoma sanasi. */
const SIGNED_AT = /от\s*(\d{2})[.\s](\d{2})[.\s](\d{2,4})/i;

export interface ExtractedContract {
  /** Normallashtirilgan raqam: "02/26БК" (bo'sh joysiz, katta harflarda). */
  number: string;
  /** "от ..." dan olingan sana; topilmasa null. */
  signedAt: Date | null;
}

const normalizeNumber = (raw: string): string => raw.replace(/\s+/g, "").toUpperCase();

/** 2 raqamli yilni to'ldiradi: 26 → 2026. */
function fullYear(raw: string): number {
  const n = Number(raw);
  return raw.length === 2 ? 2000 + n : n;
}

function parseSignedAt(text: string): Date | null {
  const m = SIGNED_AT.exec(text);
  if (!m) return null;
  return new Date(Date.UTC(fullYear(m[3]), Number(m[2]) - 1, Number(m[1])));
}

/**
 * To'lov maqsadidan shartnoma raqamini ajratadi.
 *
 * `null` qaytishi xato EMAS: to'lovlarning katta qismi (soliq, bank
 * komissiyasi, karta to'ldirish) umuman shartnomasiz bo'ladi.
 */
export function extractContract(purpose: string | null | undefined): ExtractedContract | null {
  if (!purpose) return null;
  const text = String(purpose);

  CONTRACT_KEYWORD.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CONTRACT_KEYWORD.exec(text)) !== null) {
    if (match[0].length === 0) {
      CONTRACT_KEYWORD.lastIndex++; // bo'sh moslik cheksiz siklga olib kelmasin
      continue;
    }
    const after = text.slice(match.index + match[0].length);

    const forward = NUMBER_AFTER.exec(after);
    if (forward) {
      return { number: normalizeNumber(forward[1]), signedAt: parseSignedAt(after) };
    }

    // O'zbekcha tartib: raqam kalit so'zdan oldin turadi.
    const before = text.slice(0, match.index);
    const backward = NUMBER_BEFORE.exec(before);
    if (backward) {
      const raw = backward[1] ?? backward[2] ?? backward[3];
      if (raw) {
        return {
          number: normalizeNumber(raw),
          // Sana odatda raqamdan oldin yoziladi ("01.03.2026 йил №15/26БК").
          signedAt: parseSignedAt(text),
        };
      }
    }
  }

  return null;
}

/**
 * 1C reestridagi "Договор" ustuni: "№11/26БК от 05.01.2026".
 * Natija vipiskadan chiqqan raqam bilan bir xil ko'rinishda bo'ladi, shunda
 * ikkalasini to'g'ridan-to'g'ri solishtirish mumkin.
 */
export function parseContractCell(cell: unknown): ExtractedContract | null {
  if (cell == null) return null;
  const text = String(cell).trim();
  if (!text) return null;

  const m = new RegExp(`(?:№|N|#)?\\s*(${NUMBER_CORE})`).exec(text);
  if (!m) return null;

  return { number: normalizeNumber(m[1]), signedAt: parseSignedAt(text) };
}
