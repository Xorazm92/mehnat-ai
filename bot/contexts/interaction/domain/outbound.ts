/**
 * What a handler wants Telegram to do, as data.
 *
 * Handlers return these instead of calling the Bot API themselves, so the whole
 * interaction layer stays unit-testable without stubbing network I/O — the
 * worker at the edge is the only place that actually sends.
 */
import type { InlineKeyboardMarkup, ReplyMarkup } from "../../../telegram/keyboard";

export interface OutboundMessage {
  chatId: bigint;
  text: string;
  replyMarkup?: ReplyMarkup;
  /**
   * true ⇒ a failure to deliver is expected and handled (e.g. the recipient
   * never pressed Start), so the worker logs it instead of throwing.
   */
  bestEffort?: boolean;
  /**
   * Delete this message after N ms. For anything that must not live in the
   * chat history — a password handed out over Telegram is only as short-lived
   * as the message carrying it.
   */
  ephemeralMs?: number;
}

export interface CallbackOutcome {
  /** Toast shown on the button. Telegram truncates past ~200 chars. */
  answer?: string;
  /** true ⇒ show a modal instead of a toast (use for refusals). */
  alert?: boolean;
  /**
   * Rewrite the message the button lives on — normally to drop the keyboard so
   * the action visibly cannot be repeated. The server-side effect is idempotent
   * regardless; this is only the visible half.
   */
  edit?: {
    text: string;
    replyMarkup?: InlineKeyboardMarkup;
    /**
     * "HTML" ⇒ matn Telegram HTML sifatida chiziladi (qalin sarlavha,
     * yig'iladigan sitata). Bunda matndagi HAR dinamik qiymat
     * `bot/telegram/html.ts` dagi `esc()` dan o'tgan bo'lishi SHART — bitta
     * qochirilmagan `&` butun xabarni rad ettiradi.
     */
    parseMode?: "HTML";
  };
  /** Messages to deliver to other chats (notifying a chief, DMing a staffer). */
  send?: OutboundMessage[];
}
