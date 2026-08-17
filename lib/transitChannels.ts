// lib/transitChannels.ts
// Tranzit KANAL turlari — sof ma'lumot, hech qanday bog'liqliksiz.
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

/** Kanal turlari. `employee_card` — o'zini-o'zi band qilgan xodim kartasi. */
export const CHANNEL_TYPES = ["employee_card", "own_bank", "cash", "plastik"] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const CHANNEL_TYPE_LABELS: Record<ChannelType, string> = {
  employee_card: "Xodim kartasi",
  own_bank: "O'z bank hisobi",
  cash: "Naqd",
  plastik: "Plastik terminal",
};
