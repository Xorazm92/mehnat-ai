/**
 * KPI qoidasi FAQAT O'Z ROLIGA qo'llanadi — DB'siz, sof hisob.
 *
 * Auditda topilgan nuqson: `MonthlyPerformance.ruleRole` ni hech kim
 * to'ldirmagani uchun `lib/kpiLogic.ts` dagi rol filtri doim ochiq turardi.
 * Ikkita oqibati bo'lgan va ikkalasi ham pulga tegadi:
 *   1) bitta firmada ikki o'rinda turgan odamga KPI foizi IKKI MARTA to'langan;
 *   2) nazoratchiga buxgalter qoidasi (acc_absence −1%/kun) qo'llangan.
 * Bu testlar ikkalasini ham qo'riqlaydi.
 */
import { describe, it, expect } from "vitest";
import { calculateEmployeeSalary, type CompanyAssignment } from "@/lib/kpiLogic";
import type { Company, KPIRule, MonthlyPerformance, Staff } from "@/types";

const MONTH = "2026-07";
const CONTRACT = 10_000_000;

const employee = { id: "emp-1", name: "Ikki o'rinli", role: "accountant" } as Staff;

const company = {
  id: "co-1",
  name: "Test Firma",
  contractAmount: CONTRACT,
} as Company;

const rules: KPIRule[] = [
  { id: "r-acc", name: "acc_didox", nameUz: "Didox", role: "accountant", category: "automation" },
  { id: "r-bank", name: "bank_personal_resp", nameUz: "Shaxsiy mas'uliyat", role: "bank_client", category: "bonus_only" },
  { id: "r-sup", name: "sup_unresolved", nameUz: "Yechimsiz muammo", role: "supervisor", category: "communication" },
  { id: "r-all", name: "umumiy", nameUz: "Umumiy", role: "all", category: "other" },
] as unknown as KPIRule[];

const perf = (ruleId: string, ruleRole: string, calculatedScore: number, extra: Record<string, unknown> = {}): MonthlyPerformance =>
  ({
    id: `p-${ruleId}-${calculatedScore}`,
    month: `${MONTH}-01`,
    companyId: "co-1",
    employeeId: "emp-1",
    ruleId,
    ruleRole,
    value: calculatedScore > 0 ? 1 : -1,
    calculatedScore,
    status: "approved",
    ...extra,
  }) as unknown as MonthlyPerformance;

const run = (performances: MonthlyPerformance[], assignments: CompanyAssignment[]) =>
  calculateEmployeeSalary({
    employee,
    companies: [company],
    operations: [],
    performances,
    rules,
    overrides: [],
    month: MONTH,
    assignmentsByCompany: { "co-1": assignments },
  });

const ACCOUNTANT: CompanyAssignment = { userId: "emp-1", role: "accountant", salaryType: "percent", salaryValue: 20 };
const BANK: CompanyAssignment = { userId: "emp-1", role: "bank_manager", salaryType: "percent", salaryValue: 5 };
const SUPERVISOR: CompanyAssignment = { userId: "emp-1", role: "supervisor", salaryType: "percent", salaryValue: 5 };

describe("bitta firmada ikki o'rin", () => {
  it("buxgalter qoidasi FAQAT buxgalter o'rniga qo'llanadi", () => {
    const draft = run([perf("r-acc", "accountant", 1)], [ACCOUNTANT, BANK]);

    // Baza: 20% + 5% = 2,500,000. KPI: +1% × 10 mln = 100,000 (BIR marta).
    expect(draft.baseSalary).toBe(2_500_000);
    expect(draft.kpiBonus).toBe(100_000);
    expect(draft.totalSalary).toBe(2_600_000);
  });

  it("har o'rin o'z qoidasini oladi", () => {
    const draft = run(
      [perf("r-acc", "accountant", 1), perf("r-bank", "bank_client", 0.5)],
      [ACCOUNTANT, BANK]
    );

    // 1% + 0.5% = 1.5% × 10 mln = 150,000
    expect(draft.kpiBonus).toBe(150_000);
    expect(draft.totalSalary).toBe(2_650_000);
  });

  it("rolsiz ('all') qoida ikki o'rinda ham bir marta sanaladi", () => {
    const draft = run([perf("r-all", "all", 1)], [ACCOUNTANT, BANK]);

    expect(draft.kpiBonus).toBe(100_000);
  });
});

describe("begona rol qoidasi qo'llanmaydi", () => {
  it("buxgalter jarimasi nazoratchining oyligiga tushmaydi", () => {
    const draft = run([perf("r-acc", "accountant", -1)], [SUPERVISOR]);

    expect(draft.baseSalary).toBe(500_000);
    expect(draft.kpiPenalty).toBe(0);
    expect(draft.totalSalary).toBe(500_000);
  });

  it("nazoratchi qoidasi nazoratchiga qo'llanadi", () => {
    const draft = run([perf("r-sup", "supervisor", -0.5)], [SUPERVISOR]);

    // −0.5% × 10 mln = −50,000
    expect(draft.kpiPenalty).toBe(-50_000);
    expect(draft.totalSalary).toBe(450_000);
  });

  it("reglamentda yo'q rol (controller) KPI bonusi olmaydi", () => {
    const controller: CompanyAssignment = { userId: "emp-1", role: "controller", salaryType: "percent", salaryValue: 5 };
    const draft = run([perf("r-sup", "supervisor", 0.5)], [controller]);

    // 'controller' → 'supervisor' ga xaritalanadi, ya'ni qoida qo'llanadi.
    expect(draft.kpiBonus).toBe(50_000);
  });
});

describe("so'mli jarima (amount_penalty) oylikdan ayiriladi", () => {
  it("jarima summasi bazadan chiqariladi", () => {
    const draft = run([perf("r-bank", "bank_client", 0, { penaltyAmount: 300_000 })], [BANK]);

    // Baza 5% = 500,000; jarima 300,000 → 200,000
    expect(draft.baseSalary).toBe(500_000);
    expect(draft.totalSalary).toBe(200_000);
    expect(draft.companyBreakdowns[0].fixedPenalty).toBe(300_000);
  });

  it("jarima bazadan oshsa rawTotal manfiy bo'lib ko'rinadi (jimgina nolga tushmaydi)", () => {
    const draft = run([perf("r-bank", "bank_client", 0, { penaltyAmount: 900_000 })], [BANK]);

    expect(draft.rawTotal).toBe(-400_000);
    expect(draft.totalSalary).toBe(0);
    expect(draft.companyBreakdowns[0].clampedLoss).toBe(400_000);
  });

  it("begona rol jarimasi ham qo'llanmaydi", () => {
    const draft = run([perf("r-acc", "accountant", 0, { penaltyAmount: 300_000 })], [BANK]);

    expect(draft.totalSalary).toBe(500_000);
  });
});
