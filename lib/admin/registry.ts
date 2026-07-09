import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Building2,
  ShieldCheck,
  Settings,
  ScrollText,
  Building,
  CreditCard,
  Wallet,
  FileText,
  TrendingUp,
  FolderArchive,
  KeyRound,
  Boxes,
  FileSignature,
  Landmark,
  Receipt,
  CheckSquare,
} from "lucide-react";
import {
  hasPermission,
  type Capability,
  type UserRole,
} from "@/lib/permissions";

export type AdminModuleGroup = "tizim" | "moliya" | "integratsiya";

export interface AdminModule {
  id: string;
  labelUz: string;
  icon: LucideIcon;
  href: string;
  group: AdminModuleGroup;
  /** Capability required to see this module (from lib/permissions). */
  requiredCapability?: Capability;
  /** 'ready' = built page; 'soon' = renders AdminModulePlaceholder. */
  status: "ready" | "soon";
  /** For 'soon' modules, the system-setting feature flag that will enable it. */
  featureFlag?: string;
  /** Short description shown on the overview grid. */
  descUz?: string;
}

export const ADMIN_GROUP_LABELS: Record<AdminModuleGroup, string> = {
  tizim: "TIZIM",
  moliya: "MOLIYA",
  integratsiya: "INTEGRATSIYALAR",
};

// ---------------------------------------------------------------------------
// THE REGISTRY — the single source of truth for the admin panel.
// Add a new admin section by appending one entry here (+ a page for 'ready').
// 'soon' entries need no page: /admin/m/[id] renders a placeholder from this.
// ---------------------------------------------------------------------------
export const ADMIN_MODULES: AdminModule[] = [
  // --- Tizim (built now) ---
  { id: "overview", labelUz: "Boshqaruv paneli", icon: LayoutDashboard, href: "/admin", group: "tizim", status: "ready", descUz: "Umumiy ko'rsatkichlar va tezkor havolalar" },
  { id: "users", labelUz: "Foydalanuvchilar", icon: Users, href: "/admin/users", group: "tizim", status: "ready", requiredCapability: "manage_users", descUz: "Xodimlar, rollar, parollar" },
  { id: "departments", labelUz: "Bo'limlar", icon: Building2, href: "/admin/departments", group: "tizim", status: "ready", requiredCapability: "manage_staff", descUz: "Bo'lim va bosh buxgalter tayinlash" },
  { id: "roles", labelUz: "Rollar & Ruxsatlar", icon: ShieldCheck, href: "/admin/roles", group: "tizim", status: "ready", requiredCapability: "manage_system", descUz: "Rol-ruxsat matritsasi" },
  { id: "settings", labelUz: "Tizim sozlamalari", icon: Settings, href: "/admin/settings", group: "tizim", status: "ready", requiredCapability: "manage_system", descUz: "Global konfiguratsiya va modullar" },
  { id: "audit", labelUz: "Audit jurnali", icon: ScrollText, href: "/admin/audit", group: "tizim", status: "ready", requiredCapability: "view_audit_logs", descUz: "Tizimdagi o'zgarishlar tarixi" },

  // --- Moliya (launchers to existing, working pages) ---
  { id: "companies", labelUz: "Firmalar", icon: Building, href: "/organizations", group: "moliya", status: "ready", requiredCapability: "view_all_companies", descUz: "Mijozlar va shartnomalar" },
  { id: "payroll", labelUz: "Ish haqi", icon: CreditCard, href: "/payroll", group: "moliya", status: "ready", requiredCapability: "view_salaries", descUz: "Oylik hisob-kitobi" },
  { id: "kassa", labelUz: "Bank / Kassa", icon: Wallet, href: "/kassa", group: "moliya", status: "ready", requiredCapability: "process_payments", descUz: "To'lovlar va operatsiyalar" },
  { id: "reports", labelUz: "Soliq hisobotlari", icon: FileText, href: "/reports", group: "moliya", status: "ready", requiredCapability: "submit_reports", descUz: "Amallar matritsasi" },
  { id: "kpi", labelUz: "KPI tizimi", icon: TrendingUp, href: "/kpi", group: "moliya", status: "ready", requiredCapability: "approve_kpi", descUz: "KPI qoidalari va baholash" },
  { id: "documents", labelUz: "Hujjatlar arxivi", icon: FolderArchive, href: "/documents", group: "moliya", status: "ready", descUz: "Firma hujjatlari" },

  // --- Integratsiyalar & kelajakdagi modullar (placeholder, drop-in) ---
  { id: "eimzo", labelUz: "E-imzo", icon: KeyRound, href: "/admin/m/eimzo", group: "integratsiya", status: "soon", featureFlag: "eimzo", descUz: "Elektron imzo integratsiyasi" },
  { id: "integration_1c", labelUz: "1C", icon: Boxes, href: "/admin/m/integration_1c", group: "integratsiya", status: "soon", featureFlag: "integration_1c", descUz: "1C bilan sinxronizatsiya" },
  { id: "integration_didox", labelUz: "Didox", icon: FileSignature, href: "/admin/m/integration_didox", group: "integratsiya", status: "soon", featureFlag: "integration_didox", descUz: "Didox EHF integratsiyasi" },
  { id: "integration_soliq", labelUz: "Soliq.uz", icon: Landmark, href: "/admin/m/integration_soliq", group: "integratsiya", status: "soon", featureFlag: "integration_soliq", descUz: "Soliq.uz integratsiyasi" },
  { id: "integration_mysoliq", labelUz: "My.soliq", icon: Landmark, href: "/admin/m/integration_mysoliq", group: "integratsiya", status: "soon", featureFlag: "integration_mysoliq", descUz: "My.soliq integratsiyasi" },
  { id: "invoices", labelUz: "Hisob-fakturalar", icon: Receipt, href: "/admin/m/invoices", group: "integratsiya", status: "soon", featureFlag: "invoices", descUz: "Hisob-faktura moduli" },
  { id: "tasks", labelUz: "Vazifalar", icon: CheckSquare, href: "/admin/m/tasks", group: "integratsiya", status: "soon", featureFlag: "tasks", descUz: "Vazifa boshqaruvi" },
  { id: "contracts", labelUz: "Shartnomalar", icon: FileSignature, href: "/admin/m/contracts", group: "integratsiya", status: "soon", descUz: "Shartnoma shabloni va imzolash" },
];

export function findAdminModule(id: string): AdminModule | undefined {
  return ADMIN_MODULES.find((m) => m.id === id);
}

/** Modules visible to a role (capability-filtered). Overview is always shown. */
export function visibleAdminModules(role: UserRole): AdminModule[] {
  return ADMIN_MODULES.filter(
    (m) => !m.requiredCapability || hasPermission(role, m.requiredCapability)
  );
}
