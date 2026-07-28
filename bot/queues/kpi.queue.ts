import { Queue } from "bullmq";
import { createRedisConnection } from "./connection";
import { QUEUE } from "../config";

export interface KpiJob {
  kind: "project";
  /** "YYYY-MM". Bo'sh bo'lsa — o'tgan oy (job oy boshida ishlaydi). */
  month?: string;
}

let queue: Queue<KpiJob> | null = null;

export function getKpiQueue(): Queue<KpiJob> {
  if (!queue) {
    queue = new Queue<KpiJob>(QUEUE.KPI, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 500,
        removeOnFail: 500,
      },
    });
  }
  return queue;
}

/**
 * Oyning 2-sanasi 03:00 (Tashkent) — o'tgan oy uchun KPI takliflarini hisoblaydi.
 * 1-sana emas: obligation sweep va oy-yopish ishlari 1-sanada yuriladi, ular
 * tugagach hisoblash to'liqroq bo'ladi.
 *
 * `upsertJobScheduler` idempotent — qayta ishga tushirish dublikat jadval
 * yaratmaydi (obligation.queue.ts bilan bir xil naqsh).
 */
export async function registerKpiSchedulers(): Promise<void> {
  const q = getKpiQueue();
  await q.upsertJobScheduler(
    "kpi-project-monthly",
    { pattern: "0 3 2 * *", tz: "Asia/Tashkent" },
    { name: "project", data: { kind: "project" } }
  );
}

export async function enqueueKpiJob(job: KpiJob): Promise<void> {
  await getKpiQueue().add(job.kind, job);
}
