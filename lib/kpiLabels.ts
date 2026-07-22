// ─────────────────────────────────────────────────────────────
// KPI / jarima kod → o'zbekcha matn — yagona manba.
//
// Maqsad: xodimlarga (va nazoratchilarga) KPI ballari va jarimalar
// "communication", "penalty", "automation" kabi kodlar bilan emas,
// balki "Javob tezligi", "Jarima", "Avtomatlashtirish" kabi tushunarli
// matn bilan ko'rinsin. Kod tarqalgan har bir joy shu yerdan foydalanadi.
// ─────────────────────────────────────────────────────────────

/** KpiRule.category → o'zbekcha nom */
export const KPI_CATEGORY_UZ: Record<string, string> = {
  attendance: "Ishga kelish",
  communication: "Javob tezligi",
  response: "Javob tezligi",
  automation: "Avtomatlashtirish",
  reports: "Hisobotlar o'z vaqtida",
  penalty_only: "Jiddiy xatolar",
  bonus_only: "Shaxsiy mas'uliyat",
  manual: "Qo'lda baholash",
  general: "Umumiy",
};

/** PayrollAdjustment.adjustmentType → o'zbekcha nom */
export const ADJUSTMENT_TYPE_UZ: Record<string, string> = {
  jarima: "Jarima",
  avans: "Avans",
  bonus: "Bonus",
  payment: "To'lov",
};

/** KpiEvent.type (bot hodisalari) → o'zbekcha nom */
export const KPI_EVENT_TYPE_UZ: Record<string, string> = {
  response: "Javobga kechikish",
  attendance: "Ishga kelish",
  report: "Hisobot",
  manual: "Qo'lda tuzatma",
  bonus: "Bonus",
  penalty: "Jarima",
};

/** Kategoriya kodini tushunarli matnga aylantiradi (topilmasa — kodning o'zi). */
export function kpiCategoryLabel(code?: string | null): string {
  if (!code) return "";
  return KPI_CATEGORY_UZ[code] ?? code;
}

/** Tuzatma turini tushunarli matnga aylantiradi. */
export function adjustmentTypeLabel(code?: string | null): string {
  if (!code) return "";
  return ADJUSTMENT_TYPE_UZ[code] ?? code;
}

/** Bot KPI hodisasi turini tushunarli matnga aylantiradi. */
export function kpiEventTypeLabel(code?: string | null): string {
  if (!code) return "";
  return KPI_EVENT_TYPE_UZ[code] ?? code;
}
