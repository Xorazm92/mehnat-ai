import { Queue } from "bullmq";
import { createRedisConnection } from "./connection";
import { QUEUE } from "../config";

/** Notify queue payload: which outbound job to run. */
export interface NotifyJob {
  kind:
    /** Walk unanswered `late` questions up the escalation ladder. */
    | "escalate-questions"
    /** Morning plan to every linked staffer who has something to do. */
    | "daily-digest";
}

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
}

/** One-off enqueue — used right after questions are marked late. */
export async function enqueueNotifyJob(job: NotifyJob): Promise<void> {
  await getNotifyQueue().add(job.kind, job);
}
