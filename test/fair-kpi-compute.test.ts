/**
 * FAIR KPI compute — signal gathering, delay-reason exclusion, complexity volume.
 * Live Postgres + mocked auth (senior).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "supervisor" } };
vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { computeFairKpiForPeriod, getFairKpiScores } = await import("@/server/fairKpi");

const TAG = `vitest-fkpi-${Date.now()}`;
const PERIOD = "2097-07";
const ids = { userA: "", company: "", template: "" };
const dueAt = new Date(Date.UTC(2097, 6, 15));

beforeAll(async () => {
  const a = await prisma.user.create({ data: { email: `${TAG}@v.local`, fullName: "A", passwordHash: "x", role: "accountant" }, select: { id: true } });
  ids.userA = a.id;
  SESSION.user.id = a.id; // actor senior (role overridden below per call)
  const company = await prisma.company.create({ data: { name: `${TAG} MChJ`, inn: "0", taxRegime: "vat", complexity: "complex" }, select: { id: true } });
  ids.company = company.id;
  const t = await prisma.deadlineTemplate.create({ data: { code: `${TAG}-T`, name: "T", obligationType: "x", periodicity: "monthly", anchorType: "fixed_day_of_month", dueDay: 15, effectiveFrom: new Date(Date.UTC(2097, 0, 1)), lifecycle: "active" }, select: { id: true } });
  ids.template = t.id;

  const base = { companyId: ids.company, templateId: ids.template, templateVersion: 1, periodEnd: new Date(Date.UTC(2097, 7, 1)), periodKey: "2097-M07", dueAt, responsibleUserId: ids.userA };
  // obl1: accepted on time; obl2: accepted late; obl3: rejected but EXCUSED (client_delay approved)
  await prisma.obligation.create({ data: { ...base, periodStart: new Date(Date.UTC(2097, 6, 1)), status: "accepted", acceptedAt: new Date(Date.UTC(2097, 6, 14)) } });
  await prisma.obligation.create({ data: { ...base, periodStart: new Date(Date.UTC(2097, 6, 2)), status: "accepted", acceptedAt: new Date(Date.UTC(2097, 6, 16)) } });
  await prisma.obligation.create({ data: { ...base, periodStart: new Date(Date.UTC(2097, 6, 3)), status: "rejected", delayApprovedById: ids.userA, delayReason: "client_delay" } });

  // Attendance: 8 present, 2 late
  for (let i = 0; i < 8; i++) await prisma.attendance.create({ data: { userId: ids.userA, date: new Date(Date.UTC(2097, 6, i + 1)), status: "present" } });
  for (let i = 0; i < 2; i++) await prisma.attendance.create({ data: { userId: ids.userA, date: new Date(Date.UTC(2097, 6, i + 20)), status: "late" } });
});

afterAll(async () => {
  await prisma.fairKpiScore.deleteMany({ where: { period: PERIOD } });
  await prisma.obligation.deleteMany({ where: { templateId: ids.template } });
  await prisma.deadlineTemplate.deleteMany({ where: { id: ids.template } });
  await prisma.attendance.deleteMany({ where: { userId: ids.userA } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.auditLog.deleteMany({ where: { userId: ids.userA } });
  await prisma.user.deleteMany({ where: { id: ids.userA } });
  await prisma.$disconnect();
});

describe("computeFairKpiForPeriod", () => {
  it("computes components with delay-exclusion + complexity volume", async () => {
    SESSION.user.role = "supervisor";
    await computeFairKpiForPeriod(PERIOD);
    const scores = await getFairKpiScores(PERIOD);
    const mine = scores.find((s) => s.employeeId === ids.userA)!;
    expect(mine).toBeTruthy();

    // SLA: eligible = obl1,obl2 (obl3 excused) = 2; onTime = obl1 = 1 → 50
    expect(Number(mine.sla)).toBe(50);
    // Quality: defects 0 (obl3 excused), total 2 → 100
    expect(Number(mine.quality)).toBe(100);
    // Volume: 3 obligations × complex(2.5) = 7.5 → 7.5/20 = 37.5
    expect(Number(mine.volume)).toBe(37.5);
    expect(Number(mine.volumePoints)).toBe(7.5);
    // Discipline: (8 + 0.5×2)/10 = 90
    expect(Number(mine.discipline)).toBe(90);
    // Client neutral 100
    expect(Number(mine.client)).toBe(100);
    // Composite = 50*.35 + 100*.25 + 100*.15 + 37.5*.15 + 90*.10 = 72.13
    expect(Number(mine.composite)).toBeCloseTo(72.13, 1);
    expect(mine.shadowMode).toBe(true);
  });

  it("re-run upserts (no duplicate)", async () => {
    SESSION.user.role = "supervisor";
    await computeFairKpiForPeriod(PERIOD);
    const count = await prisma.fairKpiScore.count({ where: { period: PERIOD, employeeId: ids.userA } });
    expect(count).toBe(1);
  });

  it("rejects non-senior", async () => {
    SESSION.user.role = "accountant";
    await expect(computeFairKpiForPeriod(PERIOD)).rejects.toThrow(/Forbidden/);
    SESSION.user.role = "supervisor";
  });
});
