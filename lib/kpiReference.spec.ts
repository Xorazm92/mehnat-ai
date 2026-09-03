/**
 * KPI REFERENCE — INPUT → EXPECTED → ACTUAL.
 *
 * Har bir kutilgan qiymat QO'LDA hisoblangan va izohda ko'rsatilgan. Maqsad
 * "kod ishlayapti" emas: reglamentdagi raqam bilan koddagi raqam bir xilligini
 * isbotlash. Ikki qism:
 *   §1 formula jadvali (chegara holatlari bilan)
 *   §2 oylik jadvali (5 xodim, uchidan-uchiga)
 */
import { describe, it, expect } from "vitest";
import { computeRuleScore, capKpiPercent, kpiBall, type KpiRuleLike } from "@/lib/kpiScoring";
import { calculateEmployeeSalary, type CompanyAssignment } from "@/lib/kpiLogic";
import type { Company, KPIRule, MonthlyPerformance, Staff } from "@/types";

// ─────────────────────────────────────────────────────────────
// §1 FORMULA JADVALI
// ─────────────────────────────────────────────────────────────

/** `acc_didox` shakli: uch holatli ±0.25. */
const didox: KpiRuleLike = {
  inputTypeV2: "select",
  maxBonus: 0.25,
  maxPenalty: -0.25,
  options: [
    { key: "green", color: "green", coeff: 0.25 },
    { key: "yellow", color: "yellow", coeff: 0 },
    { key: "red", color: "red", coeff: -0.25 },
  ],
};

/** `acc_attendance` shakli: +0.04/kun (max +1), −0.1 har 5 daqiqa (max −0.5). */
const attendance: KpiRuleLike = {
  inputTypeV2: "counter",
  maxBonus: 1,
  maxPenalty: null,
  options: [
    { key: "early_days", color: "green", coeff_per_unit: 0.04, max_coeff: 1 },
    { key: "late_5min", color: "red", coeff_per_unit: -0.1, max_coeff: -0.5 },
  ],
};

/** `acc_absence` shakli: shiftsiz −1%/kun. */
const absence: KpiRuleLike = {
  inputTypeV2: "counter",
  maxBonus: 0,
  maxPenalty: null,
  options: [{ key: "absent_days", color: "red", coeff_per_unit: -1, max_coeff: null }],
};

type Case = {
  holat: string;
  rule: KpiRuleLike;
  input: Parameters<typeof computeRuleScore>[1];
  expected: number;
  /** Qo'lda hisob. */
  hisob: string;
};

const CASES: Case[] = [
  // ── normal
  { holat: "normal · select yashil", rule: didox, input: { selectedOption: "green" }, expected: 0.25, hisob: "coeff = +0.25" },
  { holat: "normal · select qizil", rule: didox, input: { selectedOption: "red" }, expected: -0.25, hisob: "coeff = −0.25" },
  { holat: "normal · counter 10 kun", rule: attendance, input: { counters: { early_days: 10 } }, expected: 0.4, hisob: "10 × 0.04 = 0.40" },

  // ── zero
  { holat: "zero · sariq (neytral)", rule: didox, input: { selectedOption: "yellow" }, expected: 0, hisob: "coeff = 0" },
  { holat: "zero · counter 0 kun", rule: attendance, input: { counters: { early_days: 0, late_5min: 0 } }, expected: 0, hisob: "0 × 0.04 = 0" },

  // ── null / missing
  { holat: "null · variant tanlanmagan", rule: didox, input: { selectedOption: null }, expected: 0, hisob: "mos option yo'q → 0" },
  { holat: "missing · counter berilmagan", rule: attendance, input: {}, expected: 0, hisob: "counters yo'q → 0" },
  { holat: "missing · noma'lum kalit", rule: attendance, input: { counters: { boshqa: 50 } }, expected: 0, hisob: "kalit qoidada yo'q → 0" },

  // ── minimum / maximum (qoida konverti)
  { holat: "maximum · bonus max_coeff da to'xtaydi", rule: attendance, input: { counters: { early_days: 100 } }, expected: 1, hisob: "100 × 0.04 = 4.0 → max_coeff 1.0" },
  { holat: "minimum · jarima max_coeff da to'xtaydi", rule: attendance, input: { counters: { late_5min: 100 } }, expected: -0.5, hisob: "100 × −0.1 = −10 → max_coeff −0.5" },
  { holat: "minimum · shiftsiz jarima to'planadi", rule: absence, input: { counters: { absent_days: 4 } }, expected: -4, hisob: "4 × −1 = −4 (max_coeff null)" },

  // ── boundary
  { holat: "boundary · bonus aynan chegarada", rule: attendance, input: { counters: { early_days: 25 } }, expected: 1, hisob: "25 × 0.04 = 1.00 = max_coeff" },
  { holat: "boundary · chegaradan bir kun past", rule: attendance, input: { counters: { early_days: 24 } }, expected: 0.96, hisob: "24 × 0.04 = 0.96" },
  { holat: "boundary · jarima aynan chegarada", rule: attendance, input: { counters: { late_5min: 5 } }, expected: -0.5, hisob: "5 × −0.1 = −0.50 = max_coeff" },

  // ── aralash
  { holat: "aralash · bonus + jarima", rule: attendance, input: { counters: { early_days: 20, late_5min: 3 } }, expected: 0.5, hisob: "0.80 − 0.30 = 0.50" },
];

describe("§1 KPI formula jadvali — INPUT → EXPECTED → ACTUAL", () => {
  it.each(CASES)("$holat → $expected%  ($hisob)", ({ rule, input, expected }) => {
    expect(computeRuleScore(rule, input).percent).toBe(expected);
  });
});

describe("§1b rol konverti (capKpiPercent)", () => {
  const ROLE_CASES = [
    { holat: "buxgalter · normal", percents: [0.25, 0.2, 0.1], role: "accountant", expected: 0.55 },
    { holat: "buxgalter · maximum (5%)", percents: [3, 2, 4], role: "accountant", expected: 5 },
    { holat: "buxgalter · boundary (aynan 5)", percents: [2.5, 2.5], role: "accountant", expected: 5 },
    { holat: "buxgalter · aralash", percents: [3, 2, 4, -1.5], role: "accountant", expected: 3.5 },
    { holat: "bank-klient · maximum (2.5%)", percents: [2, 2], role: "bank_client", expected: 2.5 },
    { holat: "nazoratchi · maximum (1%)", percents: [0.5, 0.5, 0.5], role: "supervisor", expected: 1 },
    { holat: "bosh buxgalter · konvert nol", percents: [3, 2], role: "chief_accountant", expected: 0 },
    { holat: "zero · ball yo'q", percents: [], role: "accountant", expected: 0 },
    { holat: "minimum · faqat jarima (shiftsiz)", percents: [-1, -4], role: "accountant", expected: -5 },
  ];

  it.each(ROLE_CASES)("$holat → $expected%", ({ percents, role, expected }) => {
    expect(capKpiPercent(percents, role)).toBe(expected);
  });
});

describe("§1c missing ≠ zero", () => {
  it("baholanmagan xodim — null (0 ham, 100 ham emas)", () => {
    expect(kpiBall(0, 0)).toBeNull();
  });
  it("hammasi qizil — 0 ball", () => {
    expect(kpiBall(0, 5)).toBe(0);
  });
  it("hammasi yashil — 100 ball", () => {
    expect(kpiBall(5, 0)).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────
// §2 OYLIK JADVALI — 5 xodim, qo'lda hisoblangan
// ─────────────────────────────────────────────────────────────

const MONTH = "2026-07";
const CONTRACT = 12_000_000;

const company = { id: "co-1", name: "Reference Firma", contractAmount: CONTRACT } as Company;

const rules = [
  { id: "r-acc", name: "acc_didox", nameUz: "Didox", role: "accountant", category: "automation" },
  { id: "r-acc2", name: "acc_cashflow", nameUz: "Pul oqimi", role: "accountant", category: "reports" },
  { id: "r-acc3", name: "acc_1c_base", nameUz: "1C baza", role: "accountant", category: "automation" },
  { id: "r-bank", name: "bank_personal_resp", nameUz: "Shaxsiy mas'uliyat", role: "bank_client", category: "bonus_only" },
  { id: "r-bank2", name: "bank_group_response", nameUz: "Guruh javobi", role: "bank_client", category: "communication" },
  { id: "r-sup", name: "sup_group_response", nameUz: "Guruh javobi", role: "supervisor", category: "communication" },
  { id: "r-sup2", name: "sup_reports_deadline", nameUz: "Hisobot muddati", role: "supervisor", category: "reports" },
  { id: "r-sup3", name: "sup_tax_reports", nameUz: "Soliq hisobotlari", role: "supervisor", category: "reports" },
] as unknown as KPIRule[];

let seq = 0;
const perf = (
  employeeId: string,
  ruleId: string,
  ruleRole: string,
  calculatedScore: number,
  penaltyAmount = 0
): MonthlyPerformance =>
  ({
    id: `ref-${++seq}`,
    month: `${MONTH}-01`,
    companyId: "co-1",
    employeeId,
    ruleId,
    ruleRole,
    value: calculatedScore > 0 ? 1 : calculatedScore < 0 ? -1 : 0,
    calculatedScore,
    penaltyAmount,
    status: "approved",
  }) as unknown as MonthlyPerformance;

const pay = (
  employeeId: string,
  assignments: CompanyAssignment[],
  performances: MonthlyPerformance[]
) =>
  calculateEmployeeSalary({
    employee: { id: employeeId, name: employeeId, role: "accountant" } as Staff,
    companies: [company],
    operations: [],
    performances,
    rules,
    overrides: [],
    month: MONTH,
    assignmentsByCompany: { "co-1": assignments },
  });

const acc = (id: string): CompanyAssignment => ({ userId: id, role: "accountant", salaryType: "percent", salaryValue: 20 });
const bank = (id: string): CompanyAssignment => ({ userId: id, role: "bank_manager", salaryType: "percent", salaryValue: 5 });
const sup = (id: string): CompanyAssignment => ({ userId: id, role: "supervisor", salaryType: "percent", salaryValue: 5 });

describe("§2 oylik reference — 5 xodim", () => {
  it("1) Aziz · buxgalter · bonus + jarima → 2 334 000", () => {
    // baza  = 12 000 000 × 20% = 2 400 000
    // KPI   = +0.25 (didox) +0.20 (cashflow) −1.00 (1C) → bonus 0.45, jarima −1.00 → −0.55%
    // pul   = 12 000 000 × (−0.55) / 100 = −66 000
    const d = pay("aziz", [acc("aziz")], [
      perf("aziz", "r-acc", "accountant", 0.25),
      perf("aziz", "r-acc2", "accountant", 0.2),
      perf("aziz", "r-acc3", "accountant", -1),
    ]);
    expect(d.baseSalary).toBe(2_400_000);
    expect(d.totalSalary).toBe(2_334_000);
  });

  it("2) Bek · bank-klient · bonus jarimani qoplaydi → 600 000", () => {
    // baza = 12 000 000 × 5% = 600 000
    // KPI  = +0.5 − 0.5 = 0%
    const d = pay("bek", [bank("bek")], [
      perf("bek", "r-bank", "bank_client", 0.5),
      perf("bek", "r-bank2", "bank_client", -0.5),
    ]);
    expect(d.baseSalary).toBe(600_000);
    expect(d.totalSalary).toBe(600_000);
  });

  it("3) Dilnoza · nazoratchi · bonus 1% da qirqiladi → 720 000", () => {
    // baza = 600 000; KPI xom = +1.5% → nazoratchi konverti 1% → 120 000
    const d = pay("dilnoza", [sup("dilnoza")], [
      perf("dilnoza", "r-sup", "supervisor", 0.5),
      perf("dilnoza", "r-sup2", "supervisor", 0.5),
      perf("dilnoza", "r-sup3", "supervisor", 0.5),
    ]);
    expect(d.kpiBonus).toBe(120_000);
    expect(d.totalSalary).toBe(720_000);
  });

  it("4) Elyor · IKKI o'rin · har biri o'z qoidasi bilan → 3 180 000", () => {
    // baza = 2 400 000 (buxgalter) + 600 000 (bank) = 3 000 000
    // buxgalter KPI +1.0% → 120 000 · bank KPI +0.5% → 60 000
    // DUBLIKAT YO'Q: acc qoidasi bank o'rniga qo'shilmaydi.
    const d = pay("elyor", [acc("elyor"), bank("elyor")], [
      perf("elyor", "r-acc", "accountant", 1),
      perf("elyor", "r-bank", "bank_client", 0.5),
    ]);
    expect(d.baseSalary).toBe(3_000_000);
    expect(d.kpiBonus).toBe(180_000);
    expect(d.totalSalary).toBe(3_180_000);
  });

  it("5) Feruz · so'mli jarima + foizli jarima → 1 876 000", () => {
    // baza = 2 400 000; KPI −0.2% → −24 000; so'mli jarima −500 000
    const d = pay("feruz", [acc("feruz")], [
      perf("feruz", "r-acc", "accountant", -0.2),
      perf("feruz", "r-acc2", "accountant", 0, 500_000),
    ]);
    expect(d.baseSalary).toBe(2_400_000);
    expect(d.companyBreakdowns[0].fixedPenalty).toBe(500_000);
    expect(d.totalSalary).toBe(1_876_000);
  });

  it("6) chegara · jarima bazadan oshsa rawTotal manfiy, totalSalary 0", () => {
    // baza 2 400 000; KPI −25% → −3 000 000 → raw = −600 000
    const d = pay("gulnora", [acc("gulnora")], [perf("gulnora", "r-acc", "accountant", -25)]);
    expect(d.rawTotal).toBe(-600_000);
    expect(d.totalSalary).toBe(0);
    expect(d.companyBreakdowns[0].clampedLoss).toBe(600_000);
  });

  it("7) missing · KPI yozuvi yo'q → faqat baza, avtomatik bonus YO'Q", () => {
    const d = pay("hamid", [acc("hamid")], []);
    expect(d.baseSalary).toBe(2_400_000);
    expect(d.kpiBonus).toBe(0);
    expect(d.kpiPenalty).toBe(0);
    expect(d.totalSalary).toBe(2_400_000);
  });
});
