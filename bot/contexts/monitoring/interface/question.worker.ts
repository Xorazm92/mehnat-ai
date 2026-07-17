import { Worker, type Job } from "bullmq";
import { prisma } from "../../../../lib/prisma";
import { createRedisConnection } from "../../../queues/connection";
import { QUEUE } from "../../../config";
import { getClassifier, QUESTION_CONFIDENCE_THRESHOLD, DEFAULT_RESPONSIBLE_ROLE } from "../../ai";
import { resolveUserIdByTelegramId, resolveCompanyIdByChatId } from "../../identity/application/identity-service";
import { openQuestion } from "../application/open-question";
import { answerQuestion } from "../application/answer-question";
import { recordQuestionKpi } from "../../kpi/application/record-question-kpi";
import type { QuestionJob } from "../../../queues/question.queue";

/**
 * The Question worker: classifies candidate messages (Gemini or heuristic) and
 * opens Questions with a deadline, and records replies as answers. Idempotent —
 * openQuestion dedups per (chat, message) and answerQuestion no-ops once a
 * question is answered — so BullMQ retries are safe.
 */
export function startQuestionWorker(): Worker<QuestionJob> {
  const worker = new Worker<QuestionJob>(
    QUEUE.QUESTION,
    async (job: Job<QuestionJob>) => {
      const data = job.data;

      if (data.kind === "answer") {
        const byUserId = data.fromUserId
          ? await resolveUserIdByTelegramId(prisma, BigInt(data.fromUserId))
          : null;
        const res = await answerQuestion(prisma, {
          chatId: BigInt(data.chatId),
          replyToMessageId: BigInt(data.replyToMessageId),
          answerMessageId: BigInt(data.answerMessageId),
          byUserId,
          answeredAt: new Date(data.answeredAtMs),
        });
        if (res.answered && res.questionId) {
          await recordQuestionKpi(prisma, res.questionId, res.onTime ? "on_time" : "late");
        }
        return res;
      }

      const cls = await getClassifier().classify(data.text);
      if (!cls.isQuestion || cls.confidence < QUESTION_CONFIDENCE_THRESHOLD) {
        return { opened: false };
      }
      const companyId = await resolveCompanyIdByChatId(prisma, BigInt(data.chatId));
      return openQuestion(prisma, {
        chatId: BigInt(data.chatId),
        messageId: BigInt(data.messageId),
        askedByUserId: data.fromUserId ? BigInt(data.fromUserId) : null,
        companyId,
        responsibleRole: cls.responsibleRole ?? DEFAULT_RESPONSIBLE_ROLE,
        confidence: cls.confidence,
        askedAt: new Date(data.askedAtMs),
      });
    },
    { connection: createRedisConnection(), concurrency: 5 },
  );

  worker.on("failed", (job, err) => {
    console.error(`[question.worker] job ${job?.id ?? "?"} failed: ${err.message}`);
  });
  worker.on("error", (err) => {
    console.error(`[question.worker] error: ${err.message}`);
  });

  return worker;
}
