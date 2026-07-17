/**
 * Pure debt assessment for a company's monthly payment. Framework-free and
 * deterministic (no Date inside — the caller passes dayOfMonth/monthsPast), so
 * it is fully unit-testable. Ties into the existing `Payment` + `Company`
 * (contractAmount / paymentDay) model; the escalation levels feed the
 * 🟡🟠🔴 reminder pipeline.
 */

export type ReminderLevel = "yellow" | "orange" | "red";

export interface EscalationConfig {
  /** Days past paymentDay at which a yellow escalates to orange. */
  orangeAfterDays: number;
  /** Days past paymentDay at which it escalates to red. */
  redAfterDays: number;
}

/** Sensible defaults; admin-overridable via SystemSetting (config-driven). */
export const DEFAULT_ESCALATION: EscalationConfig = {
  orangeAfterDays: 3,
  redAfterDays: 7,
};

export interface DebtInput {
  contractAmount: number;
  paidAmount: number;
  status: string | null; // Payment.status ('paid' | 'pending' | 'partial' | 'overdue')
  paymentDay: number | null; // Company.paymentDay (day of month due)
  /** Day of month "today" (1-31). */
  dayOfMonth: number;
  /** Whole months the period is behind the current month (0 = current). */
  monthsPast: number;
}

export interface DebtResult {
  hasDebt: boolean;
  amountDue: number;
  /** Escalation level, or null when there is a debt that is not yet due. */
  level: ReminderLevel | null;
}

export function assessDebt(
  input: DebtInput,
  cfg: EscalationConfig = DEFAULT_ESCALATION,
): DebtResult {
  const amountDue = Math.max(0, input.contractAmount - input.paidAmount);
  if (input.status === "paid" || amountDue <= 0) {
    return { hasDebt: false, amountDue: 0, level: null };
  }

  // A prior period that is still unpaid is unambiguously overdue.
  if (input.monthsPast > 0) {
    return { hasDebt: true, amountDue, level: "red" };
  }

  const daysPast = input.dayOfMonth - (input.paymentDay ?? 1);
  if (daysPast < 0) {
    return { hasDebt: true, amountDue, level: null }; // due later this month
  }

  const level: ReminderLevel =
    daysPast >= cfg.redAfterDays
      ? "red"
      : daysPast >= cfg.orangeAfterDays
        ? "orange"
        : "yellow";
  return { hasDebt: true, amountDue, level };
}
