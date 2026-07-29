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

/**
 * Public base URL of the ERP, e.g. "https://asro.uz". Used for Mini App
 * (`web_app`) buttons and deep links back into the web UI.
 *
 * Returns null unless it is HTTPS: Telegram silently refuses a `web_app` or
 * `url` button on plain HTTP, so a local dev run must render no button at all
 * rather than a dead one.
 */
export function appBaseUrl(): string | null {
  const raw =
    process.env.MINI_APP_URL ??
    process.env.AUTH_URL ??
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "";
  const trimmed = raw.replace(/\/$/, "");
  return trimmed.startsWith("https://") ? trimmed : null;
}

/**
 * HMAC key for signed `callback_data`. Reuses the webhook secret so there is
 * one fewer thing to configure; falls back to the bot token for local polling
 * runs where no webhook secret is set. Rotating either value invalidates
 * buttons already sitting in chats — they answer "eskirgan" rather than
 * misfire, which is the intended failure mode.
 */
export function callbackSecret(): string {
  return config.telegram.webhookSecret || config.telegram.token || "asro-bot-local-dev";
}

/** BullMQ queue names. Kept as constants so producers/workers never drift. */
export const QUEUE = {
  MESSAGE: "message",
  QUESTION: "question",
  /** Compliance engine: obligation generation + deadline sweep (repeatable). */
  OBLIGATION: "obligation",
  /** 1C integration: pending IntegrationEvent processing sweep (repeatable). */
  INTEGRATION: "integration",
  /** KPI: monthly evidence → MonthlyPerformance proposals (repeatable). */
  KPI: "kpi",
  /**
   * Outbound fan-out: escalation sweeps and (later) digests. Separate from the
   * other queues so its worker can carry a rate limiter — Telegram caps sending
   * at roughly 30 messages/second and a firm-wide sweep blows through that.
   */
  NOTIFY: "notify",
} as const;
