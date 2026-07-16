/**
 * Unit tests for the salary aggregation — no DB, no auth.
 *
 * This is the calculation that decides what a person is paid. Until now it only
 * existed inside a useMemo in PayrollDrafts.tsx, so the only way to exercise it
 * was to render the payroll screen. Extracting it makes the interface the test
 * surface — which is the point of the deepening.
 */
import { describe, it, expect } from "vitest";
import { calculateEmployeeSalary } from "@/lib/kpiLogic";
import type { Company, KPIRule, MonthlyPerformance, OperationEntry, Staff } from "@/types";

const MONTH = "2026-07";

const employee = { id: "emp-1", name: "Testchi", role: "accountant" } as Staff;

// contract 10,000,000 × accountantPerc 20% → base 2,000,000
const company = {
  id: "co-1",
  name: "Test Firma",
  contractAmount: 10_000_000,
  accountantId: "emp-1",
  accountantPerc: 20,
} as Company;

const rule = {
  id: "rule-1",
  name: "acc_attendance",
  nameUz: "Davomat",
  role: "accountant",
  category: "attendance",
} as KPIRule;

const perf = (calculatedScore: number): MonthlyPerformance =>
  ({
    id: `p-${calculatedScore}`,
    month: `${MONTH}-01`,
    companyId: "co-1",
    employeeId: "emp-1",
    ruleId: "rule-1",
    value: calculatedScore > 0 ? 1 : -1,
    calculatedScore,
    status: "approved",
  }) as unknown as MonthlyPerformance;

const run = (performances: MonthlyPerformance[], operations: OperationEntry[] = []) =>
  calculateEmployeeSalary({
    employee,
    companies: [company],
    operations,
    performances,
    rules: [rule],
    overrides: [],
    month: MONTH,
  });

describe("calculateEmployeeSalary", () => {
  it("adds a KPI bonus as a percent of the contract, not of base", () => {
    // +0.6% of 10,000,000 = 60,000 on top of a 2,000,000 base
    const draft = run([perf(0.6)]);

    expect(draft.baseSalary).toBe(2_000_000);
    expect(draft.kpiBonus).toBe(60_000);
    expect(draft.totalSalary).toBe(2_060_000);
    expect(draft.rawTotal).toBe(2_060_000);
  });

  it("caps the bonus side at the role's maximum but lets penalties accumulate", () => {
    // accountant kpiMaxPercent = 5. Three +4% rules would be +12% uncapped.
    const draft = run([perf(4), perf(4), perf(4)]);

    // capped at 5% of contract = 500,000
    expect(draft.kpiBonus).toBe(500_000);
    expect(draft.totalSalary).toBe(2_500_000);
  });

  it("reports a negative rawTotal when penalties exceed base pay", () => {
    // -25% of 10,000,000 = -2,500,000 against a 2,000,000 base
    const draft = run([perf(-25)]);

    expect(draft.rawTotal).toBe(-500_000);
    // totalSalary is still floored — rawTotal is what exposes the anomaly
    expect(draft.totalSalary).toBe(0);
  });

  it("does not floor a heavy but survivable penalty", () => {
    // the real Abdugani case after dedupe: -14% against a 20% base
    const draft = run([perf(-14)]);

    expect(draft.rawTotal).toBe(600_000);
    expect(draft.totalSalary).toBe(600_000);
  });

  it("ignores performance rows that are not approved", () => {
    const submitted = { ...perf(4), status: "submitted" } as MonthlyPerformance;
    const draft = run([submitted]);

    expect(draft.kpiBonus).toBe(0);
    expect(draft.totalSalary).toBe(2_000_000);
  });

  it("counts a company only once when assigned by both id and operation", () => {
    const op = {
      companyId: "co-1",
      period: MONTH,
      contract_amount: 10_000_000,
      assigned_accountant_id: "emp-1",
    } as unknown as OperationEntry;

    const draft = run([perf(0.6)], [op]);

    expect(draft.companyCount).toBe(1);
    expect(draft.totalSalary).toBe(2_060_000);
  });
});
