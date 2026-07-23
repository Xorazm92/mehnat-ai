// =====================================================
// 1C INGEST — framework-free (Faza B / integration layer)
// =====================================================
// USULDAN MUSTAQIL ASRO-tomon: agent 1C'ni o'qib (OData/HTTP-service/export)
// ASRO'ga POST qiladi. Bu yer: token auth (hash), IDEMPOTENT ingest
// (idempotencyKey unique → dublikatsiz), process + DLQ (attempt >= MAX → dead),
// va domain-mapping SEAM (applyIntegrationEvent — discovery'dan keyin to'ldiriladi).
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient;

export const MAX_ATTEMPTS = 5;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
export function hashPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload ?? null)).digest("hex");
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** Token bo'yicha faol ulanishni topadi (hash orqali — plaintext saqlanmaydi). */
export async function resolveConnectionByToken(db: Db, token: string): Promise<{ id: string } | null> {
  if (!token) return null;
  const conn = await db.oneCConnection.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, active: true },
  });
  return conn && conn.active ? { id: conn.id } : null;
}

export interface IngestEventInput {
  eventType: string;
  externalId?: string;
  schemaVersion?: number;
  idempotencyKey: string;
  occurredAt: string; // ISO
  payload: unknown;
}
export interface IngestResult {
  received: number;
  duplicates: number;
  eventIds: string[];
}

/** Hodisalarni idempotent yozadi (idempotencyKey unique). Yangi id'larni qaytaradi. */
export async function ingestEvents(
  db: Db,
  connectionId: string,
  events: IngestEventInput[],
  syncRunId?: string | null,
): Promise<IngestResult> {
  const res: IngestResult = { received: 0, duplicates: 0, eventIds: [] };
  for (const e of events) {
    if (!e?.idempotencyKey || !e?.eventType || !e?.occurredAt) {
      throw new Error("event: idempotencyKey, eventType, occurredAt majburiy");
    }
    try {
      const created = await db.integrationEvent.create({
        data: {
          connectionId,
          syncRunId: syncRunId ?? null,
          eventType: e.eventType,
          externalId: e.externalId ?? null,
          schemaVersion: e.schemaVersion ?? 1,
          idempotencyKey: e.idempotencyKey,
          occurredAt: new Date(e.occurredAt),
          payload: (e.payload ?? {}) as Prisma.InputJsonValue,
          payloadHash: hashPayload(e.payload),
          status: "received",
        },
        select: { id: true },
      });
      res.received++;
      res.eventIds.push(created.id);
    } catch (err) {
      if (isUniqueViolation(err)) res.duplicates++;
      else throw err;
    }
  }
  return res;
}

type EventRow = {
  id: string;
  connectionId: string;
  syncRunId: string | null;
  eventType: string;
  externalId: string | null;
  payload: Prisma.JsonValue;
  attempts: number;
  status: string;
};

/**
 * Domain-mapping SEAM. Slice 1: firma mappingini yechadi (topilmasa → xato →
 * DLQ oqimi). Domain landing (report_status → Obligation, doc_count → metrika…)
 * discovery'dan keyin shu yerda to'ldiriladi. TODO Faza B Slice 2.
 */
export async function applyIntegrationEvent(db: Db, ev: EventRow): Promise<void> {
  const payload = ev.payload as { externalOrgId?: string } | null;
  const externalOrgId = payload?.externalOrgId ?? ev.externalId ?? undefined;
  if (!externalOrgId) throw new Error("externalOrgId aniqlanmadi (payload/externalId)");
  const mapping = await db.oneCCompanyMapping.findFirst({
    where: { connectionId: ev.connectionId, externalOrgId, active: true },
    select: { companyId: true },
  });
  if (!mapping) throw new Error(`Mapping topilmadi: ${externalOrgId}`);
  // TODO Slice 2: eventType bo'yicha ASRO domeniga landing.
}

/** Bitta hodisani qayta ishlaydi — DLQ bilan (attempt >= MAX → dead). */
export async function processIntegrationEvent(
  db: Db,
  eventId: string,
): Promise<"processed" | "failed" | "dead" | "skip"> {
  const ev = (await db.integrationEvent.findUnique({
    where: { id: eventId },
    select: { id: true, connectionId: true, syncRunId: true, eventType: true, externalId: true, payload: true, attempts: true, status: true },
  })) as EventRow | null;
  if (!ev || ev.status === "processed" || ev.status === "dead") return "skip";

  try {
    await applyIntegrationEvent(db, ev);
    await db.integrationEvent.update({ where: { id: eventId }, data: { status: "processed", lastError: null } });
    return "processed";
  } catch (err) {
    const attempts = ev.attempts + 1;
    const dead = attempts >= MAX_ATTEMPTS;
    const message = (err as Error).message;
    await db.integrationEvent.update({
      where: { id: eventId },
      data: { status: dead ? "dead" : "failed", attempts, lastError: message },
    });
    await db.syncError.create({
      data: { integrationEventId: eventId, syncRunId: ev.syncRunId, connectionId: ev.connectionId, message },
    });
    return dead ? "dead" : "failed";
  }
}

export interface SweepIngestResult {
  scanned: number;
  processed: number;
  failed: number;
  dead: number;
}

/** Kutilayotgan (received/failed, attempt<MAX) hodisalarni qayta ishlaydi. */
export async function sweepPendingIntegrationEvents(db: Db, limit = 500): Promise<SweepIngestResult> {
  const pending = await db.integrationEvent.findMany({
    where: { status: { in: ["received", "failed"] }, attempts: { lt: MAX_ATTEMPTS } },
    select: { id: true },
    orderBy: { receivedAt: "asc" },
    take: limit,
  });
  const res: SweepIngestResult = { scanned: pending.length, processed: 0, failed: 0, dead: 0 };
  for (const p of pending) {
    const r = await processIntegrationEvent(db, p.id);
    if (r === "processed") res.processed++;
    else if (r === "failed") res.failed++;
    else if (r === "dead") res.dead++;
  }
  return res;
}
