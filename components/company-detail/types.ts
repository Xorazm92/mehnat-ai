/**
 * Firma kartasi sahifasining umumiy tiplari — panel va bo'limlari orasida.
 */

/** Firma kartasi yorliqlari. URL'da `?tab=` sifatida saqlanadi. */
export type TabId =
  | "pasport"
  | "soliq"
  | "loginlar"
  | "jamoa"
  | "shartnoma"
  | "xizmatlar"
  | "hujjatlar"
  | "kpi"
  | "tarix";

export interface ContractRow {
  id: string;
  number: string;
  signedAt: string | null;
  amount: number | null;
  source?: string;
  isActive?: boolean;
  ownFirmName?: string | null;
}

/**
 * Jamoa biriktiruvining TAHRIR shakli (camelCase).
 *
 * DIQQAT: ko'rish shakli boshqacha — `user_id` / `salary_type` / `salary_value`
 * (snake_case), chunki u serverdagi `contract_assignments` javobidan keladi.
 * Ikkalasi bir faylda aralashib yotgani uchun bu farq ko'zga tashlanmasdi.
 */
export interface AssignmentEdit {
  role: string;
  userId?: string;
  salaryType: "percent" | "fixed";
  salaryValue: number;
}

/** Jamoa biriktiruvining KO'RISH shakli (serverdan kelgani). */
export interface AssignmentView {
  id: string;
  role: string;
  user_id?: string;
  salary_type?: "percent" | "fixed";
  salary_value?: number;
}
