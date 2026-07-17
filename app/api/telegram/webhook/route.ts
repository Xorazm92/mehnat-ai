import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { config } from "@/bot/config";
import { enqueueTelegramUpdate } from "@/bot/queues/message.queue";
import type { RawTelegramUpdate } from "@/bot/contexts/monitoring/domain/inbound-message";

// BullMQ/ioredis need the Node runtime; the route also must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Telegram webhook ingress. Deliberately thin: authenticate the secret, enqueue
 * the raw update, return 200 fast. No business logic — all work happens in the
 * bot worker process. On enqueue failure we return 500 so Telegram retries
 * (at-least-once); the worker's ProcessedUpdate dedup absorbs the duplicate.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = config.telegram.webhookSecret;
  if (!secret) {
    // Fail closed: never run an unauthenticated ingress.
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }

  const provided = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!safeEqual(provided, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let update: RawTelegramUpdate;
  try {
    update = (await req.json()) as RawTelegramUpdate;
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  try {
    await enqueueTelegramUpdate(update);
  } catch (e) {
    console.error("[webhook] enqueue failed:", e);
    return NextResponse.json({ error: "enqueue failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
