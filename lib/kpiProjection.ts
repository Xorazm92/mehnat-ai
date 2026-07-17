// =====================================================
// KPI LEDGER → PAYROLL PROYEKSIYA (sof mantiq)
// =====================================================
// Bot `KpiEvent` ledger'idagi javob (response) hodisalarini mavjud
// `*_group_response` (select: green/yellow/red) qoidasining tanloviga o'giradi.
// Yashil = "oy davomida uzluksiz bajarildi", qizil = "tizimli kechikish".
// Sof va DB'siz test qilinadi. Yozuv (MonthlyPerformance) — server tomonда.

export type KpiColor = "green" | "yellow" | "red";

/** Roldan `*_group_response` qoidasi nomiga xarita (DB seed nomlari). */
export const RESPONSE_RULE_BY_ROLE: Record<string, string> = {
  accountant: "acc_group_response",
  bank_client: "bank_group_response",
  supervisor: "sup_group_response",
  controller: "sup_group_response",
};

export interface ResponseColorThresholds {
  /** Shu qadar (yoki ko'p) kechikish — "tizimli" (qizil). */
  redAtLate: number;
}

export const DEFAULT_RESPONSE_THRESHOLDS: ResponseColorThresholds = { redAtLate: 3 };

/**
 * Oy davomidagi on-time / late javoblar sonidan reglament rangini aniqlaydi.
 * Faoliyat bo'lmasa (0/0) — null (baho qo'yilmaydi). 0 kechikish — yashil
 * (uzluksiz); `redAtLate` va undan ko'p — qizil (tizimli); orasi — sariq.
 */
export function responseColorFromCounts(
  onTime: number,
  late: number,
  thresholds: ResponseColorThresholds = DEFAULT_RESPONSE_THRESHOLDS,
): KpiColor | null {
  if (onTime + late <= 0) return null;
  if (late <= 0) return "green";
  if (late >= thresholds.redAtLate) return "red";
  return "yellow";
}
