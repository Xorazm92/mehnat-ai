import { Queue } from "bullmq";
import { createRedisConnection } from "./connection";
import { QUEUE } from "../config";

/**
 * Fan-out jobs from the Message worker to the Question worker. Ids are plain
 * numbers (JSON-safe, within Telegram's safe-integer range); the worker widens
 * them to BigInt. Keeping the slow Gemini classify off the capture path lets it
 * scale and retry independently.
 */
export type QuestionJob =
  | {
      kind: "classify";
      chatId: number;
      messageId: number;
      fromUserId?: number;
      text: string;
      askedAtMs: number;
    }
  | {
      kind: "answer";
      chatId: number;
      replyToMessageId: number;
      answerMessageId: number;
      fromUserId?: number;
      answeredAtMs: number;
    };

const g = globalThis as unknown as { __botQuestionQueue?: Queue<QuestionJob> };

export function getQuestionQueue(): Queue<QuestionJob> {
  if (!g.__botQuestionQueue) {
    g.__botQuestionQueue = new Queue<QuestionJob>(QUEUE.QUESTION, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }
  return g.__botQuestionQueue;
}

export async function enqueueQuestionJob(job: QuestionJob): Promise<void> {
  await getQuestionQueue().add(job.kind, job);
}
