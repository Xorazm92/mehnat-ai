/**
 * LOGIN RATE LIMIT — Redis qatlami (xodim + mijoz portali bitta authorize'dan
 * o'tgani uchun ikkalasi ham shu limit bilan himoyalanadi).
 *
 * Redis mavjud bo'lmasa testlar o'tkazib yuboriladi (skip) — in-memory zaxira
 * yo'li alohida test/rate-limit.test.ts da qoplangan.
 */
import { describe, it, expect, beforeEach, afterAll, beforeAll } from "vitest";
import {
  checkLoginRateLimit,
  recordLoginFailure,
  resetLoginRateLimit,
  loginRateLimitRules,
  normalizeLoginId,
  clientIpFromHeaders,
  __clearRateLimitStore,
} from "@/lib/rateLimit";
import { getRedis } from "@/lib/redis";
import { RATE_LIMIT } from "@/lib/constants";

const redis = getRedis();
let redisUp = false;

beforeAll(async () => {
  try {
    redisUp = (await redis?.ping()) === "PONG";
  } catch {
    redisUp = false;
  }
});

const TAG = `vitest-rl-${Date.now()}`;
const IP_A = `10.0.0.${(Date.now() % 200) + 1}`;
const IP_B = "10.9.9.9";
const LOGIN = `${TAG}@v.local`;

async function purge() {
  __clearRateLimitStore();
  if (!redis || !redisUp) return;
  const keys = await redis.keys(`rl:*${TAG}*`);
  const ipKeys = await redis.keys(`rl:login-ip:10.*`);
  const all = [...keys, ...ipKeys];
  if (all.length) await redis.del(...all);
}

beforeEach(purge);
afterAll(async () => {
  await purge();
  await redis?.quit().catch(() => {});
});

describe("kalitlar va normalizatsiya", () => {
  it("login'ni katta/kichik harf va bo'shliqdan tozalaydi", () => {
    expect(normalizeLoginId("  Admin@ASRO.uz ")).toBe("admin@asro.uz");
  });

  it("IP'ni x-forwarded-for birinchi hop'idan oladi", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 172.16.0.1" });
    expect(clientIpFromHeaders(h)).toBe("203.0.113.7");
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(clientIpFromHeaders(new Headers())).toBe("unknown");
    expect(clientIpFromHeaders(undefined)).toBe("unknown");
  });

  it("uchta bucket yaratadi va ip+login limiti 5 ta", () => {
    const rules = loginRateLimitRules(IP_A, LOGIN);
    expect(rules.map((r) => r.scope)).toEqual(["ip+login", "ip", "account"]);
    expect(rules[0].limit).toBe(RATE_LIMIT.LOGIN_ATTEMPTS);
    expect(rules[0].windowMs).toBe(RATE_LIMIT.LOGIN_WINDOW_MS);
    // Redis kalitlari BullMQ bilan to'qnashmasligi uchun prefiksli.
    expect(rules.every((r) => r.key.startsWith("rl:"))).toBe(true);
  });
});

describe("Redis bilan bloklash", () => {
  it("5 ta xato urinishdan keyin bloklaydi (IP + login)", async () => {
    if (!redisUp) return;
    const rules = loginRateLimitRules(IP_A, LOGIN);

    for (let i = 0; i < RATE_LIMIT.LOGIN_ATTEMPTS; i++) {
      const gate = await checkLoginRateLimit(rules);
      expect(gate.allowed, `${i + 1}-urinish ruxsat etilishi kerak`).toBe(true);
      expect(gate.backend).toBe("redis");
      await recordLoginFailure(rules);
    }

    const blocked = await checkLoginRateLimit(rules);
    expect(blocked.allowed).toBe(false);
    expect(blocked.blockedScope).toBe("ip+login");
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(RATE_LIMIT.LOGIN_WINDOW_MS);
  });

  it("boshqa IP'dan o'sha login hali bloklanmagan (ip+login juftligi mustaqil)", async () => {
    if (!redisUp) return;
    const a = loginRateLimitRules(IP_A, LOGIN);
    for (let i = 0; i < RATE_LIMIT.LOGIN_ATTEMPTS; i++) await recordLoginFailure(a);
    expect((await checkLoginRateLimit(a)).allowed).toBe(false);

    const b = loginRateLimitRules(IP_B, LOGIN);
    expect((await checkLoginRateLimit(b)).allowed).toBe(true);
  });

  it("bitta hisobga ko'p IP'dan hujum account bucket'i bilan to'xtaydi", async () => {
    if (!redisUp) return;
    for (let i = 0; i < RATE_LIMIT.LOGIN_ACCOUNT_ATTEMPTS; i++) {
      await recordLoginFailure(loginRateLimitRules(`10.0.0.${i + 20}`, LOGIN));
    }
    const fresh = await checkLoginRateLimit(loginRateLimitRules("10.0.0.250", LOGIN));
    expect(fresh.allowed).toBe(false);
    expect(fresh.blockedScope).toBe("account");
  });

  it("muvaffaqiyatli login ip+login va account'ni tozalaydi, IP byudjetini EMAS", async () => {
    if (!redisUp) return;
    const rules = loginRateLimitRules(IP_A, LOGIN);
    for (let i = 0; i < RATE_LIMIT.LOGIN_ATTEMPTS; i++) await recordLoginFailure(rules);
    expect((await checkLoginRateLimit(rules)).allowed).toBe(false);

    await resetLoginRateLimit(rules);
    expect((await checkLoginRateLimit(rules)).allowed).toBe(true);

    // IP hisoblagichi saqlanib qolgan bo'lishi kerak — aks holda bitta haqiqiy
    // hisobga kirgan hujumchi o'z IP byudjetini cheksiz yangilay olardi.
    const ipKey = rules.find((r) => r.scope === "ip")!.key;
    expect(Number(await redis!.get(ipKey))).toBe(RATE_LIMIT.LOGIN_ATTEMPTS);
  });

  it("hisoblagich oyna tugagach o'zi yo'qoladi (TTL o'rnatilgan)", async () => {
    if (!redisUp) return;
    const rules = loginRateLimitRules(IP_A, LOGIN);
    await recordLoginFailure(rules);
    const ttl = await redis!.pttl(rules[0].key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(RATE_LIMIT.LOGIN_WINDOW_MS);
  });
});

describe("Redis yo'q bo'lganda zaxira yo'l", () => {
  it("in-memory qatlam ham parallel ravishda hisoblab boradi", async () => {
    // recordLoginFailure har doim in-memory store'ni ham yangilaydi, shuning
    // uchun Redis keyinroq o'chsa hisoblagich noldan boshlanmaydi.
    const rules = loginRateLimitRules("172.31.0.1", `${TAG}-mem@v.local`);
    for (let i = 0; i < RATE_LIMIT.LOGIN_ATTEMPTS; i++) await recordLoginFailure(rules);

    const { checkRateLimit } = await import("@/lib/rateLimit");
    const mem = checkRateLimit(rules[0].key, rules[0].limit, rules[0].windowMs);
    expect(mem.allowed).toBe(false);
  });
});
