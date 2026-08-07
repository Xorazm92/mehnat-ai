import { trySendMessage } from "../../../telegram/bot";
import type { AlertSender } from "../../../../lib/domains/accounting/twinAlertRun";

/**
 * `runTwinAlerts` ni Telegramga ulovchi adapter.
 *
 * Yuborilmasa TASHLAYDI, `false` qaytarmaydi — digest'dan farqi shu. Sabab:
 * digest kunlik reja va u yetib bormasa ish to'xtamaydi, ogohlantirish esa
 * band qilingan `dedupKey` bilan ketadi va sukut bilan yo'qolsa, o'sha daraja
 * uchun BOSHQA xabar bo'lmaydi. Xato ko'tarilsa yuborish `failed` deb
 * belgilanadi va u ko'rinadi.
 */
export function makeAlertSender(): AlertSender {
  return async (chatId, text) => {
    const res = await trySendMessage(chatId, text);
    if (!res.ok) throw new Error(`Telegram yuborilmadi: ${chatId}`);
  };
}
