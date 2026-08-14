/**
 * SERVER AMALI XATOSINI ODAM O'QIYDIGAN MATNGA AYLANTIRISH.
 *
 * Next PRODUCTION qurilmasida server amali `throw` qilgan xatoning MATNINI
 * mijozga bermaydi — uni "maxfiy ma'lumot sizib chiqmasin" deb almashtiradi:
 *
 *   "An error occurred in the Server Components render. The specific message
 *    is omitted in production builds to avoid leaking sensitive details.
 *    A digest property is included on this error instance…"
 *
 * Kod esa `toast.error(e.message)` deb o'sha matnni sodiqlik bilan
 * ko'rsatardi. Natijada buxgalter skrinshotni bekor qilmoqchi bo'lganda,
 * "Bu katakni o'zgartirib bo'lmaydi" o'rniga to'rt qatorlik inglizcha
 * texnik matnni ko'rgan (prod: digest 2387468489).
 *
 * DEV rejimida matn haqiqiy bo'ladi, shuning uchun bu xato faqat prod'da
 * ko'rinadi — sinovda sezilmaydi.
 *
 * ASOSIY YECHIM boshqa joyda: kutilgan QOIDA xatolari umuman `throw`
 * qilinmasligi kerak (masalan `upsertMonthlyReport` → `{ ok: false, error }`),
 * chunki qaytarilgan ma'lumot yashirilmaydi. Bu funksiya — qolgan hamma
 * uchun himoya to'ri: foydalanuvchi hech qachon Next'ning ichki matnini
 * ko'rmasin.
 */

/** Next prod'da almashtirib qo'yadigan matnning barqaror bo'laklari. */
const REDACTED_MARKERS = [
  "omitted in production",
  "An error occurred in the Server Components render",
  "digest property is included",
  "Server Components render",
];

/** Foydalanuvchiga ko'rsatib bo'lmaydigan (texnik) xabarmi? */
export function isRedactedServerError(message: string): boolean {
  const m = message.trim();
  if (!m) return true;
  return REDACTED_MARKERS.some((marker) => m.includes(marker));
}

/**
 * Ko'rsatish uchun xavfsiz matn.
 *
 * @param fallback Xabar yashirilgan bo'lsa ko'rsatiladigan o'zbekcha matn.
 */
export function friendlyError(e: unknown, fallback = "Amal bajarilmadi. Qaytadan urinib ko'ring."): string {
  const raw =
    e instanceof Error ? e.message : typeof e === "string" ? e : "";
  return isRedactedServerError(raw) ? fallback : raw;
}
