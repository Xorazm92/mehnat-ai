import { sendOnce } from "../../../telegram/send";
import type { EscalationSender } from "../../../../lib/engines/automation/escalation";
import { renderAlert } from "../application/render-alert";

/**
 * Adapter that lets the framework-free `lib/escalation.ts` reach Telegram.
 *
 * `boolean` EMAS, `SendVerdict` qaytaradi. Bungacha `false` uchta boshqa-boshqa
 * holatni bir joyga qo'shib yuborardi: 403 (doimiy — qayta urinish behuda),
 * 429 (o'tkinchi — kutib qayta urinish kerak) va tarmoq xatosi (o'tkinchi).
 * `escalate` ularni bir xil `failed` deb yozardi va kalit band bo'lib qolardi,
 * ya'ni o'tkinchi xatoda eskalatsiya butunlay yo'qolardi.
 */
export function makeEscalationSender(secret: string): EscalationSender {
  return async (recipient, subject) => {
    if (recipient.telegramUserId == null) return "unreachable";
    const { text, keyboard } = renderAlert(secret, recipient, subject);
    const res = await sendOnce(recipient.telegramUserId, text, { replyMarkup: keyboard });
    return res.verdict;
  };
}
