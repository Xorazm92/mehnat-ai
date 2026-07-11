/**
 * KPI v2 scoring engine — three-state (bonus / neutral / penalty).
 *
 * Pure & dependency-free so it can run in server actions, the payroll UI, and
 * seed scripts identically. Mirrors the Postgres `calculate_kpi_score_v2`
 * function from the original spec, driven by each rule's `options` JSON.
 *
 * A rule's score is a PERCENT applied to a salary base:
 *   - per_company / per_group rules apply to that company's role share
 *   - global rules apply once to the person's total
 * `amount_penalty` rules instead yield a fixed so'm deduction (fixedPenalty).
 */

export type KpiColor = "green" | "yellow" | "red";

export type KpiInputTypeV2 =
  | "select"
  | "counter"
  | "checkbox_bonus"
  | "checkbox_penalty"
  | "amount_penalty";

export interface KpiOption {
  key: string;
  label_uz?: string;
  color?: KpiColor;
  coeff?: number | null; // select/checkbox: direct percent
  coeff_per_unit?: number; // counter: percent per unit
  max_coeff?: number | null; // counter: cap on this option's contribution
  note?: string;
}

export interface KpiRuleLike {
  inputTypeV2: KpiInputTypeV2 | string;
  options: KpiOption[] | unknown;
  maxBonus?: number | null;
  maxPenalty?: number | null;
}

export interface KpiEntryInput {
  /** chosen option key for select / checkbox rules ("green" | "yellow" | "red" | ...) */
  selectedOption?: string | null;
  /** counter option key -> count (e.g. { early_days: 22, late_5min: 3, absent_days: 1 }) */
  counters?: Record<string, number>;
  /** so'm amount for amount_penalty rules */
  penaltyAmount?: number;
}

export interface KpiScore {
  /** percent applied to the salary base (may be positive or negative) */
  percent: number;
  /** fixed so'm deduction (amount_penalty rules only) */
  fixedPenalty: number;
  /** resolved status color for display */
  color: KpiColor | null;
}

// Robust to plain numbers, numeric strings, and Prisma.Decimal (via valueOf/toString).
const num = (v: unknown, d = 0): number => {
  if (v === null || v === undefined) return d;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
};

const asOptions = (raw: unknown): KpiOption[] => (Array.isArray(raw) ? (raw as KpiOption[]) : []);

/** Clamp a single counter option's contribution against its (signed) max_coeff. */
function clampCounter(contribution: number, maxCoeff: number | null | undefined): number {
  if (maxCoeff === null || maxCoeff === undefined) return contribution;
  // Positive bound caps upward, negative bound caps downward.
  return maxCoeff >= 0 ? Math.min(contribution, maxCoeff) : Math.max(contribution, maxCoeff);
}

/** Round to 2 decimals, avoiding -0. */
const r2 = (n: number): number => {
  const v = Math.round((n + Number.EPSILON) * 100) / 100;
  return v === 0 ? 0 : v;
};

/**
 * Compute a single rule's score for one company-entry.
 */
export function computeRuleScore(rule: KpiRuleLike, input: KpiEntryInput): KpiScore {
  const options = asOptions(rule.options);
  const type = rule.inputTypeV2;

  // amount_penalty: fixed so'm deduction, no percent
  if (type === "amount_penalty") {
    const amt = Math.max(0, num(input.penaltyAmount));
    return { percent: 0, fixedPenalty: amt, color: amt > 0 ? "red" : "green" };
  }

  // counter: sum contributions across counter options
  if (type === "counter") {
    let percent = 0;
    let hasNegative = false;
    let hasPositive = false;
    for (const opt of options) {
      const count = num(input.counters?.[opt.key]);
      if (!count) continue;
      const contribution = clampCounter(count * num(opt.coeff_per_unit), opt.max_coeff);
      percent += contribution;
      if (contribution < 0) hasNegative = true;
      if (contribution > 0) hasPositive = true;
    }
    percent = clampEnvelope(percent, rule);
    const color: KpiColor = percent < 0 || (hasNegative && !hasPositive) ? "red" : percent > 0 ? "green" : "yellow";
    return { percent: r2(percent), fixedPenalty: 0, color };
  }

  // select / checkbox_bonus / checkbox_penalty: direct coeff from chosen option
  const opt = options.find((o) => o.key === input.selectedOption);
  if (!opt) return { percent: 0, fixedPenalty: 0, color: null };
  const percent = clampEnvelope(num(opt.coeff), rule);
  return { percent: r2(percent), fixedPenalty: 0, color: opt.color ?? null };
}

/** Clamp a percent to the rule-level [maxPenalty, maxBonus] envelope when present. */
function clampEnvelope(percent: number, rule: KpiRuleLike): number {
  let p = percent;
  if (rule.maxBonus !== null && rule.maxBonus !== undefined) p = Math.min(p, num(rule.maxBonus));
  if (rule.maxPenalty !== null && rule.maxPenalty !== undefined) p = Math.max(p, num(rule.maxPenalty));
  return p;
}

// =====================================================
// Salary envelopes (from spec.salary_structure)
// =====================================================

export type KpiSalaryRole = "accountant" | "bank_client" | "supervisor";

export const KPI_SALARY_CONFIG: Record<KpiSalaryRole, { basePercent: number; kpiMaxPercent: number }> = {
  accountant: { basePercent: 20, kpiMaxPercent: 5 },
  bank_client: { basePercent: 5, kpiMaxPercent: 2.5 },
  supervisor: { basePercent: 5, kpiMaxPercent: 1 },
};

/**
 * Combine many rule percents for a role into a net KPI percent, capping the
 * positive (bonus) side at the role's kpi_max while letting penalties accumulate.
 */
export function capKpiPercent(percents: number[], role: KpiSalaryRole | string): number {
  const cap = KPI_SALARY_CONFIG[role as KpiSalaryRole]?.kpiMaxPercent ?? Infinity;
  let bonus = 0;
  let penalty = 0;
  for (const p of percents) {
    if (p > 0) bonus += p;
    else penalty += p;
  }
  return r2(Math.min(bonus, cap) + penalty);
}

/** Map a stored monthly-record `kpi_states` entry into a KpiEntryInput. */
export function stateToInput(state: {
  state?: string;
  early_days?: number;
  late_5min?: number;
  absent_days?: number;
  penalty_amount?: number;
}): KpiEntryInput {
  return {
    selectedOption: state.state ?? null,
    counters: {
      early_days: num(state.early_days),
      late_5min: num(state.late_5min),
      absent_days: num(state.absent_days),
    },
    penaltyAmount: num(state.penalty_amount),
  };
}
