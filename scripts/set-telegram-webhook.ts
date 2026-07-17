/**
 * Register (or inspect / remove) the Telegram webhook for the KPI bot.
 *
 * In production (BOT_MODE=webhook) Telegram must be told where to deliver
 * updates AND the shared secret to echo back — without this step no updates ever
 * reach app/api/telegram/webhook. This script does that, opts in to the update
 * types the bot captures (edits + reactions are NOT delivered by default), and
 * registers the command menu.
 *
 * Usage (from repo root, env loaded from .env / .env.local):
 *   npx tsx scripts/set-telegram-webhook.ts set     # default; register webhook
 *   npx tsx scripts/set-telegram-webhook.ts info    # show current webhook state
 *   npx tsx scripts/set-telegram-webhook.ts delete   # drop the webhook (e.g. to switch to polling)
 *
 * Required env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET.
 * Webhook URL resolution order: WEBHOOK_URL → <AUTH_URL|NEXT_PUBLIC_SITE_URL>/api/telegram/webhook.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

import { Bot } from "grammy";

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

function resolveWebhookUrl(): string {
  if (process.env.WEBHOOK_URL) return process.env.WEBHOOK_URL;
  const base =
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL;
  if (!base) {
    throw new Error(
      "Set WEBHOOK_URL, or AUTH_URL / NEXT_PUBLIC_SITE_URL so the webhook path can be derived.",
    );
  }
  return `${base.replace(/\/$/, "")}/api/telegram/webhook`;
}

// Updates the bot actually captures. message_reaction & edited_message are NOT
// in Telegram's default set, so they must be listed explicitly or they'll never
// arrive at the webhook.
const ALLOWED_UPDATES = [
  "message",
  "edited_message",
  "message_reaction",
  "callback_query",
] as const;

const COMMANDS = [
  { command: "start", description: "Botni ishga tushirish" },
  { command: "whoami", description: "Bog'langan profilingiz" },
  { command: "help", description: "Buyruqlar ro'yxati" },
  { command: "bind", description: "Guruhni korxonaga bog'lash (admin)" },
  { command: "link", description: "Xodimni Telegram akkauntga bog'lash (admin)" },
];

async function main() {
  const action = process.argv[2] ?? "set";

  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  const bot = new Bot(token);

  if (action === "info") {
    const info = await bot.api.getWebhookInfo();
    console.log(JSON.stringify(info, null, 2));
    return;
  }

  if (action === "delete") {
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    console.log("[webhook] deleted. Bot can now run in polling mode.");
    return;
  }

  if (action !== "set") {
    throw new Error(`Unknown action "${action}". Use: set | info | delete`);
  }

  if (!secret) {
    throw new Error(
      "TELEGRAM_WEBHOOK_SECRET is not set — the webhook route fails closed (503) without it.",
    );
  }

  const url = resolveWebhookUrl();
  await bot.api.setWebhook(url, {
    secret_token: secret,
    allowed_updates: ALLOWED_UPDATES,
    drop_pending_updates: false,
  });
  await bot.api.setMyCommands(COMMANDS);

  const info = await bot.api.getWebhookInfo();
  console.log(`[webhook] set → ${url}`);
  console.log(`[webhook] allowed_updates: ${ALLOWED_UPDATES.join(", ")}`);
  console.log(`[webhook] commands registered: ${COMMANDS.map((c) => "/" + c.command).join(" ")}`);
  console.log("[webhook] current state:", JSON.stringify(info, null, 2));
}

main().catch((e) => {
  console.error("[webhook] failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
