/**
 * Xodim kartasi sahifasining umumiy tiplari — panel va bo'limlari orasida.
 */

/** Xodim kartasi yorliqlari. URL'da `?tab=` sifatida saqlanadi. */
export type EmployeeTabId =
  | "shaxsiy"
  | "firmalar"
  | "kpi"
  | "oylik"
  | "davomat"
  | "ruxsatlar";

/** Xodimning bitta firmadagi mas'uliyati va ulushi. */
export interface CompanyRoleShare {
  role: string;
  perc?: number;
  sum?: number;
}

/** "Biriktirilgan firmalar" qatori. */
export interface AssignedCompany {
  id: string;
  name: string;
  inn: string;
  roles: CompanyRoleShare[];
}

/** KPI yorlig'idagi baholangan qator. */
export interface PerformanceRow {
  id: string;
  status: string;
  score?: number | null;
  ruleName: string;
  ruleCategory?: string | null;
  recordedAt?: string | null;
}

/** "Ishlar" — majburiyat yoki uning ustidagi vazifa. */
export interface WorkRow {
  id: string;
  title: string;
  companyName?: string | null;
  dueAt?: string | null;
  status: string;
  isOverdue?: boolean;
}

/** Oylik yorlig'idagi tuzatma qatori. */
export interface AdjustmentRow {
  id: string;
  adjustmentType: string;
  amount: number;
  reason: string;
  isApproved: boolean;
  createdAt?: string | null;
}

/** Davomat yorlig'idagi kunlik qator. */
export interface AttendanceRow {
  id: string;
  date: string;
  status: string;
  checkIn?: string | null;
  lateMinutes?: number | null;
  lateExcused?: boolean | null;
}

/** Davomat oylik yig'masi (lib/attendance.ts#MonthlyAttendanceSummary nusxasi). */
export interface AttendanceSummary {
  workedDays: number;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  excusedDays: number;
  earlyDays: number;
  lateMinutes: number;
  excusedLateDays: number;
  allEarly: boolean;
}

/**
 * Xodim kartasining SERVERDA yig'ilgan ma'lumoti.
 *
 * `kpi`, `payroll`, `davomat` — `null` bo'lishi mumkin: bu "ma'lumot yo'q"
 * emas, "KO'RISH HUQUQI yo'q" degani. Oddiy xodim hamkasbining kartasini
 * ochsa, server bu bo'limlarni umuman yubormaydi — aks holda
 * `staffScopeFilter` so'rovni jimgina SO'ROVCHINING O'ZIGA burib, begona
 * sarlavha ostida o'z oyligini ko'rsatib qo'yardi.
 */
export interface EmployeeDossier {
  /** "YYYY-MM" — ko'rsatilayotgan davr. */
  month: string;
  assigned: AssignedCompany[];
  kpi: { performance: PerformanceRow[] } | null;
  work: { obligations: WorkRow[]; tasks: WorkRow[] };
  payroll: { adjustments: AdjustmentRow[] } | null;
  attendance: { rows: AttendanceRow[]; summary: AttendanceSummary; workdays: number } | null;
  access: { views: { id: string; label: string }[] };
}
