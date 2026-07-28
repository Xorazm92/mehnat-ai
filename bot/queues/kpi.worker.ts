import { Worker, type Job } from "bullmq";
import { logJobFailure, logServerError } from "../../lib/logger";
import {
  evaluateObligationEvidence,
  evaluateAttendanceEvidence,
  evaluateResponseEvidence,
} from "../../lib/kpiEvidence";
import { getPreviousPeriodKey, getCurrentPeriodKey } from "../../lib/periods";
import { createRedisConnection } from "./connection";
import { QUEUE } from "../config";
import type { KpiJob } from "./kpi.queue";

/**
 * KPI worker: oy uchun barcha dalil manbalarini MonthlyPerformance takliflariga
 * o'giradi. Yozuvlar `status='submitted'` — maoshga faqat nazoratchi
 * tasdiqlagach tushadi (ADR-0001), shuning uchun bu job hech qachon o'z-o'zidan
 * pul harakatiga sabab bo'lmaydi.
 *
 * concurrency 1 — bu butun-tenant batch ish; ikkitasi bir vaqtda yurishidan
 * foyda yo'q, upsert'lar esa bir-birini urib ketishi mumkin.
 */
export function startKpiWorker(): Worker<KpiJob> {
  const worker = new Worker<KpiJob>(
    QUEUE.KPI,
    async (job: Job<KpiJob>) => {
      const month = job.data.month || getPreviousPeriodKey(getCurrentPeriodKey());
      if (!month) throw new Error("KPI job uchun oy aniqlanmadi");

      const now = new Date();
      const obligations = await evaluateObligationEvidence(month, now);
      const attendance = await evaluateAttendanceEvidence(month, now);
      const response = await evaluateResponseEvidence(month, { now });

      const summary = {
        month,
        obligations: obligations.updated,
        attendance: attendance.updated,
        response: response.written,
        skippedApproved:
          obligations.skippedApproved + attendance.skippedApproved + response.skippedApproved,
      };
      console.log("[kpi.worker] project:", summary);
      return summary;
    },
    { connection: createRedisConnection(), concurrency: 1 }
  );

  worker.on("failed", (job, err) => {
    logJobFailure({
      queue: QUEUE.KPI,
      jobId: job?.id,
      jobName: job?.name,
      attempts: job?.attemptsMade,
      err,
    });
  });
  worker.on("error", (err) => {
    logServerError("kpi.worker", err);
  });

  return worker;
}
