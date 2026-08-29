/**
 * Integration tests for the escalation ladder (Faza 2 / ADR-0007).
 *
 * Covers who gets told and when, the idempotency claim that stops a repeated
 * sweep re-notifying, and the verdict buttons a Supervisor presses. Needs a
 * live Postgres (DATABASE_URL); fixtures are TAG-isolated and torn down per file.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  resolveChain,
  escalate,
  sweepQuestionEscalations,
  escalationDedupKey,
  ESCALATION_CHANNEL,
  ESCALATION_PENALTY_PERCENT,
  QUESTION_L2_AFTER_MINUTES,
  type EscalationRecipient,
  type EscalationSubject,
} from "@/lib/engines/automation/escalation";
import {
  handleQuestionVerdict,
  handleObligationExcuse,
  handleObligationTake,
} from "@/bot/contexts/escalation/application/alert-actions";

const TAG = `vitest-esc-${Date.now()}`;
const CHAT_ID = BigInt(-1009200000000 - (Date.now() % 100000));
const MINUTE = 60_000;

const ids = {
  company: "",
  accountant: "",
  supervisor: "",
  chief: "",
  outsider: "",
  question: "",
};
const companyInn = `99${Date.now() % 100000000}`;

/** Records what the injected sender was asked to deliver. */
const delivered: Array<{ level: number; userId: string }> = [];
const spySender = async (r: EscalationRecipient) => {
  delivered.push({ level: r.level, userId: r.userId });
  return true;
};

async function makeUser(slug: string, role: string, telegramUserId?: bigint) {
  return prisma.user.create({
    data: {
      email: `${TAG}-${slug}@vitest.local`,
      fullName: `${TAG} ${slug}`,
      passwordHash: "x",
      role: role as never,
      telegramUserId: telegramUserId ?? null,
    },
    select: { id: true },
  });
}

/** A question already past its deadline by `minutesLate`. */
async function makeLateQuestion(minutesLate: number, now = new Date()) {
  const q = await prisma.question.create({
    data: {
      chatId: CHAT_ID,
      companyId: ids.company,
      messageId: BigInt(Date.now() % 1_000_000),
      responsibleRole: "accountant",
      status: "late",
      deadlineAt: new Date(now.getTime() - minutesLate * MINUTE),
      createdAt: new Date(now.getTime() - (minutesLate + 10) * MINUTE),
    },
    select: { id: true },
  });
  return q.id;
}

beforeAll(async () => {
  const accountant = await makeUser("acc", "accountant", BigInt(992_000_000_001));
  const supervisor = await makeUser("sup", "supervisor", BigInt(992_000_000_002));
  const chief = await makeUser("chief", "chief_accountant", BigInt(992_000_000_003));
  const outsider = await makeUser("out", "accountant", BigInt(992_000_000_004));

  const company = await prisma.company.create({
    data: {
      name: `${TAG} company`,
      inn: companyInn,
      isActive: true,
      accountantId: accountant.id,
      supervisorId: supervisor.id,
      chiefAccountantId: chief.id,
    },
    select: { id: true },
  });

  ids.company = company.id;
  ids.accountant = accountant.id;
  ids.supervisor = supervisor.id;
  ids.chief = chief.id;
  ids.outsider = outsider.id;
});

afterAll(async () => {
  const userIds = [ids.accountant, ids.supervisor, ids.chief, ids.outsider];
  await prisma.notificationDelivery.deleteMany({ where: { recipientId: { in: userIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.kpiEvent.deleteMany({ where: { employeeId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.question.deleteMany({ where: { chatId: CHAT_ID } });
  await prisma.obligationAssignmentEvent.deleteMany({ where: { byUserId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.$disconnect();
});

describe("resolveChain", () => {
  it("maps the three rungs to the company's assignments", async () => {
    const chain = await resolveChain(prisma, ids.company, ids.accountant);
    expect(chain).toEqual({ L0: ids.accountant, L1: ids.supervisor, L2: ids.chief });
  });

  it("falls back to the company accountant when no one is snapshotted", async () => {
    const chain = await resolveChain(prisma, ids.company, null);
    expect(chain.L0).toBe(ids.accountant);
  });

  it("never tells the same person twice", async () => {
    // The supervisor is also the responsible person here — L1 must come out
    // empty rather than sending them a duplicate alert.
    const chain = await resolveChain(prisma, ids.company, ids.supervisor);
    expect(chain.L0).toBe(ids.supervisor);
    expect(chain.L1).toBeNull();
    expect(chain.L2).toBe(ids.chief);
  });
});

describe("escalate", () => {
  const subject = (entityId: string): EscalationSubject => ({
    kind: "question",
    entityId,
    companyId: ids.company,
    companyName: `${TAG} company`,
    responsibleUserId: ids.accountant,
    responsibleName: `${TAG} acc`,
    detail: "test",
  });

  it("claims a rung once and writes both channels", async () => {
    const entityId = `esc-once-${Date.now()}`;
    const first = await escalate(prisma, subject(entityId), 1, { sendEscalation: spySender });
    expect(first.claimed).toBe(true);
    expect(first.recipient?.userId).toBe(ids.supervisor);
    expect(first.telegramDelivered).toBe(true);

    // In-app is the channel of record and is always written.
    const note = await prisma.notification.findFirst({
      where: { userId: ids.supervisor, type: "escalation_question" },
      orderBy: { createdAt: "desc" },
    });
    expect(note).not.toBeNull();

    const second = await escalate(prisma, subject(entityId), 1, { sendEscalation: spySender });
    expect(second.claimed).toBe(false);
    expect(second.skipped).toBe("already");
  });

  it("records a failed delivery rather than throwing when the bot cannot write", async () => {
    const entityId = `esc-403-${Date.now()}`;
    const res = await escalate(prisma, subject(entityId), 1, {
      sendEscalation: async () => false, // 403: never pressed Start
    });
    expect(res.claimed).toBe(true);
    expect(res.telegramDelivered).toBe(false);

    const row = await prisma.notificationDelivery.findUnique({
      where: {
        channel_dedupKey: {
          channel: ESCALATION_CHANNEL,
          dedupKey: escalationDedupKey("question", entityId, 1),
        },
      },
    });
    expect(row!.status).toBe("failed");
  });

  it("skips a rung with nobody assigned", async () => {
    const bare = await prisma.company.create({
      data: { name: `${TAG} bare`, inn: `${companyInn}1`, isActive: true },
      select: { id: true },
    });
    const res = await escalate(
      prisma,
      { ...subject(`esc-bare-${Date.now()}`), companyId: bare.id, responsibleUserId: null },
      1,
      { sendEscalation: spySender },
    );
    expect(res.claimed).toBe(false);
    expect(res.skipped).toBe("no_recipient");
    await prisma.company.deleteMany({ where: { id: bare.id } });
  });
});

describe("sweepQuestionEscalations", () => {
  it("tells the supervisor immediately and the chief only after the delay", async () => {
    const now = new Date();
    const fresh = await makeLateQuestion(2, now);

    delivered.length = 0;
    const first = await sweepQuestionEscalations(prisma, { sendEscalation: spySender, now });
    expect(first.l1).toBeGreaterThanOrEqual(1);
    expect(delivered.some((d) => d.level === 1 && d.userId === ids.supervisor)).toBe(true);
    expect(delivered.some((d) => d.level === 2)).toBe(false);

    // Same question, now past the L2 threshold.
    delivered.length = 0;
    const later = new Date(now.getTime() + (QUESTION_L2_AFTER_MINUTES + 1) * MINUTE);
    const second = await sweepQuestionEscalations(prisma, { sendEscalation: spySender, now: later });
    expect(second.l2).toBeGreaterThanOrEqual(1);
    expect(delivered.some((d) => d.level === 2 && d.userId === ids.chief)).toBe(true);
    // L1 was already claimed on the first pass — no repeat.
    expect(second.l1).toBe(0);

    ids.question = fresh;
  });

  it("ignores a question that has been answered", async () => {
    const now = new Date();
    const answered = await makeLateQuestion(5, now);
    await prisma.question.update({
      where: { id: answered },
      data: { status: "answered", answeredAt: now },
    });

    const res = await sweepQuestionEscalations(prisma, { now });
    const claim = await prisma.notificationDelivery.findUnique({
      where: {
        channel_dedupKey: {
          channel: ESCALATION_CHANNEL,
          dedupKey: escalationDedupKey("question", answered, 1),
        },
      },
    });
    expect(claim).toBeNull();
    expect(res.scanned).toBeGreaterThanOrEqual(0);
  });
});

describe("verdict buttons", () => {
  const supervisorActor = () => ({ id: ids.supervisor, role: "supervisor" });

  it("denies a verdict to someone outside the company", async () => {
    const q = await makeLateQuestion(20);
    const outcome = await handleQuestionVerdict(prisma, q, "penalty", {
      id: ids.outsider,
      role: "accountant",
    });
    expect(outcome.answer).toMatch(/⛔/);

    const events = await prisma.kpiEvent.findMany({ where: { sourceRef: q, type: "manual" } });
    expect(events).toHaveLength(0);
  });

  it("writes the penalty to the ledger and asks the chief to confirm", async () => {
    const q = await makeLateQuestion(25);
    const outcome = await handleQuestionVerdict(prisma, q, "penalty", supervisorActor());
    expect(outcome.answer).toContain(String(ESCALATION_PENALTY_PERCENT));

    const events = await prisma.kpiEvent.findMany({ where: { sourceRef: q, type: "manual" } });
    expect(events).toHaveLength(1);
    expect(Number(events[0].points)).toBe(-ESCALATION_PENALTY_PERCENT);
    expect(events[0].employeeId).toBe(ids.accountant);

    // ADR-0001: the ledger is evidence; payroll is untouched until the chief
    // approves a MonthlyPerformance row in the ERP.
    const perf = await prisma.monthlyPerformance.findMany({
      where: { employeeId: ids.accountant, companyId: ids.company },
    });
    expect(perf).toHaveLength(0);

    const ask = await prisma.notification.findFirst({
      where: { userId: ids.chief, type: "kpi_penalty_proposed" },
      orderBy: { createdAt: "desc" },
    });
    expect(ask).not.toBeNull();
  });

  it("settles a question once — a second verdict changes nothing", async () => {
    const q = await makeLateQuestion(30);
    const first = await handleQuestionVerdict(prisma, q, "penalty", supervisorActor());
    expect(first.answer).toContain(String(ESCALATION_PENALTY_PERCENT));

    const second = await handleQuestionVerdict(prisma, q, "excuse", supervisorActor());
    expect(second.answer).toMatch(/allaqachon/i);

    const events = await prisma.kpiEvent.findMany({ where: { sourceRef: q, type: "manual" } });
    expect(events).toHaveLength(1);
  });

  it("warns without touching KPI", async () => {
    const q = await makeLateQuestion(35);
    const outcome = await handleQuestionVerdict(prisma, q, "warn", supervisorActor());
    expect(outcome.answer).toContain("Ogohlantirish");

    const events = await prisma.kpiEvent.findMany({ where: { sourceRef: q, type: "manual" } });
    expect(events).toHaveLength(0);
    // The staffer is told, in their private chat.
    expect(outcome.send?.[0]?.chatId).toBe(BigInt(992_000_000_001));
  });

  it("reports an unknown question instead of acting", async () => {
    const outcome = await handleQuestionVerdict(
      prisma,
      "00000000-0000-4000-8000-000000000000",
      "penalty",
      supervisorActor(),
    );
    expect(outcome.answer).toMatch(/eskirgan/i);
  });
});

describe("obligation verdict buttons", () => {
  /** Obligations need a template; reuse whichever the seed provides. */
  async function makeObligation() {
    const template = await prisma.deadlineTemplate.findFirst({ select: { id: true, version: true } });
    if (!template) return null;
    const stamp = Date.now();
    return prisma.obligation.create({
      data: {
        companyId: ids.company,
        templateId: template.id,
        templateVersion: template.version,
        periodStart: new Date(stamp - 30 * 24 * 3600_000),
        periodEnd: new Date(stamp),
        periodKey: `2026-M07`,
        dueAt: new Date(stamp - 24 * 3600_000),
        status: "planned",
        responsibleUserId: ids.accountant,
      },
      select: { id: true },
    });
  }

  it("excuses a delay in one press and is idempotent", async () => {
    const ob = await makeObligation();
    if (!ob) return; // no templates seeded in this database

    const first = await handleObligationExcuse(prisma, ob.id, {
      id: ids.supervisor,
      role: "supervisor",
    });
    expect(first.answer).toContain("Sababli");

    const row = await prisma.obligation.findUnique({ where: { id: ob.id } });
    // Two-stage excuse completed by one senior press (ADR-0007).
    expect(row!.delayMarkedById).toBe(ids.supervisor);
    expect(row!.delayApprovedById).toBe(ids.supervisor);
    expect(row!.delayReason).toBe("management_decision");

    const second = await handleObligationExcuse(prisma, ob.id, {
      id: ids.supervisor,
      role: "supervisor",
    });
    expect(second.answer).toMatch(/allaqachon/i);

    await prisma.obligation.deleteMany({ where: { id: ob.id } });
  });

  it("reassigns to whoever pressed, and refuses a non-senior", async () => {
    const ob = await makeObligation();
    if (!ob) return;

    const denied = await handleObligationTake(prisma, ob.id, {
      id: ids.outsider,
      role: "accountant",
    });
    expect(denied.answer).toMatch(/⛔/);

    const taken = await handleObligationTake(prisma, ob.id, {
      id: ids.supervisor,
      role: "supervisor",
    });
    expect(taken.answer).toContain("✅");

    const row = await prisma.obligation.findUnique({ where: { id: ob.id } });
    expect(row!.responsibleUserId).toBe(ids.supervisor);

    await prisma.obligationAssignmentEvent.deleteMany({ where: { obligationId: ob.id } });
    await prisma.obligation.deleteMany({ where: { id: ob.id } });
  });
});
