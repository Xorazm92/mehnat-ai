// =====================================================
// CREDENTIAL VAULT — umumiy konstantalar
// =====================================================
// Alohida modul, chunki `server/credentials.ts` fayl darajasida "use server"
// bilan belgilangan: bunday fayldan FAQAT async funksiya eksport qilish mumkin,
// konstanta eksport qilinsa build buziladi.

/**
 * Firmaning asosiy soliq.uz kirish ma'lumoti shu `serviceName` bilan
 * `ClientCredential` vault'ida saqlanadi. Ilgari u `Company.login` /
 * `Company.password` ustunlarida ochiq matnda yotardi.
 */
export const PRIMARY_SERVICE = "soliq";

/**
 * Bank-klient kirish ma'lumoti. Wizard'dagi "Bank-Klient Login/Parol"
 * maydonlari ilgari `Company.bankClientLogin` / `bankClientPassword`
 * ustunlariga yozardi, firma kartochkasidagi "Loginlar" tabi esa faqat
 * vault'ni (`ClientCredential`) o'qiydi — shuning uchun yozilgan parol
 * "yo'qolib qolgandek" ko'rinardi. Endi ikkalasi ham shu nom bilan
 * vault'da uchrashadi.
 */
export const BANK_SERVICE = "bank_client";
