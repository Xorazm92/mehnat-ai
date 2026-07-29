import { trySendMessage } from "../../../telegram/bot";
import type { EscalationSender } from "../../../../lib/escalation";
import { renderAlert } from "../application/render-alert";

/**
 * Adapter that lets the framework-free `lib/escalation.ts` reach Telegram.
 *
 * Returns false rather than throwing when the recipient cannot be written to
 * (403 — they never pressed Start). `escalate` records that as a failed
 * delivery, and the in-app Notification it already wrote is the fallback.
 */
export function makeEscalationSender(secret: string): EscalationSender {
  return async (recipient, subject) => {
    if (recipient.telegramUserId == null) return false;
    const { text, keyboard } = renderAlert(secret, recipient, subject);
    const res = await trySendMessage(recipient.telegramUserId, text, { replyMarkup: keyboard });
    return res.ok;
  };
}
