// =====================================================
// APP-LEVEL REDIS CLIENT (rate limiting, cache)
// =====================================================
// bot/queues/connection.ts BullMQ uchun HAR queue/worker'ga alohida ulanish
// yaratadi (BullMQ shuni talab qiladi). Bu esa web ilova uchun bitta, umumiy,
// qisqa timeout'li klient — login yo'lida turgani uchun u HECH QACHON so'rovni
// osib qo'ymasligi kerak.
//
// Muhim sozlamalar:
//   enableOfflineQueue: false  → Redis o'chgan bo'lsa buyruq navbatga turmaydi,
//                                darhol xato qaytaradi (fail-fast → fail-open).
//   maxRetriesPerRequest: 1    → bitta qayta urinish, keyin xato.
//   connectTimeout: 1000       → login 1 soniyadan ortiq kutmaydi.
//
// Node-only (ioredis). proxy.ts (Edge) bu moduldan import qilmasligi kerak.

import { Redis } from "ioredis";
import { logger } from "@/lib/platform/logger";

const globalForRedis = globalThis as unknown as { asroRedis?: Redis | null };

/** Ulanish xatolari spam qilmasin — 60 soniyada bir marta log yoziladi. */
let lastErrorLoggedAt = 0;
const ERROR_LOG_INTERVAL_MS = 60_000;

/**
 * Redis URL — bot/config.ts BILAN BIR XIL default. Bu ataylab: REDIS_URL hech
 * qaysi env faylda yozilmagan (bot default bilan ishlaydi), shuning uchun bu
 * yerda default bo'lmasa rate limit prod'da JIMGINA in-memory'ga tushib qolardi.
 * `REDIS_URL=""` deb aniq bo'sh qo'yish — Redis'siz ishlashni tanlash usuli.
 */
export const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

/**
 * Umumiy Redis klienti. URL bo'sh bo'lsa `null` qaytaradi — chaqiruvchi
 * o'zining zaxira yo'liga (in-memory) o'tishi kerak, xato tashlamasligi kerak.
 */
export function getRedis(): Redis | null {
  if (globalForRedis.asroRedis !== undefined) return globalForRedis.asroRedis;

  const url = REDIS_URL;
  if (!url) {
    globalForRedis.asroRedis = null;
    return null;
  }

  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 1_000,
    // Cheksiz qayta ulanish, lekin o'sib boruvchi kechikish bilan (maks 10 s).
    retryStrategy: (times) => Math.min(times * 200, 10_000),
  });

  // ioredis 'error' hodisasini tinglovchisiz qoldirsak Node butun jarayonni
  // yiqitadi. Shuning uchun majburiy handler — throttled log bilan.
  client.on("error", (err: Error) => {
    const now = Date.now();
    if (now - lastErrorLoggedAt < ERROR_LOG_INTERVAL_MS) return;
    lastErrorLoggedAt = now;
    logger.warn({ event: "redis.error", err }, "redis unavailable — degraded mode");
  });

  globalForRedis.asroRedis = client;
  return client;
}

/** Testlar uchun — klientni yopib, keshlangan holatni tozalaydi. */
export async function __resetRedisForTests(): Promise<void> {
  const c = globalForRedis.asroRedis;
  globalForRedis.asroRedis = undefined;
  if (c) await c.quit().catch(() => {});
}
