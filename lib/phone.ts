// =====================================================
// TELEFON RAQAM NORMALLASHTIRISH — sof, framework-free
// =====================================================
// Telegram `request_contact` `phone_number` ni turli ko'rinishda qaytaradi
// ("+998901234567", "998901234567"), ERP'dagi User.phone esa qo'lda kiritilgan
// ("+998 90 123 45 67", "90 123 45 67"). Ikkalasini bir kalitga keltiramiz.
//
// Kalit — OXIRGI 9 RAQAM (O'zbekiston milliy raqami: operator kodi + abonent).
// Mamlakat kodi (998) ba'zi yozuvlarda bor, ba'zisida yo'q, shuning uchun uni
// kalitga kiritib bo'lmaydi. Kalit faqat INDEKS uchun — yakuniy solishtirish
// `sameNumber` orqali to'liq raqam suffiksi bo'yicha qilinadi.

/** Raqamdan boshqa hamma narsani olib tashlaydi. */
export function digitsOf(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** Milliy raqam uzunligi — O'zbekistonda operator kodi (2) + abonent (7). */
const KEY_LENGTH = 9;

/**
 * Indekslash uchun kalit: oxirgi 9 raqam. Raqam juda kalta bo'lsa (yoki bo'sh
 * bo'lsa) `null` — bunday qiymat hech qachon mos kelmasligi kerak, aks holda
 * to'ldirilmagan `phone` ustunlari bir-biriga "mos" bo'lib qolardi.
 */
export function phoneKey(raw: string | null | undefined): string | null {
  const d = digitsOf(raw);
  if (d.length < KEY_LENGTH) return null;
  return d.slice(-KEY_LENGTH);
}

/**
 * Ikki raqam bitta odamnikimi? Kalit mos kelishi shart, qolaversa to'liq
 * raqamlardan biri ikkinchisining suffiksi bo'lishi kerak — shunda "998901234567"
 * va "901234567" mos keladi, ammo "+7 912 345 6789" (chet el) tasodifan
 * "123456789" bilan mos kelib qolmaydi.
 */
export function sameNumber(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = phoneKey(a);
  const kb = phoneKey(b);
  if (ka == null || kb == null || ka !== kb) return false;
  const da = digitsOf(a);
  const db = digitsOf(b);
  return da.endsWith(db) || db.endsWith(da);
}

/** Ko'rsatish uchun: "+998 90 123 45 67". Normallashmasa — asl qiymat. */
export function formatPhone(raw: string | null | undefined): string {
  const key = phoneKey(raw);
  if (key == null) return (raw ?? "").trim();
  return `+998 ${key.slice(0, 2)} ${key.slice(2, 5)} ${key.slice(5, 7)} ${key.slice(7, 9)}`;
}
