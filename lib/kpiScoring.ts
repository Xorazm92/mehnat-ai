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

/**
 * Firma bo'yicha qoida override'i (`CompanyKpiRule`).
 *
 * NEGA KERAK: admin/nazoratchi bitta firmaga alohida mukofot/jarima foizi
 * qo'yishi mumkin va bu `CompanyKpiRule` ga yoziladi. Lekin v2 hisobi faqat
 * global `KpiRule.options` ni o'qirdi — ya'ni override JIM ISHLAMASDI: ekranda
 * turardi, hisobga esa umuman kirmasdi.
 */
export interface KpiRuleOverride {
  isActive?: boolean;
  rewardPercent?: number | null;
  penaltyPercent?: number | null;
}

/**
 * Override'ni qoidaga qo'llaydi. SOF funksiya — qoidani o'zgartirmaydi, nusxa qaytaradi.
 *
 *  - `isActive === false` → qoida bu firmaga TEGISHLI EMAS: hamma koeffitsiyent 0.
 *  - `select` / `checkbox_*` → yashil variant koeffitsiyenti `+rewardPercent`,
 *    qizil variantniki `-|penaltyPercent|` bo'ladi (eski model aynan shu ikki
 *    raqamdan iborat edi).
 *  - `counter` va `amount_penalty` → override QO'LLANMAYDI: birinchisida bitta
 *    koeffitsiyent yo'q (kun/marta bo'yicha), ikkinchisi umuman foiz emas.
 *    Bunday qoidada override o'rniga qoidaning o'zi tahrirlanadi.
 */
export function applyRuleOverride<T extends KpiRuleLike>(rule: T, o?: KpiRuleOverride | null): T {
  if (!o) return rule;
  const options = asOptions(rule.options);

  if (o.isActive === false) {
    return {
      ...rule,
      options: options.map((opt) => ({ ...opt, coeff: 0, coeff_per_unit: 0, max_coeff: 0 })),
      maxBonus: 0,
      maxPenalty: 0,
    };
  }

  if (rule.inputTypeV2 === "counter" || rule.inputTypeV2 === "amount_penalty") return rule;

  const reward = o.rewardPercent === null || o.rewardPercent === undefined ? null : num(o.rewardPercent);
  const penalty = o.penaltyPercent === null || o.penaltyPercent === undefined ? null : -Math.abs(num(o.penaltyPercent));
  if (reward === null && penalty === null) return rule;

  return {
    ...rule,
    options: options.map((opt) => {
      const coeff = num(opt.coeff);
      if (reward !== null && (opt.color === "green" || coeff > 0)) return { ...opt, coeff: reward };
      if (penalty !== null && (opt.color === "red" || coeff < 0)) return { ...opt, coeff: penalty };
      return opt;
    }),
    maxBonus: reward !== null ? reward : rule.maxBonus,
    maxPenalty: penalty !== null ? penalty : rule.maxPenalty,
  };
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

export type KpiSalaryRole = "accountant" | "bank_client" | "supervisor" | "chief_accountant";

// basePercent is documentation only — the payable base comes from Company.*Perc/*Sum.
// kpiMaxPercent IS read, by capKpiPercent.
export const KPI_SALARY_CONFIG: Record<KpiSalaryRole, { basePercent: number; kpiMaxPercent: number }> = {
  accountant: { basePercent: 20, kpiMaxPercent: 5 },
  bank_client: { basePercent: 5, kpiMaxPercent: 2.5 },
  supervisor: { basePercent: 5, kpiMaxPercent: 1 },
  // The reglament defines bonus envelopes for three roles only. calculateCompanySalaries
  // deliberately excludes chiefs from every accountant/bank/supervisor rule, so their KPI
  // envelope is zero — not an invented figure, and not the Infinity that a missing key
  // would hand to capKpiPercent. Chief pay is base-only, set per company.
  chief_accountant: { basePercent: 0, kpiMaxPercent: 0 },
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

// =====================================================
// REYTING BALI (0-100) — ko'rsatish uchun, pulga tegmaydi
// =====================================================

export type KpiMark = "green" | "red" | null;

/**
 * Bitta `MonthlyPerformance` qatori reytingda QAYSI TOMONGA sanaladi.
 * `null` — umuman sanalmaydi (o'lchanmagan).
 *
 * FAQAT OG'IRLIGI BOR QATOR SANALADI. Ilgari qoida ikki shoxli edi:
 * `sc > 0` → yashil, `sc < 0` YOKI `selectedOption === 'red'` → qizil. Ikkinchi
 * shox assimetriya yaratardi: koeffitsiyenti NOL bo'lgan qoidada — masalan
 * `acc_payroll_posted`, uning uchala variantining ham `coeff` i 0 — qizil
 * tanlov ballni pasaytirardi, yashil tanlov esa hech narsa bermasdi. Ya'ni
 * og'irliksiz qoida faqat JAZOLAY olardi, mukofotlay olmasdi. PRODDA
 * (2026-09-08 da o'lchandi) aynan shu holatdagi 275 qator — hammasi
 * `acc_payroll_posted` — tasdiqlanishini kutib turibdi: `calculatedScore = 0`,
 * `selectedOption = 'red'`. Tasdiqlangan kuni har birining egasi reytingda
 * tekinga bitta qizil olardi, oyligiga esa hech narsa tushmasdi.
 *
 * Endi ball reglament HAQIQATAN o'lchaydigan narsani ko'rsatadi: manba —
 * `calculatedScore`, nol esa "o'lchanmagan" (ADR-0013), jazo emas.
 */
export function kpiMark(calculatedScore: unknown): KpiMark {
  const sc = num(calculatedScore);
  if (sc === 0) return null;
  return sc > 0 ? "green" : "red";
}

/**
 * Baholangan qatorlardan 0-100 ball.
 *
 * `null` — O'LCHANMAGAN: bu oyda yashil ham, qizil ham yo'q. Nol EMAS va yuz
 * EMAS. Ilgari `getKpiLeaderboard` bunday holatda 100 qaytarardi, ya'ni butun
 * oyi neytral bo'lgan xodim reytingda a'lochi bo'lib turardi va ma'lumot
 * bermaslik eng foydali strategiya edi (ADR-0013).
 */
export function kpiBall(green: number, red: number): number | null {
  const scored = green + red;
  if (scored <= 0) return null;
  return Math.round((green / scored) * 100);
}

export type KpiDaraja = "excellent" | "good" | "fair" | "poor";

/** Ball → daraja. Chegaralar: 85 / 70 / 60 (chegaraning O'ZI yuqori darajaga tegishli). */
export function kpiDaraja(ball: number | null): KpiDaraja | null {
  if (ball === null) return null;
  return ball >= 85 ? "excellent" : ball >= 70 ? "good" : ball >= 60 ? "fair" : "poor";
}
