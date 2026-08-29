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
    // `status` distinguishes "still connecting right after boot" from "down".
    return { redis: "down", redisDetail: `${client.status}: ${(e as Error)?.message ?? e}` };
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
