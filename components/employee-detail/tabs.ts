import { IdCard, Building2, Target, Wallet, CalendarCheck, ShieldCheck } from "lucide-react";
import type { TabItem } from "@/components/ui/Tabs";
import type { EmployeeTabId } from "./types";

/**
 * XODIM KARTASI YORLIQLARI — yagona manba.
 *
 * Yorliqlar qatorini sahifa sarlavhasi chizadi, panel kontentini esa
 * `EmployeeProfilePanels`. Ikkalasi bir ro'yxatdan o'qiydi: aks holda URL'dagi
 * `?tab=` qiymati mavjud yorliqqa mos kelishini tekshirib bo'lmaydi.
 */
export const EMPLOYEE_TABS: TabItem<EmployeeTabId>[] = [
  { id: "shaxsiy", label: "Shaxsiy ma'lumotlar", icon: IdCard },
  { id: "firmalar", label: "Biriktirilgan firmalar", icon: Building2 },
  { id: "kpi", label: "KPI & Ishlar", icon: Target },
  { id: "oylik", label: "Oylik & To'lovlar", icon: Wallet },
  { id: "davomat", label: "Davomat", icon: CalendarCheck },
  { id: "ruxsatlar", label: "Tizim ruxsatlari", icon: ShieldCheck },
];

const IDS = new Set(EMPLOYEE_TABS.map((t) => t.id));

/** URL'dan kelgan qiymat — noma'lum bo'lsa "shaxsiy" ga tushadi. */
export function normalizeEmployeeTabId(value: string | null | undefined): EmployeeTabId {
  return value && IDS.has(value as EmployeeTabId) ? (value as EmployeeTabId) : "shaxsiy";
}

export const EMPLOYEE_TAB_LABELS: Record<EmployeeTabId, string> = EMPLOYEE_TABS.reduce(
  (acc, t) => ({ ...acc, [t.id]: t.label }),
  {} as Record<EmployeeTabId, string>,
);
