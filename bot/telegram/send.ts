// Bitta yuborish urinishi — xato tasnifi bilan.
//
// NEGA ALOHIDA MODUL. `trySendMessage` xatoni tasniflaydi, lekin har bir
// chaqiruvchi undan keyin bir xil qarorni qayta yozardi: 403 da nima qilish,
// 429 da nima qilish, qolganida nima qilish. Uchtasi uch xil:
//
//   403 (no_private_chat) → DOIMIY. Qayta urinish har sweepda o'sha 403 ni
//     beradi. Kalit band qolsin, xabar in-app kanalda qolsin.
//   429 (rate_limited)    → O'TKINCHI va Telegram qancha kutishni O'ZI aytadi.
//     Bir marta kutib qayta urinamiz — aynan shu holat uchun to'g'ri javob.
//   qolgani               → O'TKINCHI. Kalit bo'shasin, keyingi yurish urinsin.
import { trySendMessage, type SendOptions } from "./bot";
import type { SendVerdict } from "../../lib/engines/automation/deliveryLedger";

/**
 * 429 dan keyin eng ko'pi bilan shuncha kutamiz. Telegram ba'zan bir necha
 * daqiqa so'raydi; ishchi (concurrency 1) shuncha turib qolgandan ko'ra
 * urinishni keyingi yurishga qoldirgan ma'qul.
 */
const MAX_RETRY_AFTER_SEC = 30;

export interface SendAttempt {
  verdict: SendVerdict;
  messageId?: number | null;
  /** Xato matni — log uchun; `sent` da bo'lmaydi. */
  message?: string;
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Xabarni yuboradi va natijani `SendVerdict` ga keltiradi. HECH QACHON
 * tashlamaydi — chaqiruvchi qarorni verdikt asosida qabul qiladi.
 *
 * Token sozlanmagan bo'lsa `unreachable`: bu o'tkinchi emas (qayta urinish
 * hech narsani o'zgartirmaydi) va `failed` bo'lsa kalit bo'shab, har yurishda
 * behuda urinish qilinardi.
 */
export async function sendOnce(
  chatId: bigint | number,
  text: string,
  opts?: SendOptions,
): Promise<SendAttempt> {
  const first = await trySendMessage(chatId, text, opts);
  if (first.ok) return { verdict: "sent", messageId: first.messageId };

  if (first.reason === "rate_limited") {
    const waitSec = Math.min(first.retryAfterSec ?? 1, MAX_RETRY_AFTER_SEC);
    await wait(waitSec * 1000);
    const second = await trySendMessage(chatId, text, opts);
    if (second.ok) return { verdict: "sent", messageId: second.messageId };
    return {
      verdict: second.reason === "no_private_chat" ? "unreachable" : "failed",
      message: second.message,
    };
  }

  if (first.reason === "no_private_chat" || first.reason === "no_token") {
    return { verdict: "unreachable", message: first.message };
  }
  return { verdict: "failed", message: first.message };
}
