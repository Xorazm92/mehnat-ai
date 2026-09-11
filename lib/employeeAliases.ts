// =====================================================
// XODIM NOMI — QO'LDA HAL QILINGAN NOANIQLIKLAR
// =====================================================
//
// Excel daftarlarida xodim QISQA ism bilan yoziladi ("Azizbek"), bazada esa
// to'liq yozuv turadi. Odatda `lib/nameMatch.ts` ni moslashtirish yetarli,
// lekin UCHTA holatda avtomatik moslashtirish PRINSIPIAL ravishda ishlamaydi:
// bir qisqa ismga bir nechta HAQIQIY xodim mos keladi.
//
// Bunda tanlovni algoritm emas, ODAM qiladi — va qaror aynan shu yerda,
// kodda yashaydi. Skript ichiga yashirilgan `if` yoki bazadagi jim
// tuzatishdan farqli, bu yerda qaror ko'rinadi, izohlanadi va kod ko'rib
// chiqishda tekshiriladi.
//
// ⚠️ NOTO'G'RI QAROR = PULNI BOSHQA ODAMGA YOZISH. Shuning uchun har
// satrga SABAB yoziladi va sabab "shunday deb o'ylayman" emas, tekshirilgan
// dalil bo'lishi kerak.

/**
 * Excel'dagi ism → bazadagi `User.fullName`.
 *
 * Kalit — Excel/daftardagi qisqa yozuv. Qiymat — bazadagi TO'LIQ nom
 * (`User.fullName` bilan AYNAN bir xil).
 */
export const EMPLOYEE_ALIASES: Record<string, string> = {
  // Ikkita "Azizbek" — IKKI XIL ODAM, dublikat emas:
  //   Azizbek              bank_manager · 108 biriktiruv · 2 payout · 3 kanal
  //   Azizbek (buxgalter)  accountant   ·  12 biriktiruv · 0 payout · 0 kanal
  // Daftardagi "Azizbek" — BANK KLIENT (egasi tasdiqladi, 2026-09-11).
  Azizbek: "Azizbek",

  // "Adham" — BO'SH DUBLIKAT: 0 biriktiruv, 0 payout, 0 kanal. Ishlatilayotgani
  // "Adxam" (12 biriktiruv). Ikkalasi ham 2026-06-13 da yaratilgan.
  Adxam: "Adxam",
  Adham: "Adxam",

  // "Abdug'ani" — BO'SH DUBLIKAT: 0 biriktiruv, 0 payout, 0 kanal.
  // Ishlatilayotgani "Abdugani" (16 biriktiruv, 3 payout, 1 kanal).
  Abdugani: "Abdugani",
  "Abdug'ani": "Abdugani",
};

/**
 * Kanal nomi → bazadagi `User.fullName`.
 *
 * Kanal nomi to'liq F.I.Sh. bo'ladi ("JABBOROV ADHAM") va u yuqoridagi
 * dublikatlarning ikkalasiga ham bir xil masofada turadi — shuning uchun
 * alohida jadval.
 */
export const CHANNEL_OWNER_ALIASES: Record<string, string> = {
  // "JABBOROV ADHAM" kartasi — "Adxam" ga tegishli (bo'sh "Adham" ga emas).
  "JABBOROV ADHAM": "Adxam",
};

/**
 * Nomni qo'lda hal qilingan jadval bo'yicha yechadi.
 *
 * `null` qaytsa — noaniqlik hal qilinmagan, chaqiruvchi uni TO'SIQ sifatida
 * ko'rsatishi kerak. Jim ravishda birinchi nomzodni tanlash taqiqlanadi.
 */
export function resolveAlias(
  raw: string,
  table: Record<string, string> = EMPLOYEE_ALIASES
): string | null {
  const key = raw.trim();
  return table[key] ?? null;
}
