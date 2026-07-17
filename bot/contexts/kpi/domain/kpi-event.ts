import { PeriodMonth } from "../../../shared/domain/value-objects/period-month";

/**
 * The KPI ledger's vocabulary. Every bonus/penalty is an immutable, signed
 * `KpiEvent` — the append-only source of truth. Corrections are new events,
 * never edits. Projecting the ledger onto the live payroll `MonthlyPerformance`
 * is a separate, deliberate step (not done automatically — see bot/README.md).
 */
export type KpiEventType = "response" | "attendance" | "report" | "manual";

export interface KpiEventInput {
  employeeId: string;
  companyId?: string | null;
  ruleId?: string | null;
  periodMonth: string; // "YYYY-MM"
  type: KpiEventType;
  /** Signed contribution. For automatic events this is a count (+1/-1); for
   *  manual adjustments it is a percentage. Interpret by `type`. */
  points: number;
  sourceRef?: string | null; // Question.id / Attendance.id / ...
  meta?: Record<string, unknown>;
  createdBy?: string | null; // for manual adjustments: who
}

/** The accounting month ("YYYY-MM") a moment belongs to (UTC). */
export function periodOf(date: Date): string {
  return PeriodMonth.fromDate(date).toString();
}
