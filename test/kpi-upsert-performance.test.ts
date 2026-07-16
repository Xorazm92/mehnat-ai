/**
 * Regression tests for the duplicate-MonthlyPerformance bug (ADR-0004).
 *
 * The checklist writes status='approved' on every counter click. The old write path
 * looked for a row to update with `status: { not: "approved" }`, so it could never
 * match its own writes and inserted every time — 14 cells became 187 rows and one
 * accountant's July penalty read -197% instead of -14%.
 *
 * Needs a live Postgres (DATABASE_URL). Fixtures are created and torn down per file.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "supervisor" as string } };

// upsertPerformance is a server action; auth() is the only thing standing between
// the test and the real Prisma write path.
vi.mock("@/lib/auth", () => ({ auth: async () => SESSION }));
vi.mock("server-only", () => ({}));

const { prisma } = await import("@/lib/prisma");
const { upsertPerformance } = await import("@/server/kpi");

const TAG = `vitest-${Date.now()}`;
const ids: { company: string; employee: string; rule: string; month: string } = {
  company: "",
  employee: "",
  rule: "",
  month: "2099-01-01",
};

beforeAll(async () => {
  const employee = await prisma.user.create({
    data: {
      email: `${TAG}@vitest.local`,
      fullName: `${TAG} employee`,
      passwordHash: "x",
      role: "supervisor",
    },
    select: { id: true },
  });
  const company = await prisma.company.create({
    data: { name: `${TAG} company`, inn: "000000000" },
    select: { id: true },
  });
  // A counter rule: this is the shape the checklist increments per click.
  const rule = await prisma.kpiRule.create({
    data: {
      name: `${TAG}_counter`,
      nameUz: "Vitest counter",
      role: "supervisor",
      rewardPercent: 0.6,
      penaltyPercent: 1.3,
      inputType: "counter",
      category: "attendance",
      inputTypeV2: "counter",
      scope: "global",
      options: [
        { key: "early_days", label_uz: "Erta", color: "green", coeff_per_unit: 0.1 },
        { key: "absent_days", label_uz: "Yo'q", color: "red", coeff_per_unit: -1.0 },
      ],
    },
    select: { id: true },
  });

  ids.employee = employee.id;
  ids.company = company.id;
  ids.rule = rule.id;
  SESSION.user.id = employee.id;
});

afterAll(async () => {
  await prisma.monthlyPerformance.deleteMany({ where: { companyId: ids.company } });
  await prisma.kpiRule.deleteMany({ where: { id: ids.rule } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.user.deleteMany({ where: { id: ids.employee } });
  await prisma.$disconnect();
});

const save = (overrides: Record<string, unknown> = {}) =>
  upsertPerformance({
    month: ids.month,
    companyId: ids.company,
    employeeId: ids.employee,
    ruleId: ids.rule,
    absentDays: 1,
    source: "supervisor",
    status: "approved",
    ...overrides,
  });

const countRows = () =>
  prisma.monthlyPerformance.count({
    where: {
      month: ids.month,
      companyId: ids.company,
      employeeId: ids.employee,
      ruleId: ids.rule,
    },
  });

describe("upsertPerformance — one row per (month, company, employee, rule)", () => {
  it("collapses repeated approved saves into a single row", async () => {
    for (let i = 0; i < 5; i++) await save({ absentDays: i + 1 });

    expect(await countRows()).toBe(1);
  });

  it("keeps the latest value after repeated saves", async () => {
    await save({ absentDays: 3 });
    await save({ absentDays: 7 });

    const row = await prisma.monthlyPerformance.findFirstOrThrow({
      where: { month: ids.month, companyId: ids.company, ruleId: ids.rule },
    });
    expect(row.absentDays).toBe(7);
    expect(await countRows()).toBe(1);
  });

  it("survives concurrent saves without duplicating", async () => {
    // The checklist fires a write per click ~250ms apart; a slow round-trip
    // overlaps them. Without a unique constraint both inserts win.
    await Promise.all([save({ absentDays: 1 }), save({ absentDays: 2 }), save({ absentDays: 3 })]);

    expect(await countRows()).toBe(1);
  });
});
