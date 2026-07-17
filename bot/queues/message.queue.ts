import { Queue } from "bullmq";
import { createRedisConnection } from "./connection";
import { QUEUE } from "../config";
import type { RawTelegramUpdate } from "../contexts/monitoring/domain/inbound-message";

/** The payload carried on the `message` queue: one raw Telegram update. */
export interface TelegramUpdateJob {
  update: RawTelegramUpdate;
}

// Singleton across HMR/module reloads so the webhook route doesn't leak a Redis
// connection on every dev recompile.
const g = globalThis as unknown as {
  __botMessageQueue?: Queue<TelegramUpdateJob>;
};

export function getMessageQueue(): Queue<TelegramUpdateJob> {
  if (!g.__botMessageQueue) {
    g.__botMessageQueue = new Queue<TelegramUpdateJob>(QUEUE.MESSAGE, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }
  return g.__botMessageQueue;
}

/**
 * Enqueue a raw Telegram update for the Message worker. The update is stored
 * as-received (numeric ids, JSON-safe); the worker converts to BigInt when it
 * persists. `jobId` gives cheap queue-level dedup — the authoritative dedup is
 * the `ProcessedUpdate` row written by the worker.
 */
export async function enqueueTelegramUpdate(
  update: RawTelegramUpdate,
): Promise<void> {
  // BullMQ forbids ":" in custom job ids.
  const jobId =
    update?.update_id != null ? `tg-${update.update_id}` : undefined;
  await getMessageQueue().add("update", { update }, { jobId });
}
