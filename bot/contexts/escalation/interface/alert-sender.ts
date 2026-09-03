import { sendOnce } from "../../../telegram/send";
import type { AlertSender } from "../../../../lib/domains/accounting/twinAlertRun";

/**
 * `runTwinAlerts` ni Telegramga ulovchi adapter.
 *
 * Bungacha bu adapter har qanday xatoda TASHLARDI. Maqsad to'g'ri edi —
 * band qilingan `dedupKey` bilan ketgan ogohlantirish jimgina yo'qolmasin —
 * lekin natijasi noto'g'ri: bitta bloklangan foydalanuvchi butun BullMQ
 * job'ini yiqitar va u uch marta qayta yurar edi.
 *
 * Endi verdikt qaytariladi va qarorni `runTwinAlerts` qabul qiladi: o'tkinchi
 * xatoda kalit bo'shaydi (ogohlantirish keyingi yurishda qayta ketadi),
 * doimiy radda esa band qoladi.
 */
export function makeAlertSender(): AlertSender {
  return async (chatId, text) => (await sendOnce(chatId, text)).verdict;
}
