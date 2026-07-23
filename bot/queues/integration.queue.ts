import { Queue } from "bullmq";
import { createRedisConnection } from "./connection";
import { QUEUE } from "../config";

export interface IntegrationJob {
  kind: "process";
}

const g = globalThis as unknown as { __integrationQueue?: Queue<IntegrationJob> };

export function getIntegrationQueue(): Queue<IntegrationJob> {
  if (!g.__integrationQueue) {
    g.__integrationQueue = new Queue<IntegrationJob>(QUEUE.INTEGRATION, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 500,
        removeOnFail: 500,
      },
    });
  }
  return g.__integrationQueue;
}

/**
 * Repeatable sweep: pending IntegrationEvent'larni har 2 daqiqada qayta ishlaydi.
 * Real-time shart emas (reviewer) — sweep model ingest'ni process'dan ajratadi,
 * enqueue nosozligida ham hodisalar DB'da qoladi va keyingi sweep'da ishlanadi.
 */
export async function registerIntegrationSchedulers(): Promise<void> {
  const q = getIntegrationQueue();
  await q.upsertJobScheduler("integration-process", { every: 120_000 }, { name: "process", data: { kind: "process" } });
}
