import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Building2,
  ShieldCheck,
  Settings,
  ScrollText,
  FileText,
  Boxes,
  CheckSquare,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  Coins,
  UserPlus } from "lucide-react";
import {
  hasPermission,
  type Capability,
  type UserRole } from "@/lib/platform/permissions";

export type AdminModuleGroup = "tizim" | "moliya" | "integratsiya";

export interface AdminModule {
  id: string;
  labelUz: string;
  icon: LucideIcon;
  href: string;
  group: AdminModuleGroup;
  /** Capability required to see this module (from lib/permissions). */
  requiredCapability?: Capability;
  /**
   * Har bir yozuv haqiqiy sahifaga olib boradi. Ilgari 'soon' holati bo'lgan —
   * u bo'sh joy egallagan 6 ta plagini ko'rsatardi; ular olib tashlandi.
   * Rejalashtirilgan integratsiyalar docs/ICEBOX.md da yashaydi, admin
   * panelida emas.
   */
  status: "ready";
  /** Short description shown on the overview grid. */
  descUz?: string;
}

export const ADMIN_GROUP_LABELS: Record<AdminModuleGroup, string> = {
  tizim: "TIZIM",
  moliya: "MOLIYA",
  integratsiya: "INTEGRATSIYALAR" };

// ---------------------------------------------------------------------------
// THE REGISTRY — the single source of truth for the admin panel.
// Add a new admin section by appending one entry here (+ a page for 'ready').
// ---------------------------------------------------------------------------
export const ADMIN_MODULES: AdminModule[] = [
  // --- Tizim (built now) ---
  { id: "overview", labelUz: "Boshqaruv paneli", icon: LayoutDashboard, href: "/admin", group: "tizim", status: "ready", descUz: "Umumiy ko'rsatkichlar va tezkor havolalar" },
  { id: "users", labelUz: "Foydalanuvchilar", icon: Users, href: "/admin/users", group: "tizim", status: "ready", requiredCapability: "manage_users", descUz: "Xodimlar, rollar, parollar" },
  { id: "departments", labelUz: "Bo'limlar", icon: Building2, href: "/admin/departments", group: "tizim", status: "ready", requiredCapability: "manage_staff", descUz: "Bo'lim va bosh buxgalter tayinlash" },
  { id: "roles", labelUz: "Rollar & Ruxsatlar", icon: ShieldCheck, href: "/admin/roles", group: "tizim", status: "ready", requiredCapability: "manage_system", descUz: "Rol-ruxsat matritsasi" },
  { id: "settings", labelUz: "Tizim sozlamalari", icon: Settings, href: "/admin/settings", group: "tizim", status: "ready", requiredCapability: "manage_system", descUz: "Global konfiguratsiya va modullar" },
  { id: "audit", labelUz: "Audit jurnali", icon: ScrollText, href: "/admin/audit", group: "tizim", status: "ready", requiredCapability: "view_audit_logs", descUz: "Tizimdagi o'zgarishlar tarixi" },
  { id: "operation_matrix", labelUz: "Amallar matritsasi", icon: FileText, href: "/admin/operation-matrix", group: "tizim", status: "ready", requiredCapability: "manage_system", descUz: "Hisobot ustunlarini yoqish/o'chirish, tartiblash, nomlash" },
  { id: "client_portal", labelUz: "Mijoz kabineti", icon: UserPlus, href: "/admin/client-users", group: "tizim", status: "ready", requiredCapability: "manage_system", descUz: "Mijoz hisoblari (portal login) va murojaatlar" },
  { id: "deadline_templates", labelUz: "Muddat shablonlari", icon: CalendarClock, href: "/admin/deadline-templates", group: "tizim", status: "ready", requiredCapability: "manage_system", descUz: "Soliq muddat shablonlari — versiyalash, lifecycle, applicability" },
  { id: "business_calendar", labelUz: "Biznes kalendar", icon: CalendarDays, href: "/admin/business-calendar", group: "tizim", status: "ready", requiredCapability: "manage_system", descUz: "Ish/dam olish/bayram kunlari — muddat surish uchun" },

  // NOTE: Moliya sahifalari (Firmalar, Kassa, Hisobotlar, Oylik, KPI, Hujjatlar)
  // asosiy menyuda bor — bu yerda takrorlanmaydi. Admin panel = tizim boshqaruvi.
  // Oy yopilishi — istisno: bu buxgalteriya BOSHQARUVI (davr qulfi, snapshot),
  // kunlik moliya sahifasi emas.
  { id: "month_closing", labelUz: "Oy yopilishi", icon: CalendarCheck2, href: "/admin/month-closing", group: "moliya", status: "ready", requiredCapability: "manage_system", descUz: "Month-end closing: checklist, snapshot, davr qulfi" },
  { id: "cost_rates", labelUz: "Xodim tannarxi", icon: Coins, href: "/admin/cost-rates", group: "moliya", status: "ready", requiredCapability: "manage_system", descUz: "Xodim soatlik qiymati (effective-dated) — rentabellik uchun" },

  // --- Integratsiyalar & kelajakdagi modullar (placeholder, drop-in) ---
  { id: "integration_1c", labelUz: "1C integratsiya", icon: Boxes, href: "/admin/integration-1c", group: "integratsiya", status: "ready", requiredCapability: "manage_system", descUz: "Agent ulanishlari, firma mapping, sync holati (DLQ)" },
  { id: "sla_policies", labelUz: "SLA siyosatlari", icon: CheckSquare, href: "/admin/sla-policies", group: "tizim", status: "ready", requiredCapability: "manage_system", descUz: "Vazifa SLA siyosatlari (javob/yechim muddati)" },
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
