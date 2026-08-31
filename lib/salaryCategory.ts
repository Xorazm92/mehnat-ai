/**
 * OYLIK TOIFASINI ANIQLASH — yagona manba, bog'liqliksiz.
 *
 * Nega alohida fayl: qoida `lib/cashGate.ts` da yashardi, u esa
 * `@prisma/client` ni import qiladi — ya'ni uni mijoz komponentiga olib
 * kirish Prisma'ni brauzer to'plamiga tortadi va prod build'ni yiqitadi.
 * Shu sababdan EKRAN qoidani bilmasdi.
 *
 * Oqibati (2026-09-01 da brauzer testida ko'rildi): jurnalda "Oylik"
 * toifasini tanlab chiqim yozish MUMKIN edi; server uni to'g'ri rad etardi,
 * lekin Next production'da xato matni yashiriladi va foydalanuvchi sababni
 * KO'RMASDI. Ya'ni ekran taqiqlangan tanlovni taklif qilar, keyin esa
 * tushunarsiz xato qaytarardi.
 *
 * Endi qoida ikkala tomonda ham bir manbadan: server RAD ETADI (himoya),
 * ekran esa TAKLIF QILMAYDI (oldini olish).
 *
 * NEGA OYLIK KASSA CHIQIMI EMAS: oylik `/payroll` orqali beriladi va
 * `Payout` sifatida balansdan chiqadi. Uni yana kassa chiqimi qilib yozish
 * bitta pulni ikki marta hisoblaydi.
 */
export const SALARY_CATEGORY_RE =
  /oylik|ish\s*haqi|mehnat\s*haqi|maosh|zarplata|зарплат|ойлик|иш\s*хак/i;

/** Toifa oylik to'loviga tegishlimi. */
export function isSalaryCategory(category: string): boolean {
  return SALARY_CATEGORY_RE.test(category);
}
