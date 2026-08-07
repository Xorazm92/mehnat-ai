import { Queue } from "bullmq";
import { createRedisConnection } from "./connection";
import { QUEUE } from "../config";

/** Notify queue payload: which outbound job to run. */
export type NotifyJob =
  | {
      /** Walk unanswered `late` questions up the escalation ladder. */
      kind: "escalate-questions";
    }
  | {
      /** Morning plan to every linked staffer who has something to do. */
      kind: "daily-digest";
    }
  | {
      /**
       * Morning roll-up for super_admin/admin ("director"): yesterday's cash
       * movement, balance, debt, overdue obligations, pending approvals.
       * Separate from the staff digest — different audience, different question.
       */
      kind: "director-report";
    }
  | {
      /**
       * Send one ready-made text to specific ASRO users, resolving each to a
       * Telegram chat by `User.telegramUserId`.
       *
       * Enqueued from Next.js server actions (via lib/notify.ts): the grammY
       * instance lives in the `asro-bot` process, so the web side cannot send
       * directly. The in-app Notification row is already written by then —
       * this job is the best-effort second channel.
       */
      kind: "direct-message";
      userIds: string[];
      text: string;
    }
  | {
      /**
       * Erase a message we sent, after a delay. Parollar uchun: xabar chatda
       * qolsa, u ham "oylab saqlanadi" — aynan qochmoqchi bo'lgan xavf.
       *
       * Redis'da turadi, `setTimeout` da emas: bot 2 daqiqa ichida qayta ishga
       * tushsa ham parol o'chiriladi.
       */
      kind: "delete-message";
      chatId: string;
      messageId: number;
    };

// Singleton across HMR/module reloads (see message.queue.ts for rationale).
const g = globalThis as unknown as { __notifyQueue?: Queue<NotifyJob> };

export function getNotifyQueue(): Queue<NotifyJob> {
  if (!g.__notifyQueue) {
    g.__notifyQueue = new Queue<NotifyJob>(QUEUE.NOTIFY, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 500,
        removeOnFail: 500,
      },
    });
  }
  return g.__notifyQueue;
}

/**
 * Registers the repeatable escalation sweep (BullMQ Job Scheduler — persisted
 * in Redis, so it survives restart and does not rely on an in-process
 * setInterval). Every 5 minutes: any question that has been `late` for
 * {QUESTION_L2_AFTER_MINUTES} moves up to the chief.
 *
 * L1 does not wait for this tick — the minute-by-minute question expiry cron
 * enqueues a sweep the moment it marks anything late.
 */
export async function registerNotifySchedulers(): Promise<void> {
  const q = getNotifyQueue();
  await q.upsertJobScheduler(
    "notify-escalate-questions",
    { pattern: "*/5 * * * *", tz: "Asia/Tashkent" },
    { name: "escalate-questions", data: { kind: "escalate-questions" } },
  );
  // 08:50 — ish boshlanishidan sal oldin, kun rejasini ko'rib olishga ulguradi.
  // Bir odamga kuniga bitta: dedupKey "digest:<userId>:<YYYY-MM-DD>".
  await q.upsertJobScheduler(
    "notify-daily-digest",
    { pattern: "50 8 * * *", tz: "Asia/Tashkent" },
    { name: "daily-digest", data: { kind: "daily-digest" } },
  );
  // 09:00 — xodimlar digest'idan keyin, direktor kunni to'liq manzara bilan
  // boshlasin. Bir direktorga kuniga bitta: "director:<userId>:<YYYY-MM-DD>".
  await q.upsertJobScheduler(
    "notify-director-report",
    { pattern: "0 9 * * *", tz: "Asia/Tashkent" },
    { name: "director-report", data: { kind: "director-report" } },
  );
}

/** One-off enqueue — used right after questions are marked late. */
export async function enqueueNotifyJob(job: NotifyJob, opts: { delayMs?: number } = {}): Promise<void> {
  await getNotifyQueue().add(job.kind, job, opts.delayMs ? { delay: opts.delayMs } : undefined);
}
