import { Worker, type Job } from "bullmq";
import { prisma } from "../../../../lib/prisma";
import { createRedisConnection } from "../../../queues/connection";
import { QUEUE } from "../../../config";
import { captureUpdate } from "../application/capture-update";
import {
  parseInboundMessage,
  type InboundMessage,
  type RawTelegramUpdate,
} from "../domain/inbound-message";
import { looksLikeQuestion } from "../domain/question-detection";
import { resolveUserIdByTelegramId } from "../../identity/application/identity-service";
import { routeCommand } from "../../identity/interface/command-router";
import { sendMessage } from "../../../telegram/bot";
import { enqueueQuestionJob } from "../../../queues/question.queue";
import type { TelegramUpdateJob } from "../../../queues/message.queue";

/**
 * Best-effort side-effects that run once per fresh update: command replies and
 * question/answer fan-out. They run AFTER capture has committed, so a failure
 * here must not fail the job (a redelivery would dedup and skip them). The slow
 * Gemini classify happens in the Question worker, not on this capture path.
 */
async function runSideEffects(
  update: RawTelegramUpdate,
  parsed: InboundMessage,
): Promise<void> {
  // 1) Commands → immediate reply (delivery itself is best-effort).
  const reply = await routeCommand(prisma, update);
  if (reply) {
    try {
      await sendMessage(reply.chatId, reply.text);
    } catch (err) {
      console.error(
        `[message.worker] reply send failed for chat ${reply.chatId}: ${(err as Error).message}`,
      );
    }
    return;
  }
  if (parsed.text?.startsWith("/")) return; // unknown command — not a question

  // 2) A reply may answer a pending question.
  if (parsed.replyToId != null) {
    await enqueueQuestionJob({
      kind: "answer",
      chatId: Number(parsed.chatId),
      replyToMessageId: Number(parsed.replyToId),
      answerMessageId: Number(parsed.messageId),
      fromUserId: parsed.fromUserId != null ? Number(parsed.fromUserId) : undefined,
      answeredAtMs: parsed.createdAt.getTime(),
    });
  }

  // 3) A question-looking text/reply → classify + open (Question worker).
  if (
    (parsed.kind === "text" || parsed.kind === "reply") &&
    looksLikeQuestion(parsed.text)
  ) {
    await enqueueQuestionJob({
      kind: "classify",
      chatId: Number(parsed.chatId),
      messageId: Number(parsed.messageId),
      fromUserId: parsed.fromUserId != null ? Number(parsed.fromUserId) : undefined,
      text: parsed.text ?? "",
      askedAtMs: parsed.createdAt.getTime(),
    });
  }
}

/**
 * The Message worker: the single processing path for every inbound Telegram
 * update, whichever ingress (webhook or polling) enqueued it. It dedups,
 * attributes the sender, captures the message, then fans out.
 */
export function startMessageWorker(): Worker<TelegramUpdateJob> {
  const worker = new Worker<TelegramUpdateJob>(
    QUEUE.MESSAGE,
    async (job: Job<TelegramUpdateJob>) => {
      const update = job.data.update;

      const parsed = parseInboundMessage(update);
      const resolvedUserId = parsed?.fromUserId
        ? await resolveUserIdByTelegramId(prisma, parsed.fromUserId)
        : null;

      const result = await captureUpdate(prisma, update, resolvedUserId);

      if (!result.deduped && parsed) {
        try {
          await runSideEffects(update, parsed);
        } catch (err) {
          console.error(`[message.worker] side-effects failed: ${(err as Error).message}`);
        }
      }

      return result;
    },
    { connection: createRedisConnection(), concurrency: 10 },
  );

  worker.on("failed", (job, err) => {
    console.error(`[message.worker] job ${job?.id ?? "?"} failed: ${err.message}`);
  });
  worker.on("error", (err) => {
    console.error(`[message.worker] error: ${err.message}`);
  });

  return worker;
}
