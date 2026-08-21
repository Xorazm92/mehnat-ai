// =====================================================
// CHIQIM NAVBATINING QARORLARI — sof mantiq, bazasiz
// =====================================================
//
// Vipiskadagi har chiqim qatori uch yakundan biri bilan yopiladi va ular
// bir-birini almashtira olmaydi:
//
//   xarajat — tashqi kontragentga ketgan pul (soliq, ijara, aloqa).
//             `KassaEntry(expense)` bo'ladi va balansdan chiqadi.
//   karta   — o'z xodimimizning kartasiga o'tkazma. XARAJAT EMAS: pul hali
//             korxonada, faqat boshqa cho'ntakda. `TransitEntry(in)`.
//   ichki   — o'z firmalarimiz orasidagi harakat. Umuman xarajat emas.
//
// NEGA ALOHIDA MODUL: `server/bankImport.ts` "use server" fayli — undagi
// funksiyalar test ichida chaqirib bo'lmaydi (`auth()` so'rov konteksti
// talab qiladi). Repozitoriyaning o'z uslubi shu: qaror `lib/` da, auth
// o'ramchisi `server/` da (`test/bank-import.test.ts` ham `lib/bank/` ni
// sinaydi, `server/` ni emas).

import {
  EXPENSE_CATEGORY_LABELS,
  isPostableExpense,
  type ExpenseCategory,
} from "@/lib/bank/classifyExpense";

export type ExpenseQueueGroupKey = "xarajat" | "karta" | "ichki";

/**
 * Qator qaysi guruhga tushadi.
 *
 * `xodim_kartasi` ATAYIN alohida guruh, garchi u ham `ichki` kabi xarajat
 * bo'lmasa-da: uning yakuni boshqacha — kartaga BOG'LANADI va tranzit
 * qoldig'iga qo'shiladi, ya'ni keyin baribir kuzatiladi. Firmalararo
 * o'tkazma esa hech qayerda kuzatilmaydi, shunchaki yopiladi.
 */
export function expenseQueueGroup(category: string): ExpenseQueueGroupKey {
  if (category === "xodim_kartasi") return "karta";
  if (!isPostableExpense(category as ExpenseCategory)) return "ichki";
  return "xarajat";
}

/**
 * Bu toifani "ichki harakat" deb yopib yuborish mumkinmi.
 *
 * Haqiqiy xarajat toifasini yopib yuborish — 211 mln soliq to'lovini
 * "firmalararo o'tkazma" deb belgilash demakdir, ya'ni pul hisobdan
 * yo'qoladi. Shuning uchun to'siq qattiq: sabab satri qaytadi, `null` esa
 * "mumkin" degani.
 */
export function ignorableRejectionReason(category: string): string | null {
  if (!isPostableExpense(category as ExpenseCategory)) return null;
  const label = EXPENSE_CATEGORY_LABELS[category as ExpenseCategory] ?? category;
  return (
    `"${label}" haqiqiy xarajat toifasi — u kassaga yozilishi kerak, ` +
    `yopib yuborilmaydi. Toifa noto'g'ri bo'lsa avval uni o'zgartiring.`
  );
}
