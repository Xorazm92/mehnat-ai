import { Worker, type Job } from "bullmq";
import { logJobFailure, logServerError } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { sweepQuestionEscalations } from "../../lib/escalation";
import { runDailyDigest } from "../../lib/dailyDigest";
import { runDirectorReport } from "../../lib/directorReport";
import { createRedisConnection } from "./connection";
import { QUEUE, callbackSecret, hasTelegramToken } from "../config";
import { makeEscalationSender } from "../contexts/escalation/interface/escalation-sender";
import { makeDigestSender } from "../contexts/digest/interface/digest-sender";
import { makeDirectorSender } from "../contexts/digest/interface/director-sender";
import { deleteMessage } from "../telegram/bot";
import { deliver } from "../telegram/deliver";
import type { NotifyJob } from "./notify.queue";

/**
 * Outbound worker: escalation sweeps (and, later, digests).
 *
 * `limiter` caps sending at 25 messages/second across the whole queue. Telegram
 * allows roughly 30/s globally, and a firm-wide sweep over hundreds of
 * companies would otherwise trip 429s — which BullMQ would then retry, making
 * it worse.
 *
 * concurrency 1: these are whole-tenant batch jobs, and the escalation claims
 * are idempotent anyway, so running two at once buys nothing.
 */
export function startNotifyWorker(): Worker<NotifyJob> {
  const secret = callbackSecret();

  const worker = new Worker<NotifyJob>(
    QUEUE.NOTIFY,
    async (job: Job<NotifyJob>) => {
      if (job.data.kind === "escalate-questions") {
        const sendEscalation = hasTelegramToken() ? makeEscalationSender(secret) : undefined;
        const res = await sweepQuestionEscalations(prisma, { sendEscalation });
        if (res.l1 || res.l2) console.log(`[notify.worker] question escalation:`, res);
        return res;
      }

      if (job.data.kind === "daily-digest") {
        const now = new Date();
        const send = hasTelegramToken() ? makeDigestSender(secret, now) : undefined;
        const res = await runDailyDigest(prisma, { send, now });
        console.log(`[notify.worker] daily digest:`, res);
        return res;
      }

      if (job.data.kind === "director-report") {
        const now = new Date();
        const send = hasTelegramToken() ? makeDirectorSender() : undefined;
        const res = await runDirectorReport(prisma, { send, now });
        console.log(`[notify.worker] director report:`, res);
        return res;
      }

      if (job.data.kind === "direct-message") {
        // Sayt tomonidan yozilgan xabarning Telegram nusxasi. Bog'lanmagan
        // (telegramUserId yo'q) xodim jimgina o'tkazib yuboriladi — uning
        // uchun sayt ichidagi Notification allaqachon yozilgan.
        const { userIds, text } = job.data;
        if (!hasTelegramToken() || userIds.length === 0) return { sent: 0, skipped: true };

        const users = await prisma.user.findMany({
          where: { id: { in: userIds }, isActive: true, telegramUserId: { not: null } },
          select: { telegramUserId: true },
        });
        const report = await deliver(
          users.map((u) => ({
            chatId: u.telegramUserId as bigint,
            text,
            bestEffort: true,
          })),
        );
        return report;
      }

      if (job.data.kind === "delete-message") {
        // Parol xabarini o'chirish. Xabar allaqachon yo'q bo'lsa ham muvaffaqiyat:
        // maqsad "chatda parol qolmasin", "aynan biz o'chirdik" emas.
        const ok = await deleteMessage(BigInt(job.data.chatId), job.data.messageId);
        return { deleted: ok };
      }

      return { skipped: true };
    },
    {
      connection: createRedisConnection(),
      concurrency: 1,
      limiter: { max: 25, duration: 1000 },
    },
  );

  worker.on("failed", (job, err) => {
    logJobFailure({
      queue: "notify",
      jobId: job?.id,
      jobName: job?.name,
      attempts: job?.attemptsMade,
      err,
    });
  });
  worker.on("error", (err) => {
    logServerError("notify.worker", err);
  });

  return worker;
}
