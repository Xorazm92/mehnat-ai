import { Worker, type Job } from "bullmq";
import { logJobFailure, logServerError } from "../../lib/platform/logger";
import { prisma } from "../../lib/prisma";
import { runGenerationLocked } from "../../lib/engines/obligation/obligationRun";
import { loadCompanySubjects } from "../../lib/domains/accounting/subjects";
import { sweepDeadlines } from "../../lib/engines/automation/obligationSweep";
import { createRedisConnection } from "./connection";
import { QUEUE } from "../config";
import type { ObligationJob } from "./obligation.queue";

/**
 * Compliance worker: runs obligation generation (advisory-locked, with catch-up)
 * and the deadline sweep (dedup-safe reminders). concurrency 1 — these are
 * whole-tenant batch jobs; there's no gain from running two at once, and the
 * advisory lock would just make the second skip anyway.
 */
export function startObligationWorker(): Worker<ObligationJob> {
  const worker = new Worker<ObligationJob>(
    QUEUE.OBLIGATION,
    async (job: Job<ObligationJob>) => {
      if (job.data.kind === "generate") {
        const res = await runGenerationLocked(prisma, { catchUpMonths: 2, loadSubjects: loadCompanySubjects });
        console.log(`[obligation.worker] generate:`, res.skipped ? "skipped(locked)" : res.results?.map((r) => r.created));
        return res;
      }
      // Sweep endi XABAR YUBORMAYDI — u bosqichlarni qayd etadi va ko'rinadigan
      // xabarni kunlik yig'ma chiqaradi (lib/engines/automation/obligationRollup.ts,
      // `notify-obligation-rollup` rejasi). Shuning uchun bu yerda Telegram
      // yuboruvchisi ham berilmaydi.
      const res = await sweepDeadlines(prisma, { now: new Date() });
      console.log(`[obligation.worker] sweep:`, res);
    },
    { connection: createRedisConnection(), concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    logJobFailure({
      queue: "obligation",
      jobId: job?.id,
      jobName: job?.name,
      attempts: job?.attemptsMade,
      err,
    });
  });
  worker.on("error", (err) => {
    logServerError("obligation.worker", err);
  });

  return worker;
}
