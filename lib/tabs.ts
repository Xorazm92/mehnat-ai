/**
 * Yorliq (`?tab=`) qiymatini SERVERDA tekshirib olish.
 *
 * Bu `hooks/useTabParam.ts` da tura olmaydi: u fayl `"use client"` bilan
 * boshlanadi, ya'ni undan eksport qilingan har qanday funksiya server
 * komponentida chaqirilganda mijoz havolasiga aylanadi va ishlamaydi.
 * Shuning uchun sof (client'siz) yordamchi alohida turadi.
 *
 * Noto'g'ri yoki begona qiymat kelsa jimgina default'ga qaytadi — qo'lda
 * yozilgan `?tab=xyz` hech qachon bo'sh ekran bermaydi.
 */
export function readTabParam<T extends string>(
  raw: string | string[] | undefined,
  valid: readonly T[],
  fallback: T
): T {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && (valid as readonly string[]).includes(v) ? (v as T) : fallback;
}
