import { Queue } from "bullmq";
import { createRedisConnection } from "./connection";
import { QUEUE } from "../config";

/** Obligation queue payload: which compliance job to run. */
export interface ObligationJob {
  kind: "generate" | "sweep";
}

// Singleton across HMR/module reloads (see message.queue.ts for rationale).
const g = globalThis as unknown as { __obligationQueue?: Queue<ObligationJob> };

export function getObligationQueue(): Queue<ObligationJob> {
  if (!g.__obligationQueue) {
    g.__obligationQueue = new Queue<ObligationJob>(QUEUE.OBLIGATION, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 500,
        removeOnFail: 500,
      },
    });
  }
  return g.__obligationQueue;
}

/**
 * Registers the repeatable schedulers (BullMQ Job Scheduler — persisted in
 * Redis, so they survive restart and don't rely on an in-process setInterval):
 *  - generation: daily 06:00 Asia/Tashkent (idempotent; catch-up inside runner)
 *  - deadline sweep: hourly (dedup inside sweep)
 * upsert → calling again just updates the schedule, never duplicates it.
 */
export async function registerObligationSchedulers(): Promise<void> {
  const q = getObligationQueue();
  await q.upsertJobScheduler(
    "obligation-generate-daily",
    { pattern: "0 6 * * *", tz: "Asia/Tashkent" },
    { name: "generate", data: { kind: "generate" } },
  );
  await q.upsertJobScheduler(
    "obligation-sweep-hourly",
    { pattern: "0 * * * *", tz: "Asia/Tashkent" },
    { name: "sweep", data: { kind: "sweep" } },
  );
}

/** Manual one-off enqueue (e.g. an admin "generate now" button, later). */
export async function enqueueObligationJob(job: ObligationJob): Promise<void> {
  await getObligationQueue().add(job.kind, job);
}
