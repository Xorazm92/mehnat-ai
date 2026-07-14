// lib/permissions.ts
// Role-based access control — mavjud permissions.ts dan ko'chirildi va yangilandi

export const ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  CHIEF_ACCOUNTANT: "chief_accountant",
  SUPERVISOR: "supervisor",
  ACCOUNTANT: "accountant",
  BANK_MANAGER: "bank_manager",
} as const;

export type UserRole = (typeof ROLES)[keyof typeof ROLES];

export type AppView =
  | "dashboard"
  | "organizations"
  | "staff"
  | "reports"
  | "kpi"
  | "kassa"
  | "expenses"
  | "cabinet"
  | "cabinet_bank"
  | "payroll"
  | "audit_logs"
  | "attendance"
  | "documents"
  | "inventory"
  | "notifications"
  | "settings"
  | "admin";

export type Capability =
  | "view_all_companies"
  | "edit_contracts"
  | "manage_staff"
  | "view_salaries"
  | "approve_kpi"
  | "process_payments"
  | "view_audit_logs"
  | "manage_users"
  | "manage_system"
  | "view_bank_operations"
  | "view_own_kpi"
  | "submit_reports";

export const ROLE_PERMISSIONS: Record<UserRole, Capability[]> = {
  [ROLES.SUPER_ADMIN]: [
    "view_all_companies",
    "edit_contracts",
    "manage_staff",
    "view_salaries",
    "approve_kpi",
    "process_payments",
    "view_audit_logs",
    "manage_users",
    "manage_system",
    "view_bank_operations",
    "view_own_kpi",
    "submit_reports",
  ],
  [ROLES.ADMIN]: [
    "view_all_companies",
    "edit_contracts",
    "manage_staff",
    "view_salaries",
    "approve_kpi",
    "process_payments",
    "view_audit_logs",
    "manage_users",
    "view_bank_operations",
    "view_own_kpi",
    "submit_reports",
  ],
  [ROLES.CHIEF_ACCOUNTANT]: [
    "view_all_companies",
    "manage_staff",
    "view_salaries",
    "approve_kpi",
    "view_own_kpi",
    "submit_reports",
  ],
  [ROLES.SUPERVISOR]: [
    "view_all_companies",
    "manage_staff",
    "approve_kpi",
    "view_salaries",
    "view_own_kpi",
    "submit_reports",
  ],
  [ROLES.ACCOUNTANT]: [
    "view_own_kpi",
    "submit_reports",
  ],
  [ROLES.BANK_MANAGER]: [
    "process_payments",
    "view_bank_operations",
    "view_own_kpi",
    "submit_reports",
  ],
};

export const ALLOWED_VIEWS: Record<UserRole, AppView[]> = {
  [ROLES.SUPER_ADMIN]: [
    "dashboard",
    "organizations",
    "staff",
    "reports",
    "kpi",
    "kassa",
    "expenses",
    "cabinet",
    "payroll",
    "audit_logs",
    "attendance",
    "documents",
    "inventory",
    "notifications",
    "settings",
    "admin",
  ],
  [ROLES.ADMIN]: [
    "dashboard",
    "organizations",
    "staff",
    "reports",
    "kpi",
    "kassa",
    "expenses",
    "cabinet",
    "payroll",
    "audit_logs",
    "attendance",
    "documents",
    "notifications",
    "admin",
  ],
  [ROLES.CHIEF_ACCOUNTANT]: [
    "dashboard",
    "organizations",
    "staff",
    "reports",
    "kpi",
    "kassa",
    "expenses",
    "cabinet",
    "payroll",
    "attendance",
    "documents",
    "notifications",
  ],
  [ROLES.SUPERVISOR]: [
    "dashboard",
    "organizations",
    "staff",
    "reports",
    "kpi",
    "expenses",
    "cabinet",
    "attendance",
    "notifications",
  ],
  [ROLES.ACCOUNTANT]: [
    "cabinet",
    "reports",
    "notifications",
  ],
  [ROLES.BANK_MANAGER]: [
    "cabinet",
    "cabinet_bank",
    "kassa",
    "expenses",
    "notifications",
  ],
};

// Rolga mos boshlang'ich yo'nalish (login bo'lgandan keyin)
export const ROLE_HOME_ROUTES: Record<UserRole, string> = {
  [ROLES.SUPER_ADMIN]: "/dashboard",
  [ROLES.ADMIN]: "/dashboard",
  [ROLES.CHIEF_ACCOUNTANT]: "/dashboard",
  [ROLES.SUPERVISOR]: "/dashboard",
  [ROLES.ACCOUNTANT]: "/cabinet",
  [ROLES.BANK_MANAGER]: "/cabinet/bank",
};

// Rol uchun o'zbek nomi
export const ROLE_LABELS: Record<UserRole, string> = {
  [ROLES.SUPER_ADMIN]: "Superadmin",
  [ROLES.ADMIN]: "Admin",
  [ROLES.CHIEF_ACCOUNTANT]: "Bosh Buxgalter",
  [ROLES.SUPERVISOR]: "Nazoratchi",
  [ROLES.ACCOUNTANT]: "Buxgalter",
  [ROLES.BANK_MANAGER]: "Bank-Klient",
};

// Rol uchun rang (badge)
export const ROLE_COLORS: Record<UserRole, string> = {
  [ROLES.SUPER_ADMIN]: "#ef4444",  // qizil
  [ROLES.ADMIN]: "#f97316",        // to'q sariq
  [ROLES.CHIEF_ACCOUNTANT]: "#8b5cf6", // binafsha
  [ROLES.SUPERVISOR]: "#3b82f6",   // ko'k
  [ROLES.ACCOUNTANT]: "#10b981",   // yashil
  [ROLES.BANK_MANAGER]: "#06b6d4", // moviy
};

// Barcha view'lar ro'yxati (AppView union bilan mos) — admin RBAC editori uchun
export const ALL_VIEWS: AppView[] = [
  "dashboard",
  "organizations",
  "staff",
  "reports",
  "kpi",
  "kassa",
  "expenses",
  "cabinet",
  "cabinet_bank",
  "payroll",
  "audit_logs",
  "attendance",
  "documents",
  "inventory",
  "notifications",
  "settings",
  "admin",
];

export const VIEW_LABELS: Record<AppView, string> = {
  dashboard: "Boshqaruv paneli",
  organizations: "Firmalar",
  staff: "Xodimlar",
  reports: "Hisobotlar",
  kpi: "KPI",
  kassa: "Kassa",
  expenses: "Xarajatlar",
  cabinet: "Kabinet",
  cabinet_bank: "Bank kabineti",
  payroll: "Oylik",
  audit_logs: "Audit jurnali",
  attendance: "Davomat",
  documents: "Hujjatlar",
  inventory: "Inventar",
  notifications: "Xabarlar",
  settings: "Sozlamalar",
  admin: "Admin panel",
};

// Admin tomonidan tahrirlanadigan rol→view override'lari (SystemSetting: "roleViews")
export type RoleViewOverrides = Partial<Record<UserRole, AppView[]>>;

/**
 * Rol uchun AMALDAGI view'lar: override bo'lsa o'sha, aks holda kodдаgi default.
 * Bu faqat KO'RINISHNI (menyu/nav) boshqaradi — server xavfsizlik tekshiruvlari
 * (isSeniorRole/isAdminRole/rol massivlari) o'z kuchida qoladi.
 */
export const effectiveViewsForRole = (
  role: UserRole,
  overrides?: RoleViewOverrides | null
): AppView[] => {
  // Superadmin hamma narsani ko'radi — hech qachon cheklanmaydi (o'zini bloklamaslik)
  if (role === "super_admin") return ALL_VIEWS;
  const ov = overrides?.[role];
  if (ov && Array.isArray(ov)) return ov;
  return ALLOWED_VIEWS[role] || [];
};

export const canSeeView = (role: UserRole, viewId: string): boolean => {
  return ALLOWED_VIEWS[role]?.includes(viewId as AppView) || false;
};

// Override'larni hisobga oluvchi variant (server komponent/gate'lar uchun)
export const canSeeViewWith = (
  role: UserRole,
  viewId: string,
  overrides?: RoleViewOverrides | null
): boolean => {
  return effectiveViewsForRole(role, overrides).includes(viewId as AppView);
};

export const hasPermission = (
  role: UserRole,
  capability: Capability
): boolean => {
  return ROLE_PERMISSIONS[role]?.includes(capability) || false;
};

export const isAdminRole = (role: string): boolean => {
  return (["super_admin", "admin"] as string[]).includes(role);
};

export const isSeniorRole = (role: string): boolean => {
  return (["super_admin", "admin", "chief_accountant", "supervisor"] as string[]).includes(role);
};

export const getHomeRoute = (role: string): string => {
  return ROLE_HOME_ROUTES[role as UserRole] || "/dashboard";
};
