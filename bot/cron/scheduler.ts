import { prisma } from "../../lib/prisma";
import { config, hasTelegramToken } from "../config";
import { sendMessage } from "../telegram/bot";
import { expireOverdueQuestions } from "../contexts/monitoring/application/expire-questions";
import { recordQuestionKpi } from "../contexts/kpi/application/record-question-kpi";
import { runBillingReminders } from "../contexts/billing/application/run-reminders";

const SWEEP_INTERVAL_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Current accounting period, "YYYY-MM" (local). */
function currentPeriod(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Milliseconds until the next occurrence of `hour:00` local time. */
function msUntilHour(hour: number, now = new Date()): number {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/** Telegram sender for the cron: fails (not silently "sends") when misconfigured
 *  so a reminder is marked `failed`, never `sent`, without a token. */
async function sendTelegram(chatId: bigint, text: string): Promise<void> {
  if (!hasTelegramToken()) throw new Error("TELEGRAM_BOT_TOKEN not set");
  await sendMessage(chatId, text);
}

/**
 * Background schedules:
 *  - Question deadline sweep: every minute, overdue pending → late + KPI penalty.
 *  - Billing reminders: once daily at config.billing.cronHour. Idempotent, so
 *    running late/again after downtime never duplicates a reminder.
 * All state lives in Postgres → restart-safe. Returns a stop function.
 */
export function startCron(): () => void {
  const sweepTimer = setInterval(async () => {
    try {
      const expiredIds = await expireOverdueQuestions(prisma, new Date());
      for (const id of expiredIds) {
        await recordQuestionKpi(prisma, id, "late");
      }
      if (expiredIds.length > 0) {
        console.log(`[cron] expired ${expiredIds.length} overdue question(s) → KPI`);
      }
    } catch (err) {
      console.error(`[cron] sweep failed: ${(err as Error).message}`);
    }
  }, SWEEP_INTERVAL_MS);

  const runBilling = async () => {
    try {
      const res = await runBillingReminders(prisma, currentPeriod(), { sendTelegram });
      console.log(`[cron] billing:`, res);
    } catch (err) {
      console.error(`[cron] billing failed: ${(err as Error).message}`);
    }
  };

  let billingStart: ReturnType<typeof setTimeout> | undefined;
  let billingInterval: ReturnType<typeof setInterval> | undefined;
  if (config.billing.enabled) {
    billingStart = setTimeout(() => {
      void runBilling();
      billingInterval = setInterval(() => void runBilling(), DAY_MS);
    }, msUntilHour(config.billing.cronHour));
    console.log(`[cron] billing reminders scheduled daily at ${config.billing.cronHour}:00`);
  }

  return () => {
    clearInterval(sweepTimer);
    if (billingStart) clearTimeout(billingStart);
    if (billingInterval) clearInterval(billingInterval);
  };
}
