import { sendOnce } from "../../../telegram/send";
import type { DigestSender } from "../../../../lib/engines/automation/dailyDigest";
import { renderDigest } from "../application/render-digest";

/**
 * Adapter that lets the framework-free `lib/dailyDigest.ts` reach Telegram.
 *
 * 403 (xodim /start bosmagan) → `unreachable`: `runDailyDigest` kalitni band
 * qoldiradi, chunki ertaga ham o'sha 403 keladi. O'tkinchi xato → `failed`:
 * kalit bo'shaydi va digest keyingi yurishda qayta urinadi. Bitta bog'lanmagan
 * xodim hech qachon butun ertalabki fan-out'ni to'xtatmaydi.
 */
export function makeDigestSender(secret: string, now = new Date()): DigestSender {
  return async (digest) => {
    if (digest.telegramUserId == null) return "unreachable";
    const { text, keyboard } = renderDigest(secret, digest, now);
    const res = await sendOnce(digest.telegramUserId, text, { replyMarkup: keyboard });
    return res.verdict;
  };
}
