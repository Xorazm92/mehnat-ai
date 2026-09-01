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
import { notifyUsers } from "../../lib/notify";
import { SENIOR_REVIEW_ROLES } from "../../lib/reportPermissions";

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
/**
 * KUNLIK YIG'MA — tasdiq kutayotgan dalillar.
 *
 * Dalil topshirilganda darhol xabar FAQAT o'sha firmaning nazoratchisi va
 * bosh buxgalteriga ketadi (server/proofs.ts). Qolgan senior rollar ilgari
 * har topshiriqda xabar olardi — prodda 13 596 ta `approval_request`
 * qatoridan 13 577 tasi o'qilmagan bo'lib yig'ilgandi. Endi ular kuniga
 * BITTA yig'ma xabar oladi.
 */
async function runProofDigest(): Promise<void> {
  const pending = await prisma.reportProof.count({ where: { status: "pending" } });
  if (pending === 0) return;

  const seniors = await prisma.user.findMany({
    where: { role: { in: [...SENIOR_REVIEW_ROLES] }, isActive: true },
    select: { id: true },
  });
  if (seniors.length === 0) return;

  const day = new Date().toISOString().slice(0, 10);
  const res = await notifyUsers(prisma, {
    userIds: seniors.map((u) => u.id),
    type: "approval_request",
    title: "Tasdiqlash kutmoqda",
    message: `${pending} ta hisobot dalili tekshiruvni kutmoqda.`,
    link: "/reports",
    channel: "proof-digest",
    dedupKey: day,
  });
  console.log(`[cron] proof digest: pending=${pending} inapp=${res.inapp} skipped=${res.skipped}`);
}

/**
 * BILDIRISHNOMA SAQLASH MUDDATI.
 *
 * Iyulda 424, avgustda 35 938 qator — hech qanday tozalash yo'q edi.
 * Bular moliyaviy yozuv emas, shuning uchun jismonan o'chadi.
 *
 * `NotificationDelivery` da EHTIYOT SHART: `dedupKey` shu jadvalda
 * idempotentlik qulfi (lib/notify.ts). Qator o'chsa o'sha kalit bo'shaydi va
 * xabar QAYTA yuborilishi mumkin. Shuning uchun oyna 180 kun — har qanday
 * jonli majburiyat eslatmasidan uzunroq, ya'ni bo'shagan kalitni hech kim
 * qayta ishlatmaydi.
 */
async function runNotificationRetention(): Promise<void> {
  const now = Date.now();
  const daysAgo = (n: number) => new Date(now - n * DAY_MS);

  const read = await prisma.notification.deleteMany({
    where: { isRead: true, createdAt: { lt: daysAgo(90) } },
  });
  const unread = await prisma.notification.deleteMany({
    where: { isRead: false, createdAt: { lt: daysAgo(180) } },
  });
  const delivery = await prisma.notificationDelivery.deleteMany({
    where: { createdAt: { lt: daysAgo(180) }, status: { in: ["sent", "failed"] } },
  });
  console.log(
    `[cron] retention: notification read=${read.count} unread=${unread.count} delivery=${delivery.count}`
  );
}

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

  // ── Kunlik uy ishlari: yig'ma xabar + saqlash muddati ─────────────────────
  // Soat 9:00 — ish kuni boshida ko'rinsin. Ikkalasi ham idempotent
  // (yig'ma `dedupKey` bilan, tozalash esa o'z-o'zidan), shuning uchun
  // qayta ishga tushish hech narsani buzmaydi.
  const runDailyChores = async () => {
    try {
      await runProofDigest();
    } catch (err) {
      console.error(`[cron] proof digest failed: ${(err as Error).message}`);
    }
    try {
      await runNotificationRetention();
    } catch (err) {
      console.error(`[cron] retention failed: ${(err as Error).message}`);
    }
  };

  let choresInterval: ReturnType<typeof setInterval> | undefined;
  const choresStart = setTimeout(() => {
    void runDailyChores();
    choresInterval = setInterval(() => void runDailyChores(), DAY_MS);
  }, msUntilHour(9));
  console.log(`[cron] daily chores (proof digest + retention) scheduled at 9:00`);

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
    clearTimeout(choresStart);
    if (choresInterval) clearInterval(choresInterval);
  };
}
