import { Redis } from "ioredis";
import { config } from "../config";

/**
 * Creates a fresh Redis connection for BullMQ. `maxRetriesPerRequest: null` is
 * required by BullMQ workers (blocking commands must not time out); it is also
 * safe for producers, so both use the same factory.
 *
 * BullMQ recommends a dedicated connection per Queue/Worker, so callers create
 * their own rather than sharing one instance.
 */
export function createRedisConnection(): Redis {
  return new Redis(config.redisUrl, { maxRetriesPerRequest: null });
}
