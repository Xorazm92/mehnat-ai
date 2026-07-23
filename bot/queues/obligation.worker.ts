import { Worker, type Job } from "bullmq";
import { prisma } from "../../lib/prisma";
import { runGenerationLocked } from "../../lib/obligationRun";
import { sweepDeadlines } from "../../lib/obligationSweep";
import { sweepTaskSla } from "../../lib/taskSla";
import { createRedisConnection } from "./connection";
import { QUEUE, hasTelegramToken } from "../config";
import { sendMessage } from "../telegram/bot";
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
        const res = await runGenerationLocked(prisma, { catchUpMonths: 2 });
        console.log(`[obligation.worker] generate:`, res.skipped ? "skipped(locked)" : res.results?.map((r) => r.created));
        return res;
      }
      // Telegram push faqat token bo'lsa (aks holda faqat in-app eslatma).
      const notifyTelegram = hasTelegramToken() ? (chatId: bigint, text: string) => sendMessage(chatId, text) : undefined;
      const res = await sweepDeadlines(prisma, { now: new Date(), notifyTelegram });
      // Bir jadvalda task SLA breach'larini ham tekshiramiz.
      const sla = await sweepTaskSla(prisma, { now: new Date() });
      console.log(`[obligation.worker] sweep:`, res, "| task-sla:", sla);
      return { ...res, taskSla: sla };
    },
    { connection: createRedisConnection(), concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    console.error(`[obligation.worker] job ${job?.id ?? "?"} (${job?.name}) failed: ${err.message}`);
  });
  worker.on("error", (err) => {
    console.error(`[obligation.worker] error: ${err.message}`);
  });

  return worker;
}
