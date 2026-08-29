import { trySendMessage } from "../../../telegram/bot";
import type { DigestSender } from "../../../../lib/engines/automation/dailyDigest";
import { renderDigest } from "../application/render-digest";

/**
 * Adapter that lets the framework-free `lib/dailyDigest.ts` reach Telegram.
 *
 * Returns false rather than throwing on 403 (the recipient never pressed
 * Start): `runDailyDigest` marks that delivery `failed` and moves on, so one
 * unreachable staffer never stops the morning fan-out.
 */
export function makeDigestSender(secret: string, now = new Date()): DigestSender {
  return async (digest) => {
    if (digest.telegramUserId == null) return false;
    const { text, keyboard } = renderDigest(secret, digest, now);
    const res = await trySendMessage(digest.telegramUserId, text, { replyMarkup: keyboard });
    return res.ok;
  };
}
