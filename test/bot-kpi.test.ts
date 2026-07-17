/**
 * Integration tests for the KPI ledger (Phase E). Exercises the real Prisma
 * write path: appending signed KpiEvents, attributing question outcomes to the
 * company's responsible employee (idempotently), and manual adjustments with an
 * audit trail. Needs a live Postgres; fixtures are TAG-isolated.
 *
 * The ledger is additive — these tests never touch the live payroll
 * MonthlyPerformance.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { appendKpiEvent } from "@/bot/contexts/kpi/application/append-kpi-event";
import { recordQuestionKpi } from "@/bot/contexts/kpi/application/record-question-kpi";
import { recordManualKpi } from "@/bot/contexts/kpi/application/manual-adjustment";

const TAG = `vitest-kpi-${Date.now()}`;
const CHAT = BigInt(-1009700000000 - (Date.now() % 100000));
const ids = { company: "", accountant: "", admin: "", question: "", orphanQuestion: "" };

beforeAll(async () => {
  const accountant = await prisma.user.create({
    data: { email: `${TAG}-acc@vitest.local`, fullName: `${TAG} Accountant`, passwordHash: "x", role: "accountant" },
    select: { id: true },
  });
  const admin = await prisma.user.create({
    data: { email: `${TAG}-admin@vitest.local`, fullName: `${TAG} Admin`, passwordHash: "x", role: "admin" },
    select: { id: true },
  });
  const company = await prisma.company.create({
    data: { name: `${TAG} co`, inn: `99${Date.now() % 100000000}`, accountantId: accountant.id },
    select: { id: true },
  });
  const question = await prisma.question.create({
    data: {
      chatId: CHAT, companyId: company.id, messageId: BigInt(1),
      responsibleRole: "accountant", status: "answered",
      deadlineAt: new Date(), createdAt: new Date(),
    },
    select: { id: true },
  });
  // A question whose chat is NOT bound to a company → no attribution.
  const orphan = await prisma.question.create({
    data: {
      chatId: CHAT, companyId: null, messageId: BigInt(2),
      responsibleRole: "accountant", status: "late",
      deadlineAt: new Date(), createdAt: new Date(),
    },
    select: { id: true },
  });

  ids.accountant = accountant.id;
  ids.admin = admin.id;
  ids.company = company.id;
  ids.question = question.id;
  ids.orphanQuestion = orphan.id;
});

afterAll(async () => {
  const evs = await prisma.kpiEvent.findMany({
    where: { employeeId: { in: [ids.accountant, ids.admin] } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: { tableName: "KpiEvent", recordId: { in: evs.map((e) => e.id) } },
  });
  await prisma.kpiEvent.deleteMany({ where: { employeeId: { in: [ids.accountant, ids.admin] } } });
  await prisma.question.deleteMany({ where: { chatId: CHAT } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.accountant, ids.admin] } } });
  await prisma.$disconnect();
});

describe("appendKpiEvent", () => {
  it("is idempotent per (employee, sourceRef, type)", async () => {
    const base = { employeeId: ids.accountant, periodMonth: "2099-01", type: "report" as const, points: 1, sourceRef: `${TAG}-src` };
    const first = await appendKpiEvent(prisma, base);
    const second = await appendKpiEvent(prisma, base);
    expect(first.appended).toBe(true);
    expect(second.appended).toBe(false);
    expect(await prisma.kpiEvent.count({ where: { employeeId: ids.accountant, sourceRef: `${TAG}-src` } })).toBe(1);
  });
});

describe("recordQuestionKpi", () => {
  it("attributes an on-time answer to the company's accountant (+1), idempotently", async () => {
    const r1 = await recordQuestionKpi(prisma, ids.question, "on_time");
    const r2 = await recordQuestionKpi(prisma, ids.question, "on_time");
    expect(r1.appended).toBe(true);
    expect(r2.appended).toBe(false);

    const ev = await prisma.kpiEvent.findFirstOrThrow({ where: { sourceRef: ids.question, type: "response" } });
    expect(ev.employeeId).toBe(ids.accountant);
    expect(Number(ev.points)).toBe(1);
  });

  it("skips when the chat is unbound (no responsible employee)", async () => {
    const r = await recordQuestionKpi(prisma, ids.orphanQuestion, "late");
    expect(r.appended).toBe(false);
    expect(await prisma.kpiEvent.count({ where: { sourceRef: ids.orphanQuestion } })).toBe(0);
  });
});

describe("recordManualKpi", () => {
  it("records a penalty as a negative event with an audit entry", async () => {
    const res = await recordManualKpi(prisma, "penalty", {
      employeeId: ids.accountant, percent: 2.5, reason: "Kechikish", byUserId: ids.admin,
    });
    expect(res.points).toBe(-2.5);

    const ev = await prisma.kpiEvent.findUniqueOrThrow({ where: { id: res.id } });
    expect(ev.type).toBe("manual");
    expect(Number(ev.points)).toBe(-2.5);
    expect(await prisma.auditLog.count({ where: { tableName: "KpiEvent", recordId: res.id } })).toBe(1);
  });
});
