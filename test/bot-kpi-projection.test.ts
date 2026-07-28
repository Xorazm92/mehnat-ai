/**
 * Integration test for the ledger → payroll projection (Phase E write path).
 *
 * Verifies that response KpiEvents roll up into a `submitted` MonthlyPerformance
 * row with the correct color, and that an already-`approved` row is never
 * overwritten. Needs a live Postgres and the seeded `acc_group_response` rule.
 * The session is mocked (senior) exactly like kpi-upsert-performance.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "supervisor" as string } };
vi.mock("@/lib/auth", () => ({ auth: async () => SESSION }));
vi.mock("server-only", () => ({}));

const { prisma } = await import("@/lib/prisma");
const { projectResponseKpiToPerformance } = await import("@/server/botKpiProjection");

const TAG = `vitest-proj-${Date.now()}`;
// KpiEvent.periodMonth is the bare form; MonthlyPerformance.month carries the
// day suffix. The projection must bridge the two — writing the bare form there
// would dodge @@unique and let a second row double-charge the same penalty.
const MONTH = "2099-05";
const PERF_MONTH = "2099-05-01";
const ids = { company: "", accountant: "", senior: "", rule: "" };

beforeAll(async () => {
  const rule = await prisma.kpiRule.findUnique({ where: { name: "acc_group_response" }, select: { id: true } });
  if (!rule) throw new Error("Seeded rule acc_group_response missing — run the KPI seed first.");
  ids.rule = rule.id;

  const accountant = await prisma.user.create({
    data: { email: `${TAG}-acc@vitest.local`, fullName: `${TAG} Acc`, passwordHash: "x", role: "accountant" },
    select: { id: true },
  });
  const senior = await prisma.user.create({
    data: { email: `${TAG}-sup@vitest.local`, fullName: `${TAG} Sup`, passwordHash: "x", role: "supervisor" },
    select: { id: true },
  });
  const company = await prisma.company.create({
    data: { name: `${TAG} co`, inn: `95${Date.now() % 100000000}`, accountantId: accountant.id },
    select: { id: true },
  });
  ids.accountant = accountant.id;
  ids.senior = senior.id;
  ids.company = company.id;
  SESSION.user.id = senior.id;

  // 2 on-time (+1) and 3 late (−1) response events → systematic → red.
  const mk = (points: number, n: number) =>
    prisma.kpiEvent.create({
      data: {
        employeeId: accountant.id, companyId: company.id, periodMonth: MONTH,
        type: "response", points, sourceRef: `${TAG}-q${n}`,
        meta: { role: "accountant", outcome: points > 0 ? "on_time" : "late" },
      },
    });
  await Promise.all([mk(1, 1), mk(1, 2), mk(-1, 3), mk(-1, 4), mk(-1, 5)]);
});

afterAll(async () => {
  await prisma.monthlyPerformance.deleteMany({ where: { employeeId: ids.accountant } });
  await prisma.kpiEvent.deleteMany({ where: { employeeId: ids.accountant } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.accountant, ids.senior] } } });
  await prisma.$disconnect();
});

const perfRow = () =>
  prisma.monthlyPerformance.findUnique({
    where: {
      month_companyId_employeeId_ruleId: {
        month: PERF_MONTH, companyId: ids.company, employeeId: ids.accountant, ruleId: ids.rule,
      },
    },
  });

describe("projectResponseKpiToPerformance", () => {
  it("writes a submitted red row from 3 late responses", async () => {
    const res = await projectResponseKpiToPerformance(MONTH);
    expect(res.written).toBe(1);

    const row = await perfRow();
    expect(row).not.toBeNull();
    expect(row!.selectedOption).toBe("red");
    expect(row!.status).toBe("submitted");
    expect(row!.source).toBe("bot");
    expect(Number(row!.calculatedScore)).toBeLessThan(0); // penalty
  });

  it("never overwrites a supervisor-approved row", async () => {
    await prisma.monthlyPerformance.update({
      where: { id: (await perfRow())!.id },
      data: { status: "approved", selectedOption: "green" },
    });

    const res = await projectResponseKpiToPerformance(MONTH);
    expect(res.skippedApproved).toBe(1);
    expect(res.written).toBe(0);

    const row = await perfRow();
    expect(row!.status).toBe("approved");
    expect(row!.selectedOption).toBe("green"); // untouched
  });
});
