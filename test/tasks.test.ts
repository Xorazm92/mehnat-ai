/**
 * TASK server actions + SLA breach sweep. Live Postgres + mocked auth.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "" } };
vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { createTask, getTasks, updateTaskStatus } = await import("@/server/tasks");
const { sweepTaskSla } = await import("@/lib/taskSla");

const TAG = `vitest-task-${Date.now()}`;
const ids = { userA: "", userB: "", userS: "", company: "", policy: "", task1: "", task2: "", task3: "" };
const actor = (id: string, role: string) => { SESSION.user.id = id; SESSION.user.role = role; };

beforeAll(async () => {
  const [a, b, s] = await Promise.all([
    prisma.user.create({ data: { email: `${TAG}-a@v.local`, fullName: "A", passwordHash: "x", role: "accountant" }, select: { id: true } }),
    prisma.user.create({ data: { email: `${TAG}-b@v.local`, fullName: "B", passwordHash: "x", role: "accountant" }, select: { id: true } }),
    prisma.user.create({ data: { email: `${TAG}-s@v.local`, fullName: "S", passwordHash: "x", role: "supervisor" }, select: { id: true } }),
  ]);
  ids.userA = a.id; ids.userB = b.id; ids.userS = s.id;
  const company = await prisma.company.create({ data: { name: `${TAG} MChJ`, inn: "0", taxRegime: "vat", accountantId: a.id }, select: { id: true } });
  ids.company = company.id;
  const p = await prisma.slaPolicy.create({ data: { name: `${TAG} pol`, taskType: `${TAG}-type`, responseMinutes: 60, resolutionMinutes: 480 }, select: { id: true } });
  ids.policy = p.id;
});

afterAll(async () => {
  await prisma.task.deleteMany({ where: { OR: [{ createdBy: { in: [ids.userA, ids.userB, ids.userS] } }, { slaPolicyId: ids.policy }] } });
  await prisma.slaPolicy.deleteMany({ where: { id: ids.policy } });
  await prisma.notification.deleteMany({ where: { userId: { in: [ids.userA, ids.userB, ids.userS] } } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: [ids.userA, ids.userB, ids.userS] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.userA, ids.userB, ids.userS] } } });
  await prisma.$disconnect();
});

describe("createTask", () => {
  // Vazifa YARATISH senior rol talab qiladi (server/tasks.ts). Topshiriluvchi
  // esa oddiy buxgalter bo'ladi — quyidagi egalik/scope testlari shunga tayanadi.
  it("creates a task and computes SLA due from the policy", async () => {
    actor(ids.userS, "supervisor");
    const t = await createTask({ companyId: ids.company, title: "Test vazifa", taskType: `${TAG}-type`, slaPolicyId: ids.policy, assigneeUserId: ids.userA });
    ids.task1 = t.id;
    const row = await prisma.task.findUnique({ where: { id: t.id }, select: { responseDueAt: true, resolutionDueAt: true, slaPolicyId: true } });
    expect(row!.slaPolicyId).toBe(ids.policy);
    expect(row!.responseDueAt).not.toBeNull();
    expect(row!.resolutionDueAt).not.toBeNull();

    const t2 = await createTask({ title: "Ikkinchi", assigneeUserId: ids.userA });
    ids.task2 = t2.id;
  });

  it("refuses a plain accountant", async () => {
    // Xodim o'ziga vazifa "yozib qo'yib", keyin uni yopib ketolmasligi kerak.
    actor(ids.userA, "accountant");
    await expect(createTask({ title: "Ruxsatsiz", assigneeUserId: ids.userA })).rejects.toThrow(
      /ruxsati yo'q/i,
    );
  });
});

describe("getTasks scoping", () => {
  it("assignee sees own task; unrelated accountant does not; supervisor sees all", async () => {
    actor(ids.userA, "accountant");
    expect((await getTasks()).some((t) => t.id === ids.task1)).toBe(true);

    actor(ids.userB, "accountant");
    expect((await getTasks()).some((t) => t.id === ids.task1)).toBe(false);

    actor(ids.userS, "supervisor");
    expect((await getTasks()).some((t) => t.id === ids.task1)).toBe(true);
  });
});

describe("updateTaskStatus", () => {
  it("owner: open → in_progress sets firstResponseAt", async () => {
    actor(ids.userA, "accountant");
    await updateTaskStatus(ids.task1, "in_progress");
    const row = await prisma.task.findUnique({ where: { id: ids.task1 }, select: { status: true, firstResponseAt: true, startedAt: true } });
    expect(row!.status).toBe("in_progress");
    expect(row!.firstResponseAt).not.toBeNull();
    expect(row!.startedAt).not.toBeNull();
  });
  it("illegal transition blocked (open → done)", async () => {
    actor(ids.userA, "accountant");
    await expect(updateTaskStatus(ids.task2, "done")).rejects.toThrow(/Noqonuniy/);
  });
  it("unrelated accountant cannot change status (IDOR)", async () => {
    actor(ids.userB, "accountant");
    await expect(updateTaskStatus(ids.task1, "done")).rejects.toThrow(/ruxsat/i);
  });
});

describe("sweepTaskSla", () => {
  it("records a response breach for an overdue unanswered task, dedups on repeat", async () => {
    const past = new Date(Date.now() - 3600_000);
    const t3 = await prisma.task.create({
      data: { title: `${TAG} overdue`, status: "open", assigneeUserId: ids.userA, createdBy: ids.userA, slaPolicyId: ids.policy, responseDueAt: past },
      select: { id: true },
    });
    ids.task3 = t3.id;

    const first = await sweepTaskSla(prisma, { now: new Date() });
    expect(first.responseBreaches).toBeGreaterThanOrEqual(1);
    const breach = await prisma.slaBreach.findFirst({ where: { taskId: t3.id, breachType: "response" } });
    expect(breach).toBeTruthy();

    const second = await sweepTaskSla(prisma, { now: new Date() });
    expect(second.deduped).toBeGreaterThanOrEqual(1);
    const count = await prisma.slaBreach.count({ where: { taskId: t3.id } });
    expect(count).toBe(1); // dublikat yo'q
  });
});
