import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
 */
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
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      auth: "ok",
      db: "ok",
      uptime: process.uptime(),
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch {
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
