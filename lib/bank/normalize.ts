// Vipiskadagi xom qiymatlarni normal ko'rinishga keltirish.
//
// Ikkala bank formati ham bir xil ma'lumotni har xil ko'rinishda beradi:
// summa goh `"1,000,000.00"` matn, goh `1000000` son; sana goh `"02.07.2026"`,
// goh Excel serial float (`46211.7005`). Shu farqlar faqat SHU faylda hal
// qilinadi — parserlar allaqachon normal qiymat bilan ishlaydi.

/**
 * Summani songa aylantiradi.
 * `"1,183,896.25"` → 1183896.25 · `"9 500 000,00"` → 9500000 · `0` → 0
 */
export function toAmount(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  let s = String(value).trim();
  if (!s) return 0;
  // Nozik joy: ba'zi eksportlarda kasr vergul bilan ("9 500 000,00"), ba'zilarida
  // esa vergul mingliklarni ajratadi ("9,500,000.00"). Nuqta bor bo'lsa —
  // vergul ajratgich; nuqta yo'q va oxirgi vergul 2 raqam qoldirsa — kasr.
  const hasDot = s.includes(".");
  if (hasDot) {
    s = s.replace(/[,\s ]/g, "");
  } else {
    const lastComma = s.lastIndexOf(",");
    if (lastComma !== -1 && s.length - lastComma - 1 === 2) {
      s = s.slice(0, lastComma).replace(/[,\s ]/g, "") + "." + s.slice(lastComma + 1);
    } else {
      s = s.replace(/[,\s ]/g, "");
    }
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Excel serial → UTC yarim tunda sana. 25569 = 1970-01-01 ning serial raqami. */
export function excelSerialToDate(serial: number): Date {
  const days = Math.floor(serial);
  return new Date(Date.UTC(1970, 0, 1) + (days - 25569) * 86_400_000);
}

const DMY = /^(\d{2})\.(\d{2})\.(\d{4})$/;

/**
 * Sanani o'qiydi. Ikkala format ham qo'llab-quvvatlanadi:
 *   "02.07.2026" (kun.oy.yil)  ·  46211.7005 (Excel serial)
 * Vaqt qismi ATAYIN tashlanadi: bank vipiskasi kun bo'yicha solishtiriladi.
 */
export function toDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    // 1900-yil boshidan hisoblangan serial; 20000 dan kichik qiymat sana emas.
    if (!Number.isFinite(value) || value < 20000 || value > 200000) return null;
    return excelSerialToDate(value);
  }
  const s = String(value).trim();
  const m = DMY.exec(s);
  if (m) {
    const [, d, mo, y] = m;
    return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  }
  // Ba'zan serial matn ko'rinishida keladi.
  const n = Number(s);
  if (Number.isFinite(n) && n >= 20000 && n <= 200000) return excelSerialToDate(n);
  return null;
}

/** Sana qatoriga o'xshaydimi (yangi tranzaksiya boshlanishini aniqlash uchun). */
export const looksLikeDate = (value: unknown): boolean =>
  typeof value === "string" && DMY.test(value.trim());

/** Bo'sh joylarni yig'ib, matnni tozalaydi. Bo'sh bo'lsa null. */
export function cleanText(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).replace(/\s+/g, " ").trim();
  return s.length > 0 ? s : null;
}

/** 9 raqamli STIR. "ИНН:207189989" · "ИНН : 307077420" · "207189989" */
export function extractInn(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value);
  const tagged = /ИНН\s*:?\s*(\d{9})/i.exec(s);
  if (tagged) return tagged[1];
  const bare = /\b(\d{9})\b/.exec(s);
  return bare ? bare[1] : null;
}

/** Hisob raqami — 20 raqam. "Счет:20208000400243219001" */
export function extractAccount(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value);
  const tagged = /(?:Сч[ёе]т|Cчет)\s*:?\s*(\d{16,24})/i.exec(s);
  if (tagged) return tagged[1];
  const bare = /\b(\d{20})\b/.exec(s);
  return bare ? bare[1] : null;
}

/** MFO — 5 raqam. "МФО:00440" */
export function extractMfo(value: unknown): string | null {
  if (value == null) return null;
  const m = /МФО\s*:?\s*(\d{5})/i.exec(String(value));
  return m ? m[1] : null;
}
