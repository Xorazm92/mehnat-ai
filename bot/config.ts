/**
 * Centralised bot configuration, read from the environment. Kept tiny and
 * framework-free so every layer can import it.
 */

export type BotMode = "webhook" | "polling";

/** Parse a numeric Telegram id from env into a BigInt, or null if unset/invalid. */
function parseTelegramId(raw: string | undefined): bigint | null {
  if (!raw || !/^-?\d+$/.test(raw.trim())) return null;
  return BigInt(raw.trim());
}

export const config = {
  /** Redis connection URL for BullMQ (queues + cache). */
  redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  telegram: {
    /** Bot token from @BotFather. Empty ⇒ sending/polling disabled. */
    token: process.env.TELEGRAM_BOT_TOKEN ?? "",
    /**
     * Shared secret echoed by Telegram in the
     * `X-Telegram-Bot-Api-Secret-Token` header. Empty ⇒ the webhook fails
     * closed (503) rather than run an unauthenticated ingress.
     */
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? "",
    /**
     * Bootstrap super-admin Telegram id. This account may run admin commands
     * (/bind, /link) even before anyone is linked, breaking the chicken-and-egg
     * where authorizing an admin requires an already-linked admin.
     */
    adminTelegramId: parseTelegramId(process.env.TELEGRAM_ADMIN_TELEGRAM_ID),
  },
  /**
   * `webhook` (prod): Telegram → app/api/telegram/webhook → queue.
   * `polling` (local dev): bot/main.ts long-polls and enqueues to the same
   * queue, so the worker path is identical and no public URL is needed.
   */
  ai: {
    /** Gemini API key. Empty ⇒ the classifier falls back to heuristics only. */
    geminiApiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "",
    geminiModel: process.env.GEMINI_MODEL ?? "gemini-flash-latest",
  },
  billing: {
    /** Daily payment-reminder cron. Set BILLING_ENABLED=false to disable. */
    enabled: (process.env.BILLING_ENABLED ?? "true") !== "false",
    /** Hour of day (0-23, local) the reminder run fires. Default 09:00. */
    cronHour: Number.isInteger(Number(process.env.BILLING_CRON_HOUR))
      ? Number(process.env.BILLING_CRON_HOUR)
      : 9,
  },
  botMode: (process.env.BOT_MODE ?? "webhook") as BotMode,
} as const;

export function hasTelegramToken(): boolean {
  return config.telegram.token.length > 0;
}

export function hasGemini(): boolean {
  return config.ai.geminiApiKey.length > 0;
}

/** BullMQ queue names. Kept as constants so producers/workers never drift. */
export const QUEUE = {
  MESSAGE: "message",
  QUESTION: "question",
  /** Compliance engine: obligation generation + deadline sweep (repeatable). */
  OBLIGATION: "obligation",
} as const;
