import { Bot } from "grammy";
import { config, hasTelegramToken } from "../config";

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

/** Send a plain-text message to a chat. No-op (logs) when no token. */
export async function sendMessage(chatId: bigint | number, text: string): Promise<void> {
  const bot = getBot();
  if (!bot) {
    console.warn(`[telegram] send skipped (no token) → ${chatId}: ${text}`);
    return;
  }
  await bot.api.sendMessage(Number(chatId), text);
}
