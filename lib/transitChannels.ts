// lib/transitChannels.ts
// KASSA KANALLARI — sof ma'lumot, hech qanday bog'liqliksiz.
//
// NEGA ALOHIDA FAYL: bu konstantalar `lib/transit.ts` da turardi, u esa
// `@prisma/client`, `node:crypto` va `lib/cashGate.ts` ni import qiladi.
// `ChiqimKassaClient.tsx` (mijoz komponenti) shu ro'yxatni tanlagichda
// ko'rsatish uchun import qilgani uchun butun server zanjiri BRAUZER
// to'plamiga tortilardi va Turbopack build yetti xato bilan to'xtardi:
//   Module not found: Can't resolve 'dns' / 'fs' / 'net' / 'tls' / 'util/types'
// (bular `pg` drayveri — ya'ni baza ulanishi mijoz kodiga tushib qolgan edi).
//
// Qoida: mijoz ham, server ham ishlatadigan har qanday konstanta/tip SHU
// KABI sof modulda yashashi kerak. `lib/transit.ts` ularni qayta eksport
// qiladi, shuning uchun mavjud server chaqiruvlari o'zgarmaydi.
//
// ─────────────────────────────────────────────────────────────────────────
// `own_bank` FANTOM TUR EDI (2026-08-18 da tuzatildi)
// ─────────────────────────────────────────────────────────────────────────
//
// Ro'yxatda `own_bank` turardi, bazada esa 10 ta kanal `own_firm_account`
// turi bilan yozilgan (`scripts/seed-own-firm-accounts.ts` shuni yozadi).
// Ya'ni kod bir nomni, ma'lumot boshqa nomni ishlatardi. Uch oqibati bor edi:
//
//   1. `upsertChannel` `CHANNEL_TYPES.includes(type)` ni tekshiradi — ya'ni
//      o'sha 10 ta bank hisobini UI orqali TAHRIRLAB BO'LMASDI
//      ("Kanal turi noto'g'ri");
//   2. `CHANNEL_TYPE_LABELS[own_firm_account]` — undefined, shuning uchun
//      `/kassa/chiqim` da ular yorliqsiz, xom satr bo'lib ko'rinardi;
//   3. Formadagi "O'z bank hisobi" tanlovi `own_bank` yozardi — hech qaysi
//      o'quvchi tanimaydigan uchinchi tur.
//
// Endi MA'LUMOT nomi kanonik. `own_bank` faqat eski qatorlar uchun taxallus
// sifatida qoladi (prodda bunday qator yo'q, lekin o'qish yo'li yiqilmasin).

/** Kassa kanali turlari — pul QAYERDA turadi. */
export const CHANNEL_TYPES = [
  "own_firm_account",
  "employee_card",
  "cash",
  "plastik",
] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const CHANNEL_TYPE_LABELS: Record<ChannelType, string> = {
  own_firm_account: "Bank hisobi (schyot)",
  employee_card: "Xodim kartasi",
  cash: "Naqd kassa (seyf)",
  plastik: "Plastik terminal",
};

/** Ro'yxatda ko'rinadigan tartib — eng ko'p ishlatiladigani tepada. */
export const CHANNEL_TYPE_ORDER: ChannelType[] = [
  "own_firm_account",
  "cash",
  "plastik",
  "employee_card",
];

/** Eski/xato yozilgan tur nomlari → kanonik nom. */
const LEGACY_ALIASES: Record<string, ChannelType> = {
  own_bank: "own_firm_account",
};

/**
 * Bazadagi xom turni kanonik turga keltiradi.
 *
 * Noma'lum tur `employee_card` ga tushmaydi — `null` qaytadi, chunki uni
 * jimgina kartaga aylantirish qoldiqni noto'g'ri guruhga qo'shib yuborardi.
 */
export function normalizeChannelType(raw: string): ChannelType | null {
  if ((CHANNEL_TYPES as readonly string[]).includes(raw)) return raw as ChannelType;
  return LEGACY_ALIASES[raw] ?? null;
}
