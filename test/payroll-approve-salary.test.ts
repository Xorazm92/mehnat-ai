/**
 * Regression tests for the payroll write path.
 *
 * approveEmployeeSalary used to accept baseSalary/kpiBonus/kpiPenalty/totalSalary
 * from the caller and write totalSalary verbatim — the salary was decided by a React
 * component in the Supervisor's browser. It now takes only (employeeId, month) and
 * computes the amount from approved Monthly Performance.
 *
 * Needs a live Postgres (DATABASE_URL). Fixtures are created and torn down per file.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const SESSION = { user: { id: "", role: "super_admin" as string } };

vi.mock("@/lib/auth", () => ({ auth: async () => SESSION }));
vi.mock("server-only", () => ({}));

const { prisma } = await import("@/lib/prisma");
const { approveEmployeeSalary, getPayrollAdjustments } = await import("@/server/payroll");

const TAG = `vitest-pay-${Date.now()}`;
const MONTH = "2099-03-01";
const ids = { employee: "", company: "", rule: "" };

async function setScore(calculatedScore: number) {
  await prisma.monthlyPerformance.deleteMany({ where: { companyId: ids.company } });
  await prisma.monthlyPerformance.create({
    data: {
      month: MONTH,
      companyId: ids.company,
      employeeId: ids.employee,
      ruleId: ids.rule,
      value: calculatedScore > 0 ? 1 : -1,
      calculatedScore,
      status: "approved",
      source: "supervisor",
    },
  });
}

beforeAll(async () => {
  const employee = await prisma.user.create({
    data: {
      email: `${TAG}@vitest.local`,
      fullName: `${TAG} accountant`,
      passwordHash: "x",
      role: "accountant",
    },
    select: { id: true },
  });
  ids.employee = employee.id;
  SESSION.user.id = employee.id;

  // contract 10,000,000 × accountantPerc 20% → base 2,000,000
  const company = await prisma.company.create({
    data: {
      name: `${TAG} company`,
      inn: "000000000",
      contractAmount: 10_000_000,
      accountantId: employee.id,
      accountantPerc: 20,
    },
    select: { id: true },
  });
  ids.company = company.id;

  const rule = await prisma.kpiRule.create({
    data: {
      name: `${TAG}_rule`,
      nameUz: "Vitest",
      role: "accountant",
      rewardPercent: 0.6,
      penaltyPercent: 1.3,
      inputType: "counter",
      category: "attendance",
      inputTypeV2: "counter",
      scope: "global",
    },
    select: { id: true },
  });
  ids.rule = rule.id;
});

beforeEach(async () => {
  await prisma.payrollAdjustment.deleteMany({ where: { employeeId: ids.employee } });
});

afterAll(async () => {
  await prisma.payrollAdjustment.deleteMany({ where: { employeeId: ids.employee } });
  await prisma.monthlyPerformance.deleteMany({ where: { companyId: ids.company } });
  await prisma.kpiRule.deleteMany({ where: { id: ids.rule } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.user.deleteMany({ where: { id: ids.employee } });
  await prisma.$disconnect();
});

describe("approveEmployeeSalary", () => {
  it("writes the amount it computed itself", async () => {
    await setScore(0.6); // +0.6% of 10,000,000 = 60,000 on a 2,000,000 base

    const adjustment = await approveEmployeeSalary({
      employeeId: ids.employee,
      month: MONTH,
    });

    expect(Number(adjustment.amount)).toBe(2_060_000);
  });

  it("refuses to pay zero when penalties exceed base pay", async () => {
    await setScore(-25); // -2,500,000 against a 2,000,000 base → raw -500,000

    await expect(
      approveEmployeeSalary({ employeeId: ids.employee, month: MONTH })
    ).rejects.toThrow(/jarimalar asosiy oylikdan oshib ketdi/);

    // and nothing was written
    const written = await prisma.payrollAdjustment.count({
      where: { employeeId: ids.employee, month: MONTH },
    });
    expect(written).toBe(0);
  });

  it("pays a heavy but survivable penalty rather than refusing", async () => {
    await setScore(-14); // the real Abdugani case after dedupe

    const adjustment = await approveEmployeeSalary({
      employeeId: ids.employee,
      month: MONTH,
    });

    expect(Number(adjustment.amount)).toBe(600_000);
  });

  it("ignores an unapproved row", async () => {
    await prisma.monthlyPerformance.deleteMany({ where: { companyId: ids.company } });
    await prisma.monthlyPerformance.create({
      data: {
        month: MONTH,
        companyId: ids.company,
        employeeId: ids.employee,
        ruleId: ids.rule,
        value: 1,
        calculatedScore: 4,
        status: "submitted",
        source: "employee",
      },
    });

    const adjustment = await approveEmployeeSalary({
      employeeId: ids.employee,
      month: MONTH,
    });

    // base only — the self-assessment must not pay
    expect(Number(adjustment.amount)).toBe(2_000_000);
  });
});

/**
 * OY KALITI — "YYYY-MM" va "YYYY-MM-01".
 *
 * Bu blok haqiqiy prod yo'lini takrorlaydi. `PayrollDrafts` ekrani
 * `approveEmployeeSalary` ni "YYYY-MM" bilan chaqiradi (komponent holati shu
 * shaklda), `MonthlyPerformance.month` esa "YYYY-MM-01". Server qat'iy tenglik
 * bilan qidirgani uchun birorta KPI qatorini topmasdi: nazoratchi ekranda
 * bonusi bor qoralamani ko'rib tasdiqlardi, bazaga esa faqat bazaviy summa
 * tushardi. Yuqoridagi testlar buni ko'rmagan, chunki ular MONTH ni allaqachon
 * "-01" bilan uzatadi.
 */
describe("approveEmployeeSalary — oy kaliti ikki shaklda", () => {
  // MONTH bilan AYNI davr, faqat "-01" siz — PayrollDrafts aynan shunday yuboradi.
  const MONTH_SHORT = MONTH.slice(0, 7);

  it("'-01' siz kelganda ham KPI oylikka tushadi", async () => {
    await setScore(0.6); // +0.6% × 10,000,000 = 60,000

    const adjustment = await approveEmployeeSalary({
      employeeId: ids.employee,
      month: MONTH_SHORT,
    });

    // Nuqson vaqtida bu 2,000,000 edi — KPI jimgina yo'qolardi.
    expect(Number(adjustment.amount)).toBe(2_060_000);
  });

  it("kanonik shaklda yoziladi ('YYYY-MM')", async () => {
    await setScore(0.6);

    const adjustment = await approveEmployeeSalary({
      employeeId: ids.employee,
      month: MONTH,
    });

    // Pul qatlamining qolgani ham shu shaklda: Payout.month, davr qulfi, monthClose.
    expect(adjustment.month).toBe(MONTH_SHORT);
  });

  it("dublikat qo'riqchisi ikkala shaklni ko'radi — oylik ikki marta yozilmaydi", async () => {
    await setScore(0.6);

    await approveEmployeeSalary({ employeeId: ids.employee, month: MONTH_SHORT });

    // Ikkinchi urinish BOSHQA shaklda — ilgari qo'riqchi uni sezmay, bitta oyga
    // ikkita 'payment' majburiyati yozilardi (oylik ikki barobar).
    await expect(
      approveEmployeeSalary({ employeeId: ids.employee, month: MONTH })
    ).rejects.toThrow(/allaqachon tasdiqlangan/);

    const written = await prisma.payrollAdjustment.count({
      where: { employeeId: ids.employee, adjustmentType: "payment", deletedAt: null },
    });
    expect(written).toBe(1);
  });

  it("o'qishda eski '-01' qatorlari ham ko'rinadi (migratsiyasiz)", async () => {
    await prisma.payrollAdjustment.createMany({
      data: [
        { month: MONTH_SHORT, employeeId: ids.employee, adjustmentType: "bonus", amount: 111, reason: "kanonik" },
        { month: MONTH, employeeId: ids.employee, adjustmentType: "bonus", amount: 222, reason: "eski" },
      ],
    });

    const rows = await getPayrollAdjustments(MONTH_SHORT, ids.employee);
    const amounts = rows.map((r) => Number(r.amount)).sort((a, b) => a - b);
    expect(amounts).toEqual([111, 222]);

    // Teskari yo'nalish ham: "-01" bilan so'ralganda kanonik qator yo'qolmasin.
    const reverse = await getPayrollAdjustments(MONTH, ids.employee);
    expect(reverse.map((r) => Number(r.amount)).sort((a, b) => a - b)).toEqual([111, 222]);
  });
});
