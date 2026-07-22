import "./env"; // must be first: loads .env / .env.local before config is read
import type { Worker } from "bullmq";
import { config, hasTelegramToken } from "./config";
import { getBot } from "./telegram/bot";
import { getClassifier } from "./contexts/ai";
import { enqueueTelegramUpdate } from "./queues/message.queue";
import { startMessageWorker } from "./contexts/monitoring/interface/message.worker";
import { startQuestionWorker } from "./contexts/monitoring/interface/question.worker";
import { startObligationWorker } from "./queues/obligation.worker";
import { registerObligationSchedulers } from "./queues/obligation.queue";
import { startCron } from "./cron/scheduler";
import type { RawTelegramUpdate } from "./contexts/monitoring/domain/inbound-message";

async function main(): Promise<void> {
  console.log("[bot] starting…");

  getClassifier(); // logs which classifier (Gemini / heuristic) is live
  const workers: Worker[] = [startMessageWorker(), startQuestionWorker(), startObligationWorker()];
  const stopCron = startCron();
  // Compliance schedulers live in Redis (repeatable), not in-process setInterval.
  await registerObligationSchedulers();
  console.log(`[bot] ${workers.length} worker(s) + cron + obligation schedulers up · Redis ${config.redisUrl}`);

  const bot = config.botMode === "polling" ? getBot() : undefined;

  if (config.botMode === "polling") {
    if (bot) {
      // Ingress adapter: every update is enqueued to the same `message` queue
      // the webhook uses, so the processing path is identical (no public URL).
      bot.use(async (ctx) => {
        await enqueueTelegramUpdate(ctx.update as unknown as RawTelegramUpdate);
      });
      void bot.start({
        onStart: (me) => console.log(`[bot] polling ingress as @${me.username}`),
      });
    } else {
      console.warn(
        "[bot] BOT_MODE=polling but TELEGRAM_BOT_TOKEN is empty — no ingress running",
      );
    }
  } else {
    console.log(
      `[bot] webhook mode — ingress via app/api/telegram/webhook${
        hasTelegramToken() ? "" : " (token unset: sending disabled)"
      }`,
    );
  }

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[bot] ${signal} — shutting down…`);
    try {
      stopCron();
      if (bot) await bot.stop();
      await Promise.all(workers.map((w) => w.close()));
    } finally {
      process.exit(0);
    }
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((e) => {
  console.error("[bot] fatal:", e);
  process.exit(1);
});
