/**
 * "Qarzdorlik" ekranining yorliq reyestri.
 *
 * Nega alohida fayl (`lib/workTabs.ts`, `lib/kirimTabs.ts` bilan bir xil
 * sabab): sahifa server komponenti va `?tab=` ni SERVERDA tekshirishi kerak,
 * `QarzdorlikClient` esa `"use client"`.
 */
export type QarzdorlikTab = "undirish" | "holat" | "tolovlar" | "tekshiruv";

/**
 * TARTIB = ish tartibi, ma'lumot tartibi emas.
 *
 * "undirish" BIRINCHI va STANDART. Modulning biznes savoli — "kim birinchi
 * navbatda e'tibor talab qiladi?" — va unga faqat shu ko'rinish javob
 * beradi: undirish navbati, eskirish bosqichlari, mas'ul buxgalter,
 * keyingi suhbat sanasi.
 *
 * Ilgari standart "holat" edi — u 1C solishtiruv varaqasi, ya'ni
 * "1C nima deydi?" degan BOSHQA savolga javob. Undan ham yomoni: kesim
 * import qilinmagan bo'lsa ekran deyarli bo'sh ochilardi, holbuki
 * undirish ro'yxatida 228 ta firma kutib turardi.
 */
export const QARZDORLIK_TAB_IDS: readonly QarzdorlikTab[] = [
  "undirish",
  "holat",
  "tolovlar",
  "tekshiruv",
];

export const QARZDORLIK_DEFAULT_TAB: QarzdorlikTab = "undirish";
