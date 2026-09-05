// =====================================================
// RATE LIMITER — login brute-force himoyasi
// =====================================================
// Ikki qatlam:
//   1) Redis (asosiy) — instance'lar orasida umumiy, restart'dan omon qoladi.
//   2) In-memory (zaxira) — Redis yo'q/o'chgan bo'lsa avtomatik ishga tushadi.
//
// Fixed-window hisoblagich. Faqat MUVAFFAQIYATSIZ urinishlar hisoblanadi;
// muvaffaqiyat hisoblagichni tozalaydi. Edge EMAS — lib/auth.ts (Node authorize)
// ishlatadi.

import { RATE_LIMIT } from "@/lib/constants";
import { getRedis } from "@/lib/redis";
import { logger } from "@/lib/platform/logger";

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();
const MAX_KEYS = 50_000; // xotira portlashidan himoya

function pruneIfLarge(now: number): void {
  if (store.size < MAX_KEYS) return;
  for (const [k, b] of store) if (now >= b.resetAt) store.delete(k);
}

/**
 * Urinishga ruxsat bormi (limitdan oshmaganmi). Hisoblagichni O'ZGARTIRMAYDI.
 *
 * `windowMs` PARAMETRI OLIB TASHLANDI. U qabul qilinardi-yu, tanada
 * ishlatilmasdi: oyna `recordFailure` da ochiladi va `b.resetAt` ga
 * yoziladi, ya'ni tekshiruv paytida uzunlikni qayta berishning ma'nosi
 * yo'q. Imzo esa chaqiruvchiga "oynani men belgilayman" degan noto'g'ri
 * taassurot berardi — turli joyda turli qiymat berilsa ham hech narsa
 * o'zgarmasdi.
 */
export function checkRateLimit(
  key: string,
  limit: number,
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const b = store.get(key);
  if (!b || now >= b.resetAt) return { allowed: true, retryAfterMs: 0 };
  if (b.count >= limit) return { allowed: false, retryAfterMs: b.resetAt - now };
  return { allowed: true, retryAfterMs: 0 };
}

/** Muvaffaqiyatsiz urinishni qayd etadi (oynani ochadi yoki hisobni oshiradi). */
export function recordFailure(key: string, windowMs: number): void {
  const now = Date.now();
  pruneIfLarge(now);
  const b = store.get(key);
  if (!b || now >= b.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  b.count += 1;
}

/** Muvaffaqiyatda hisoblagichni tozalaydi. */
export function resetRateLimit(key: string): void {
  store.delete(key);
}

/** Testlar uchun — butun holatni tozalaydi. */
export function __clearRateLimitStore(): void {
  store.clear();
}

// =====================================================
// REDIS QATLAMI + KO'P-BUCKET LOGIN LIMITI
// =====================================================

/** Bir tekshiruvda qatnashadigan bitta hisoblagich. */
export interface RateLimitRule {
  /** Inson o'qiy oladigan nom — log va test uchun (`ip+login`, `ip`, `account`). */
  scope: string;
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitOutcome {
  allowed: boolean;
  retryAfterMs: number;
  /** Qaysi qatlam javob berdi — Redis o'chganini kuzatish uchun. */
  backend: "redis" | "memory";
  /** Bloklagan qoida nomi (allowed=false bo'lganda). */
  blockedScope?: string;
}

// BullMQ ham shu Redis'da yashaydi — prefiks kalitlar to'qnashmasligi uchun.
const PREFIX = "rl:";

// INCR + faqat birinchi urinishda PEXPIRE. Lua atomik bo'lgani uchun ikki
// parallel login orasida oyna "abadiy" bo'lib qolmaydi (PEXPIRE'siz kalit).
// `PEXPIRE … NX` Redis 7+ talab qiladi, bu skript Redis 6'da ham ishlaydi.
const INCR_LUA = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return c
`;

/** Login identifikatorini normallashtiradi — katta/kichik harf limitni chetlab o'tmasin. */
export function normalizeLoginId(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * So'rov sarlavhalaridan klient IP'sini oladi. Prod'da nginx/ALB ortida
 * `x-forwarded-for` birinchi hop = haqiqiy klient. Topilmasa "unknown" —
 * bu holda barcha noma'lum manbalar bitta bucket'ni bo'lishadi, ya'ni
 * limit kuchayadi, zaiflashmaydi.
 */
export function clientIpFromHeaders(headers: Headers | undefined): string {
  if (!headers) return "unknown";
  const xff = headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  if (first) return first;
  return headers.get("x-real-ip")?.trim() || headers.get("cf-connecting-ip")?.trim() || "unknown";
}

/**
 * Login uchun uchta bucket. Har biri boshqa hujum shaklini yopadi:
 *
 *   ip+login  (5/15daq)  — spetsifikatsiya: bitta manbadan bitta hisobni tanlash.
 *   ip        (50/15daq) — bitta IP'dan login'larni aylantirish (credential stuffing).
 *                          Ataylab yumshoqroq: buxgalteriya ofisi bitta NAT IP
 *                          ortida o'tiradi, 5 ta xato butun ofisni bloklardi.
 *   account   (20/15daq) — ko'p IP'dan bitta hisobga taqsimlangan hujum.
 */
export function loginRateLimitRules(ip: string, login: string): RateLimitRule[] {
  return [
    {
      scope: "ip+login",
      key: `${PREFIX}login:${ip}|${login}`,
      limit: RATE_LIMIT.LOGIN_ATTEMPTS,
      windowMs: RATE_LIMIT.LOGIN_WINDOW_MS,
    },
    {
      scope: "ip",
      key: `${PREFIX}login-ip:${ip}`,
      limit: RATE_LIMIT.LOGIN_IP_ATTEMPTS,
      windowMs: RATE_LIMIT.LOGIN_WINDOW_MS,
    },
    {
      scope: "account",
      key: `${PREFIX}login-acct:${login}`,
      limit: RATE_LIMIT.LOGIN_ACCOUNT_ATTEMPTS,
      windowMs: RATE_LIMIT.LOGIN_WINDOW_MS,
    },
  ];
}

function checkInMemory(rules: RateLimitRule[]): RateLimitOutcome {
  for (const r of rules) {
    const res = checkRateLimit(r.key, r.limit);
    if (!res.allowed) {
      return { allowed: false, retryAfterMs: res.retryAfterMs, backend: "memory", blockedScope: r.scope };
    }
  }
  return { allowed: true, retryAfterMs: 0, backend: "memory" };
}

/** Redis xatosi hech qachon login'ni yiqitmasligi kerak — bir marta log, keyin zaxira yo'l. */
function fallback(err: unknown, op: string): void {
  logger.warn({ event: "ratelimit.degraded", op, err }, "rate limit fell back to in-memory");
}

/**
 * Barcha bucket'larni tekshiradi. Hisoblagichni O'ZGARTIRMAYDI.
 * Redis mavjud bo'lmasa in-memory zaxiraga tushadi (fail-open emas — himoya
 * saqlanadi, faqat instance doirasida).
 */
export async function checkLoginRateLimit(rules: RateLimitRule[]): Promise<RateLimitOutcome> {
  const redis = getRedis();
  if (!redis) return checkInMemory(rules);

  try {
    const pipeline = redis.pipeline();
    for (const r of rules) pipeline.get(r.key).pttl(r.key);
    const raw = await pipeline.exec();
    if (!raw) return checkInMemory(rules);

    for (let i = 0; i < rules.length; i++) {
      const [countErr, countVal] = raw[i * 2] ?? [];
      const [ttlErr, ttlVal] = raw[i * 2 + 1] ?? [];
      if (countErr || ttlErr) throw countErr ?? ttlErr;

      const count = Number(countVal ?? 0);
      if (count >= rules[i].limit) {
        // PTTL manfiy bo'lsa (kalit muddatsiz/yo'q) to'liq oynani qaytaramiz.
        const ttl = Number(ttlVal ?? -1);
        return {
          allowed: false,
          retryAfterMs: ttl > 0 ? ttl : rules[i].windowMs,
          backend: "redis",
          blockedScope: rules[i].scope,
        };
      }
    }
    return { allowed: true, retryAfterMs: 0, backend: "redis" };
  } catch (err) {
    fallback(err, "check");
    return checkInMemory(rules);
  }
}

/** Muvaffaqiyatsiz urinishni BARCHA bucket'larda qayd etadi. */
export async function recordLoginFailure(rules: RateLimitRule[]): Promise<void> {
  const redis = getRedis();
  // In-memory zaxira har doim yangilanadi: Redis keyinroq o'chib qolsa
  // hisoblagich noldan boshlanmasin.
  for (const r of rules) recordFailure(r.key, r.windowMs);
  if (!redis) return;

  try {
    const pipeline = redis.pipeline();
    for (const r of rules) pipeline.eval(INCR_LUA, 1, r.key, String(r.windowMs));
    await pipeline.exec();
  } catch (err) {
    fallback(err, "record");
  }
}

/**
 * Muvaffaqiyatli login'da hisoblagichlarni tozalaydi.
 *
 * DIQQAT: `ip` bucket'i ATAYLAB tozalanmaydi. Aks holda bitta haqiqiy hisobga
 * kirgan hujumchi o'z IP byudjetini xohlagancha yangilab, credential stuffing'ni
 * cheksiz davom ettira olardi.
 */
export async function resetLoginRateLimit(rules: RateLimitRule[]): Promise<void> {
  const clearable = rules.filter((r) => r.scope !== "ip");
  for (const r of clearable) resetRateLimit(r.key);

  const redis = getRedis();
  if (!redis || clearable.length === 0) return;
  try {
    await redis.del(...clearable.map((r) => r.key));
  } catch (err) {
    fallback(err, "reset");
  }
}
