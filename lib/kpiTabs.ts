/**
 * KPI bo'limining yorliq reyestri.
 *
 * Nega alohida fayl: `SalaryKPIModule` `"use client"` bilan boshlanadi, ya'ni
 * undan eksport qilingan funksiya server komponentida chaqirilmaydi. Sahifa
 * (`app/(dashboard)/kpi/page.tsx`) esa `?tab=` ni SERVERDA tekshirishi kerak —
 * boshlang'ich yorliq mijozda hisoblansa hidratsiya mos kelmaydi.
 */

export type KpiTabId = "mine" | "nazoratchi" | "reyting" | "rules";

export const KPI_TAB_IDS: readonly KpiTabId[] = ["mine", "nazoratchi", "reyting", "rules"];

/** "Baholash" yorlig'ini ko'radigan rollar — nazoratchi varaqasi. */
export const KPI_REVIEW_ROLES = ["super_admin", "admin", "chief_accountant", "supervisor"];

/** KPI qoidalarini sozlay oladigan rollar. */
export const KPI_CONFIG_ROLES = ["super_admin", "admin", "chief_accountant"];

/**
 * Rolga mos boshlang'ich yorliq. Nazoratchining bu ekrandagi ishi — boshqalarni
 * baholash; baholamaydigan rol esa avvalo o'z ko'rsatkichini topshiradi.
 *
 * Ilgari bu qiymat `'nazoratchi'` deb QOTIRILGAN edi. Uni ko'rmaydigan rolga
 * sahifa birorta yorliq belgilanmagan holda ochilar, kontent esa boshqa
 * yorliqniki bo'lardi.
 */
export function defaultKpiTab(role: string): KpiTabId {
  return KPI_REVIEW_ROLES.includes((role || "").toLowerCase()) ? "nazoratchi" : "mine";
}
