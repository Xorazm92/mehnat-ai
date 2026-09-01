/**
 * CHIQIM TOIFASI → JURNAL HISOBI — yagona manba, bog'liqliksiz.
 *
 * Kassa chiqimi uch xil narsa bo'lishi mumkin va ular BOSHQA-BOSHQA hisobga
 * tushishi kerak, aks holda foyda tahlili yolg'on chiqadi:
 *
 *   Oylik              → SALARY_EXPENSE      (mehnat haqi)
 *   Ta'sischiga        → OWNER_DISTRIBUTION  (foyda taqsimoti, XARAJAT EMAS)
 *   qolgani            → OPERATING_EXPENSE
 *
 * 2026-09-01 tahlilida ko'rindi: "Otabek akaga" toifasi bilan avgustda
 * 321 508 320 so'm chiqqan va u operatsion xarajat deb yozilgan edi. Bu
 * korxonani 321 mln zarar ko'rgandek ko'rsatadi, holbuki o'sha pul
 * ta'sischiga taqsimlangan foyda — biznes qarori bo'yicha (2026-09-01)
 * u tizimdan chiqqan pul, lekin xarajat emas.
 *
 * SOF — Prisma tortmaydi, shuning uchun mijoz komponenti ham ishlata oladi
 * (`lib/salaryCategory.ts` bilan bir xil sabab: qoida ekranga ham kerak).
 */
import { SALARY_CATEGORY_RE } from "./salaryCategory";

/**
 * Ta'sischiga taqsimot belgisi.
 *
 * "Otabek akaga" — Excel daftarida ishlatilgan ayni matn. Ism bo'yicha
 * moslashtirish yoqimsiz, lekin manbada boshqa belgi YO'Q va uni o'zgartirish
 * daftar bilan bog'lanishni uzadi. Yangi yozuvlar uchun "Ta'sischiga
 * taqsimot" afzal — u ham shu ro'yxatda.
 */
export const OWNER_DISTRIBUTION_RE =
  /otabek\s*akaga|ta'?sischiga|та'?сисчига|учредител|дивиденд|dividend/i;

export function isOwnerDistribution(category: string): boolean {
  return OWNER_DISTRIBUTION_RE.test(category);
}

/**
 * "Vosstanovleniya" — bir martalik xizmat: mijoz firmaning hisobini
 * tartibga solib, soliqlarini tozalab beramiz. Kartadan chiqqan pul esa
 * o'sha ishni bajargan odamning ulushi ("o'ziga vosstanavleniya pulidan",
 * "Stroy Surxon vost tugadi") — ya'ni MEHNAT haqi, operatsion xarajat emas.
 *
 * NEGA `SALARY_CATEGORY_RE` ga qo'shilmadi: u regex ekranda ham ishlaydi va
 * o'sha toifani jurnalda tanlashni TAQIQLAYDI (oylik `/payroll` orqali
 * beriladi). Vosstanovleniya esa jurnaldan kiritilishi kerak — taqiq
 * kerak emas, faqat jurnal hisobi to'g'ri bo'lsin.
 */
const LABOUR_ONLY_RE = /vosstanov|восстановлени/i;

export type ExpenseAccountId = "SALARY_EXPENSE" | "OWNER_DISTRIBUTION" | "OPERATING_EXPENSE";

/**
 * Toifaga mos jurnal hisobi.
 *
 * TARTIB MUHIM: ta'sischi tekshiruvi oldin turadi. "Otabek akaga oylik"
 * kabi matn ikkala qoidaga ham tushadi va uni mehnat haqi deb yozish
 * ta'sischi taqsimotini oylik xarajatiga aylantirib yuboradi.
 */
export function expenseAccountFor(category: string): ExpenseAccountId {
  if (OWNER_DISTRIBUTION_RE.test(category)) return "OWNER_DISTRIBUTION";
  if (SALARY_CATEGORY_RE.test(category) || LABOUR_ONLY_RE.test(category)) return "SALARY_EXPENSE";
  return "OPERATING_EXPENSE";
}
