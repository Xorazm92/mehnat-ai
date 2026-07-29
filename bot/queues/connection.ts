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

let shared: Redis | undefined;

/**
 * One shared connection for ordinary key/value work (short-lived state such as
 * the receipt window). Deliberately NOT for BullMQ — those need their own
 * connections because blocking commands monopolise them. Per-message code must
 * use this rather than `createRedisConnection`, which would open a new socket
 * on every Telegram update.
 */
export function getSharedRedis(): Redis {
  if (!shared) shared = new Redis(config.redisUrl);
  return shared;
}
