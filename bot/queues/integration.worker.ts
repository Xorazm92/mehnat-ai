import { Worker, type Job } from "bullmq";
import { prisma } from "../../lib/prisma";
import { sweepPendingIntegrationEvents } from "../../lib/oneCIngest";
import { createRedisConnection } from "./connection";
import { QUEUE } from "../config";
import type { IntegrationJob } from "./integration.queue";

/**
 * 1C integration worker: pending IntegrationEvent'larni qayta ishlaydi (mapping
 * resolve + domain landing seam), DLQ bilan. concurrency 1 — butun-tenant batch.
 */
export function startIntegrationWorker(): Worker<IntegrationJob> {
  const worker = new Worker<IntegrationJob>(
    QUEUE.INTEGRATION,
    async (_job: Job<IntegrationJob>) => {
      const res = await sweepPendingIntegrationEvents(prisma);
      if (res.scanned > 0) console.log(`[integration.worker] sweep:`, res);
      return res;
    },
    { connection: createRedisConnection(), concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    console.error(`[integration.worker] job ${job?.id ?? "?"} failed: ${err.message}`);
  });
  worker.on("error", (err) => {
    console.error(`[integration.worker] error: ${err.message}`);
  });

  return worker;
}
