/**
 * 1C INGEST — token auth, idempotent ingest, process + mapping, DLQ, sweep.
 * Live Postgres kerak.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const { prisma } = await import("@/lib/prisma");
const { hashToken, resolveConnectionByToken, ingestEvents, processIntegrationEvent, sweepPendingIntegrationEvents, MAX_ATTEMPTS } = await import("@/lib/oneCIngest");

const TAG = `vitest-1c-${Date.now()}`;
const TOKEN = `tok-${TAG}`;
const ids = { conn: "", company: "" };

const ev = (key: string, org: string, type = "report_status") => ({
  eventType: type,
  externalId: org,
  idempotencyKey: `${TAG}-${key}`,
  occurredAt: new Date().toISOString(),
  payload: { externalOrgId: org, note: key },
});

beforeAll(async () => {
  const conn = await prisma.oneCConnection.create({
    data: { name: `${TAG} agent`, tokenHash: hashToken(TOKEN) },
    select: { id: true },
  });
  ids.conn = conn.id;
  const company = await prisma.company.create({
    data: { name: `${TAG} MChJ`, inn: "000000000", taxRegime: "vat" },
    select: { id: true },
  });
  ids.company = company.id;
  await prisma.oneCCompanyMapping.create({ data: { connectionId: ids.conn, externalOrgId: "ORG1", companyId: ids.company } });
});

afterAll(async () => {
  await prisma.syncError.deleteMany({ where: { connectionId: ids.conn } });
  await prisma.oneCConnection.deleteMany({ where: { id: ids.conn } }); // cascades events/mappings/syncRuns
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.$disconnect();
});

describe("resolveConnectionByToken", () => {
  it("valid token → connection", async () => {
    expect(await resolveConnectionByToken(prisma, TOKEN)).toEqual({ id: ids.conn });
  });
  it("wrong / empty token → null", async () => {
    expect(await resolveConnectionByToken(prisma, "nope")).toBeNull();
    expect(await resolveConnectionByToken(prisma, "")).toBeNull();
  });
  it("inactive connection → null", async () => {
    await prisma.oneCConnection.update({ where: { id: ids.conn }, data: { active: false } });
    expect(await resolveConnectionByToken(prisma, TOKEN)).toBeNull();
    await prisma.oneCConnection.update({ where: { id: ids.conn }, data: { active: true } });
  });
});

describe("ingestEvents (idempotent)", () => {
  it("ingests new events and dedups repeats by idempotencyKey", async () => {
    const first = await ingestEvents(prisma, ids.conn, [ev("a", "ORG1"), ev("b", "UNKNOWN")]);
    expect(first.received).toBe(2);
    expect(first.duplicates).toBe(0);

    const again = await ingestEvents(prisma, ids.conn, [ev("a", "ORG1")]);
    expect(again.received).toBe(0);
    expect(again.duplicates).toBe(1);

    const count = await prisma.integrationEvent.count({ where: { idempotencyKey: `${TAG}-a` } });
    expect(count).toBe(1);
  });
});

describe("processIntegrationEvent", () => {
  it("mapped event → processed", async () => {
    const id = (await prisma.integrationEvent.findFirst({ where: { idempotencyKey: `${TAG}-a` }, select: { id: true } }))!.id;
    expect(await processIntegrationEvent(prisma, id)).toBe("processed");
    const row = await prisma.integrationEvent.findUnique({ where: { id }, select: { status: true } });
    expect(row!.status).toBe("processed");
  });

  it("unmapped event → failed, then DLQ (dead) after MAX_ATTEMPTS, with SyncError rows", async () => {
    const id = (await prisma.integrationEvent.findFirst({ where: { idempotencyKey: `${TAG}-b` }, select: { id: true } }))!.id;
    let last = "";
    for (let i = 0; i < MAX_ATTEMPTS; i++) last = await processIntegrationEvent(prisma, id);
    expect(last).toBe("dead");
    const row = await prisma.integrationEvent.findUnique({ where: { id }, select: { status: true, attempts: true } });
    expect(row!.status).toBe("dead");
    expect(row!.attempts).toBe(MAX_ATTEMPTS);
    const errs = await prisma.syncError.count({ where: { integrationEventId: id } });
    expect(errs).toBe(MAX_ATTEMPTS);

    // dead → keyingi process skip.
    expect(await processIntegrationEvent(prisma, id)).toBe("skip");
  });
});

describe("sweepPendingIntegrationEvents", () => {
  it("processes pending (mapped→processed, unmapped→failed, not yet dead)", async () => {
    await ingestEvents(prisma, ids.conn, [ev("c", "ORG1"), ev("d", "UNKNOWN")]);
    const res = await sweepPendingIntegrationEvents(prisma);
    expect(res.processed).toBeGreaterThanOrEqual(1);
    expect(res.failed).toBeGreaterThanOrEqual(1);

    const cRow = await prisma.integrationEvent.findFirst({ where: { idempotencyKey: `${TAG}-c` }, select: { status: true } });
    expect(cRow!.status).toBe("processed");
    const dRow = await prisma.integrationEvent.findFirst({ where: { idempotencyKey: `${TAG}-d` }, select: { status: true } });
    expect(dRow!.status).toBe("failed"); // 1 urinish — hali dead emas
  });
});
