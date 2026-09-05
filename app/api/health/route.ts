import { NextResponse } from "next/server";
import { logServerError } from "@/lib/platform/logger";
import { prisma } from "@/lib/prisma";
import { getRedis, REDIS_URL } from "@/lib/redis";

// Never cache — a health probe must reflect live state.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness + readiness probe for load balancers / orchestrators (k8s, Docker
 * healthcheck, uptime monitors). Returns 200 when the process is up, the auth
 * env is configured AND the database is reachable; 503 otherwise so traffic is
 * drained from an unhealthy instance instead of erroring user requests.
 *
 * The auth-env check catches the classic Docker/Compose misconfig where the
 * container starts without AUTH_SECRET — the app boots but every login silently
 * fails. This is the Docker-path equivalent of `scripts/preflight.ts`.
 *
 * Redis is reported but deliberately does NOT drive the status code. A dead
 * Redis breaks the bot (BullMQ schedulers) and degrades the login rate limiter
 * to per-process counting, but the web app still serves every page correctly —
 * draining it from the load balancer would turn a background-job outage into a
 * user-facing one. Read the `redis` field to alert on it instead.
 */
/**
 * Ishga tushish imtiyozi — protsess ko'tarilgandan keyingi shu muddat ichida
 * hali ULANMAGAN Redis "o'lgan" deb sanalmaydi.
 *
 * NEGA. ioredis `enableOfflineQueue: false` bilan ishlaydi, ya'ni ulanish
 * tugamaguncha har `ping()` "Stream isn't writeable" bilan tashlaydi.
 * Prodda o'lchandi: `pm2 reload` dan keyin 44-soniyada `/api/health`
 * `"redis":"down","status":"degraded"` derdi, 62-soniyada esa `"ok"`.
 * Ya'ni HAR BIR deploy monitoringga yolg'on ogohlantirish yuborardi va
 * haqiqiy nosozlik shu shovqin ichida ko'rinmay qolardi.
 *
 * Imtiyoz FAQAT `connecting`/`reconnecting` holatiga tegishli: Redis
 * haqiqatan o'lgan bo'lsa ioredis abadiy `reconnecting` da qoladi, shuning
 * uchun muddat tugagach u baribir `down` bo'ladi — signal yo'qolmaydi.
 */
const REDIS_STARTUP_GRACE_S = 90;

/** ioredis hali ulanish jarayonidagi holatlar. */
const CONNECTING = new Set(["connecting", "connect", "reconnecting"]);

async function probeRedis(): Promise<{ redis: string; redisDetail?: string }> {
  if (!REDIS_URL) return { redis: "disabled" };

  const client = getRedis();
  if (!client) return { redis: "disabled" };

  try {
    // The shared client uses connectTimeout 1000 + enableOfflineQueue false, so
    // this cannot hang the probe: it either answers or throws promptly.
    await client.ping();
    return { redis: "ok" };
  } catch (e) {
    const detail = `${client.status}: ${(e as Error)?.message ?? e}`;
    if (CONNECTING.has(client.status) && process.uptime() < REDIS_STARTUP_GRACE_S) {
      return { redis: "starting", redisDetail: detail };
    }
    return { redis: "down", redisDetail: detail };
  }
}

export async function GET(): Promise<NextResponse> {
  const startedAt = Date.now();

  const authConfigured = Boolean(process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET);
  if (!authConfigured) {
    return NextResponse.json(
      {
        status: "degraded",
        auth: "unconfigured",
        detail: "AUTH_SECRET (or NEXTAUTH_SECRET) is not set — logins will fail.",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }

  try {
    const [, redisState] = await Promise.all([prisma.$queryRaw`SELECT 1`, probeRedis()]);
    return NextResponse.json({
      // `starting` ATAYLAB `ok` deb sanaladi — yuqoridagi izohga qarang.
      status: redisState.redis === "down" ? "degraded" : "ok",
      auth: "ok",
      db: "ok",
      ...redisState,
      uptime: process.uptime(),
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    // 503 = load balancer traffic'ni uzadi — bu HAR DOIM log'ga tushishi kerak.
    logServerError("api.health", e, { check: "db" });
    return NextResponse.json(
      {
        status: "degraded",
        db: "down",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
