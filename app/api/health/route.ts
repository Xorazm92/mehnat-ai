import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Never cache — a health probe must reflect live state.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness + readiness probe for load balancers / orchestrators (k8s, Docker
 * healthcheck, uptime monitors). Returns 200 when the process is up AND the
 * database is reachable; 503 when the DB round-trips fail so traffic is drained
 * from an unhealthy instance instead of erroring user requests.
 */
export async function GET(): Promise<NextResponse> {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
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
