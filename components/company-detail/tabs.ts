import {
  FileText,
  Briefcase,
  Lock,
  Users,
  DollarSign,
  Check,
  FolderOpen,
  Calculator,
  History,
} from "lucide-react";
import type { TabItem } from "@/components/ui/Tabs";
import type { TabId } from "./types";

/**
 * FIRMA KARTASI YORLIQLARI — yagona manba.
 *
 * Yorliqlar qatorini sahifa sarlavhasi chizadi, panel kontentini esa
 * `CompanyProfilePanels`. Ikkalasi bir ro'yxatdan o'qiydi: aks holda URL'dagi
 * `?tab=` qiymati mavjud yorliqqa mos kelishini tekshirib bo'lmaydi.
 */
export const COMPANY_TABS: TabItem<TabId>[] = [
  { id: "pasport", label: "Pasport", icon: FileText },
  { id: "soliq", label: "Soliq", icon: Briefcase },
  { id: "loginlar", label: "Loginlar", icon: Lock },
  { id: "jamoa", label: "Jamoa", icon: Users },
  { id: "shartnoma", label: "Shartnoma", icon: DollarSign },
  { id: "xizmatlar", label: "Xizmatlar", icon: Check },
  { id: "hujjatlar", label: "Hujjatlar", icon: FolderOpen },
  { id: "kpi", label: "KPI", icon: Calculator },
  { id: "tarix", label: "Tarix", icon: History },
];

const IDS = new Set(COMPANY_TABS.map((t) => t.id));

/** URL'dan kelgan qiymat — noma'lum bo'lsa "pasport" ga tushadi. */
export function normalizeTabId(value: string | null | undefined): TabId {
  return value && IDS.has(value as TabId) ? (value as TabId) : "pasport";
}

export const TAB_LABELS: Record<TabId, string> = COMPANY_TABS.reduce(
  (acc, t) => ({ ...acc, [t.id]: t.label }),
  {} as Record<TabId, string>,
);
