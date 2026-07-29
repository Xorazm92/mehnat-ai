import { Bot, GrammyError } from "grammy";
import { config, hasTelegramToken } from "../config";
import type { InlineKeyboardMarkup, ReplyMarkup } from "./keyboard";

let instance: Bot | undefined;

/**
 * The grammY bot instance, created lazily and only when a token is configured.
 * Returns undefined when TELEGRAM_BOT_TOKEN is empty, so callers can degrade
 * gracefully (workers still run; only Telegram I/O is disabled).
 */
export function getBot(): Bot | undefined {
  if (!hasTelegramToken()) return undefined;
  if (!instance) instance = new Bot(config.telegram.token);
  return instance;
}

export interface SendOptions {
  replyMarkup?: ReplyMarkup;
  parseMode?: "HTML" | "MarkdownV2";
  replyToMessageId?: number;
  disableNotification?: boolean;
}

/** Only inline keyboards may be attached to an edited message. */
export interface EditOptions {
  replyMarkup?: InlineKeyboardMarkup;
  parseMode?: "HTML" | "MarkdownV2";
}

function toApiOptions(opts: SendOptions | undefined) {
  if (!opts) return undefined;
  return {
    reply_markup: opts.replyMarkup,
    parse_mode: opts.parseMode,
    disable_notification: opts.disableNotification,
    ...(opts.replyToMessageId != null
      ? { reply_parameters: { message_id: opts.replyToMessageId } }
      : {}),
  };
}

/**
 * Send a message to a chat. Returns the new message_id, or null when no token
 * is configured (dev without Telegram).
 *
 * THROWS on an API error — deliberately. `run-reminders` and the billing cron
 * rely on a throw to mark a reminder `failed` rather than silently `sent`. Use
 * `trySendMessage` where a failure should be handled rather than propagated.
 */
export async function sendMessage(
  chatId: bigint | number,
  text: string,
  opts?: SendOptions,
): Promise<number | null> {
  const bot = getBot();
  if (!bot) {
    console.warn(`[telegram] send skipped (no token) → ${chatId}: ${text}`);
    return null;
  }
  const sent = await bot.api.sendMessage(Number(chatId), text, toApiOptions(opts));
  return sent.message_id;
}

/**
 * Re-send a photo we already have a `file_id` for (a client's payment receipt
 * forwarded to the accountant). Telegram accepts a file_id in place of an
 * upload, so nothing is downloaded or stored on our side. Never throws — the
 * accompanying in-app notification is the channel of record.
 */
export async function sendPhoto(
  chatId: bigint | number,
  fileId: string,
  opts: { caption?: string; replyMarkup?: ReplyMarkup } = {},
): Promise<boolean> {
  const bot = getBot();
  if (!bot) return false;
  try {
    await bot.api.sendPhoto(Number(chatId), fileId, {
      caption: opts.caption,
      reply_markup: opts.replyMarkup,
    });
    return true;
  } catch (err) {
    console.warn(`[telegram] sendPhoto failed for ${chatId}: ${(err as Error).message}`);
    return false;
  }
}

export type SendFailure =
  /** No TELEGRAM_BOT_TOKEN — nothing was attempted. */
  | "no_token"
  /**
   * Telegram refused the chat: the user has never pressed Start, blocked the
   * bot, or was kicked. A bot CANNOT initiate a private conversation, so this
   * is the expected failure for staff who never onboarded — callers should fall
   * back to an in-app Notification rather than retry.
   */
  | "no_private_chat"
  /** Anything else (rate limit, network, malformed markup). */
  | "error";

export type SendResult =
  | { ok: true; messageId: number | null }
  | { ok: false; reason: SendFailure; message: string };

/** True when Telegram is telling us this chat can never be written to as-is. */
function isUnreachableChat(err: unknown): boolean {
  if (!(err instanceof GrammyError)) return false;
  if (err.error_code === 403) return true; // blocked / kicked / not started
  return err.error_code === 400 && /chat not found|user is deactivated/i.test(err.description);
}

/** Non-throwing `sendMessage` for fan-out paths that need a fallback. */
export async function trySendMessage(
  chatId: bigint | number,
  text: string,
  opts?: SendOptions,
): Promise<SendResult> {
  if (!hasTelegramToken()) {
    return { ok: false, reason: "no_token", message: "TELEGRAM_BOT_TOKEN not set" };
  }
  try {
    const messageId = await sendMessage(chatId, text, opts);
    return { ok: true, messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: isUnreachableChat(err) ? "no_private_chat" : "error",
      message,
    };
  }
}

/**
 * Replace the text (and usually the buttons) of a message we sent. Used after a
 * button press so the same alert cannot be actioned twice from the UI — the
 * server-side effect is idempotent regardless, this is the visible half.
 * Never throws: a message deleted by the user must not fail the callback.
 */
export async function editMessageText(
  chatId: bigint | number,
  messageId: number,
  text: string,
  opts?: EditOptions,
): Promise<boolean> {
  const bot = getBot();
  if (!bot) return false;
  try {
    await bot.api.editMessageText(Number(chatId), messageId, text, {
      reply_markup: opts?.replyMarkup,
      parse_mode: opts?.parseMode,
    });
    return true;
  } catch (err) {
    // "message is not modified" and "message to edit not found" are both benign.
    console.warn(`[telegram] edit failed for ${chatId}/${messageId}: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Strip (or replace) a message's keyboard. Works on any message type, unlike
 * `editMessageText` — which is why it is the fallback when the button lives on
 * a photo (a forwarded receipt) rather than on text. Never throws.
 */
export async function editMessageReplyMarkup(
  chatId: bigint | number,
  messageId: number,
  replyMarkup?: InlineKeyboardMarkup,
): Promise<boolean> {
  const bot = getBot();
  if (!bot) return false;
  try {
    await bot.api.editMessageReplyMarkup(Number(chatId), messageId, {
      reply_markup: replyMarkup,
    });
    return true;
  } catch (err) {
    console.warn(`[telegram] markup edit failed for ${chatId}/${messageId}: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Acknowledge a callback query. Telegram shows a loading spinner on the button
 * until this is called and expires the query after ~10s, so every callback path
 * must reach this — including the error paths. Never throws.
 */
export async function answerCallbackQuery(
  callbackQueryId: string,
  opts: { text?: string; showAlert?: boolean } = {},
): Promise<void> {
  const bot = getBot();
  if (!bot) return;
  try {
    await bot.api.answerCallbackQuery(callbackQueryId, {
      text: opts.text,
      show_alert: opts.showAlert,
    });
  } catch (err) {
    console.warn(`[telegram] answerCallbackQuery failed: ${(err as Error).message}`);
  }
}
