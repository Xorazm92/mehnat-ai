import { prisma } from "../../lib/prisma";
import { callbackSecret, config, hasTelegramToken } from "../config";
import type { ReplyMarkup } from "../telegram/keyboard";
import { receiptButton } from "../contexts/billing/application/receipt-flow";
import { sendMessage } from "../telegram/bot";
import { expireOverdueQuestions } from "../contexts/monitoring/application/expire-questions";
import { recordQuestionKpi } from "../contexts/kpi/application/record-question-kpi";
import { runBillingReminders } from "../contexts/billing/application/run-reminders";
import { enqueueNotifyJob } from "../queues/notify.queue";
import { autoManageReadiness, gatherChecklist } from "../../lib/monthClose";

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
async function sendTelegram(chatId: bigint, text: string, replyMarkup?: unknown): Promise<void> {
  if (!hasTelegramToken()) throw new Error("TELEGRAM_BOT_TOKEN not set");
  await sendMessage(chatId, text, { replyMarkup: replyMarkup as ReplyMarkup | undefined });
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
        // Escalate now rather than waiting for the 5-minute scheduler: a
        // supervisor is only useful if they hear about it while it still
        // matters. The sweep itself is idempotent, so an extra run is free.
        await enqueueNotifyJob({ kind: "escalate-questions" });
      }
    } catch (err) {
      console.error(`[cron] sweep failed: ${(err as Error).message}`);
    }
  }, SWEEP_INTERVAL_MS);

  const runBilling = async () => {
    try {
      // The reminder carries a "📄 Kvitansiya yuborish" button, so a client
      // can hand the receipt straight to the accountant instead of it sitting
      // unnoticed in the group.
      const res = await runBillingReminders(prisma, currentPeriod(), {
        sendTelegram,
        reminderKeyboard: receiptButton(callbackSecret()),
      });
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

  // ── Month-end closing avtomatikasi ────────────────────────────────────────
  // Oy oxirgi kuni 23:55 — checklist (log/ogohlantirish); yangi oy 1-kuni
  // 00:05 — o'tgan oy uchun auto READY_TO_CLOSE (checklist yashil bo'lsa).
  // AUTO-CLOSE ATAYIN YO'Q: yopishni faqat administrator UI'dan bosadi.
  // 5 daqiqalik tekshiruv oynasi restart-safe: statuslar idempotent boshqariladi
  // (OPEN↔READY), shuning uchun qayta ishga tushish hech narsani buzmaydi.
  let lastChecklistRun = "";
  let lastAutoReadyRun = "";
  const monthClosingSweep = async () => {
    const now = new Date();
    const isLastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() === now.getDate();
    const hm = now.getHours() * 60 + now.getMinutes();

    // 23:55+ oy oxirgi kuni: joriy oy checklistini yurgizib natijani log qilamiz.
    if (isLastDayOfMonth && hm >= 23 * 60 + 55) {
      const key = currentPeriod(now);
      if (lastChecklistRun !== key) {
        lastChecklistRun = key;
        try {
          const res = await gatherChecklist(prisma, now.getFullYear(), now.getMonth() + 1);
          console.log(
            `[cron] month-closing checklist ${key}: ${res.ready ? "TAYYOR" : `bloklar: ${res.blockingErrors.join("; ")}`}`
          );
        } catch (err) {
          console.error(`[cron] month-closing checklist failed: ${(err as Error).message}`);
        }
      }
    }

    // 00:05–01:00 yangi oyning 1-kuni: O'TGAN oy uchun auto-ready.
    if (now.getDate() === 1 && hm >= 5 && hm < 60) {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const key = currentPeriod(prev);
      if (lastAutoReadyRun !== key) {
        lastAutoReadyRun = key;
        try {
          const res = await autoManageReadiness(prisma, prev.getFullYear(), prev.getMonth() + 1);
          console.log(`[cron] month-closing auto-ready ${key}: status=${res.status} (auto-close YO'Q — admin yopadi)`);
        } catch (err) {
          console.error(`[cron] month-closing auto-ready failed: ${(err as Error).message}`);
        }
      }
    }
  };
  const monthClosingTimer = setInterval(() => void monthClosingSweep(), 5 * 60_000);
  console.log(`[cron] month-closing: checklist last-day 23:55, auto-ready day-1 00:05 (no auto-close)`);

  return () => {
    clearInterval(sweepTimer);
    clearInterval(monthClosingTimer);
    if (billingStart) clearTimeout(billingStart);
    if (billingInterval) clearInterval(billingInterval);
  };
}
