import { NextResponse, type NextRequest } from "next/server";
import { logServerError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { resolveConnectionByToken, ingestEvents, type IngestEventInput } from "@/lib/oneCIngest";

// Node runtime (crypto + prisma), har doim dinamik.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 1C sync-agent ingest endpoint (1C→ASRO). Agent ichki tarmoqda 1C'ni o'qiydi
 * va bu yerga POST qiladi (outbound — 1C internetga ochilmaydi). Token
 * `X-ASRO-Agent-Token` sarlavhasida; noto'g'ri/yo'q → 401 (fail closed).
 * Idempotent: idempotencyKey takrorlansa dublikat yaratilmaydi. Qayta ishlash
 * alohida sweep worker'da (bu yer faqat qabul qiladi).
 */
export async function POST(req: NextRequest): Promise<Response> {
  const token = req.headers.get("x-asro-agent-token") ?? "";
  const conn = await resolveConnectionByToken(prisma, token);
  if (!conn) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const b = body as { events?: unknown; cursor?: string };
  if (!Array.isArray(b?.events)) return NextResponse.json({ error: "events[] required" }, { status: 400 });
  if (b.events.length > 1000) return NextResponse.json({ error: "batch too large (max 1000)" }, { status: 413 });

  const run = await prisma.syncRun.create({
    data: { connectionId: conn.id, status: "running", cursor: b.cursor ?? null },
    select: { id: true },
  });
  try {
    const result = await ingestEvents(prisma, conn.id, b.events as IngestEventInput[], run.id);
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "completed", finishedAt: new Date(), eventsReceived: result.received },
    });
    await prisma.oneCConnection.update({ where: { id: conn.id }, data: { lastSeenAt: new Date() } });
    return NextResponse.json({ received: result.received, duplicates: result.duplicates, syncRunId: run.id });
  } catch (e) {
    await prisma.syncRun.update({ where: { id: run.id }, data: { status: "failed", finishedAt: new Date() } });
    logServerError("api.integration.1c", e, { connectionId: conn.id, syncRunId: run.id, events: b.events.length });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
