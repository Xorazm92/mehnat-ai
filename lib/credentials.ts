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
