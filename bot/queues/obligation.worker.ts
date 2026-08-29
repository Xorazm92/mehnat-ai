import { Worker, type Job } from "bullmq";
import { logJobFailure, logServerError } from "../../lib/platform/logger";
import { prisma } from "../../lib/prisma";
import { runGenerationLocked } from "../../lib/engines/obligation/obligationRun";
import { generateMonthlyPayments } from "../../lib/paymentGeneration";
import { sweepDeadlines } from "../../lib/engines/automation/obligationSweep";
import { createRedisConnection } from "./connection";
import { QUEUE, callbackSecret, hasTelegramToken } from "../config";
import { sendMessage } from "../telegram/bot";
import { makeEscalationSender } from "../contexts/escalation/interface/escalation-sender";
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

        // Majburiyat generatsiyasi bilan bir hodisada — mustaqil natija,
        // xatosi obligation generatsiyasini to'xtatmasin.
        try {
          const paymentsRes = await generateMonthlyPayments(prisma);
          console.log(
            `[obligation.worker] payments:`,
            `created=${paymentsRes.created} updated=${paymentsRes.updated} ` +
              `skippedNoTerm=${paymentsRes.skippedNoTerm} skippedInProgress=${paymentsRes.skippedInProgress} ` +
              `errors=${paymentsRes.errors.length}`
          );
        } catch (e) {
          logServerError("obligation.worker.payments", e);
        }

        return res;
      }
      // Telegram push faqat token bo'lsa (aks holda faqat in-app eslatma).
      // `notifyTelegram` — mas'ulning shaxsiy chatiga oddiy eslatma;
      // `sendEscalation` — nazoratchi/chiefga tugmali ogohlantirish.
      const notifyTelegram = hasTelegramToken()
        ? async (chatId: bigint, text: string) => {
            await sendMessage(chatId, text);
          }
        : undefined;
      const sendEscalation = hasTelegramToken()
        ? makeEscalationSender(callbackSecret())
        : undefined;
      const res = await sweepDeadlines(prisma, { now: new Date(), notifyTelegram, sendEscalation });
      console.log(`[obligation.worker] sweep:`, res);
      return res;
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
