import {
  LayoutDashboard, Building2, Users, FileText, Wallet, Receipt, CreditCard,
  Calendar, TrendingUp, Settings, Bell, Package, ScrollText, UserCircle,
  Banknote, HandCoins, CalendarClock, CheckSquare, Scale, ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { AppView } from "@/lib/permissions";

/**
 * NAVIGATSIYA REYESTRI — YAGONA manba.
 *
 * Bungacha ikkita alohida ro'yxat bor edi va ular ajralib ketgandi:
 * `DashboardSidebar` 21 ta manzilni bilardi, `GlobalSearch` esa atigi 10 tasini.
 * Ya'ni Muddatlar, Vazifalar, Rentabellik, Hujjatlar, Inventar, Sozlamalar,
 * Admin va Audit jurnali qidiruvda UMUMAN topilmasdi.
 *
 * Yangi bo'lim qo'shilganda shu yerga bir marta yoziladi — ikkalasi ham oladi.
 */

export type NavGroup = "asosiy" | "moliya" | "boshqa" | "kabinet" | "admin";

export interface NavItem {
  href: string;
  view: AppView;
  label: string;
  icon: LucideIcon;
  group: NavGroup;
  /** Qidiruv uchun qo'shimcha kalit so'zlar (sinonim, ruscha, xato yozilishi) */
  keywords?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",     view: "dashboard",     label: "Boshqaruv paneli", icon: LayoutDashboard, group: "asosiy",  keywords: "dashboard bosh sahifa asosiy" },
  { href: "/organizations", view: "organizations", label: "Firmalar",         icon: Building2,       group: "asosiy",  keywords: "korxona kompaniya mijoz tashkilot" },
  { href: "/staff",         view: "staff",         label: "Xodimlar",         icon: Users,           group: "asosiy",  keywords: "hodim kadr jamoa xizmatchi" },
  { href: "/kpi",           view: "kpi",           label: "KPI",              icon: TrendingUp,      group: "asosiy",  keywords: "reyting ball ko'rsatkich" },
  { href: "/fair-kpi",      view: "fair_kpi",      label: "Adolatli KPI",     icon: Scale,           group: "asosiy",  keywords: "fair kpi adolat" },
  { href: "/deadlines",     view: "deadlines",     label: "Muddatlar",        icon: CalendarClock,   group: "asosiy",  keywords: "muddat deadline kechikish" },
  { href: "/tasks",         view: "tasks",         label: "Vazifalar",        icon: CheckSquare,     group: "asosiy",  keywords: "vazifa topshiriq task" },
  { href: "/reports",       view: "reports",       label: "Hisobotlar",       icon: FileText,        group: "moliya",  keywords: "hisobot matritsa report" },
  { href: "/profitability", view: "profitability", label: "Rentabellik",      icon: HandCoins,       group: "moliya",  keywords: "foyda rentabellik marja" },
  { href: "/kassa",         view: "kassa",         label: "Kassa",            icon: Wallet,          group: "moliya",  keywords: "kirim to'lov naqd" },
  { href: "/expenses",      view: "expenses",      label: "Xarajatlar",       icon: Receipt,         group: "moliya",  keywords: "chiqim xarajat rasxod" },
  { href: "/payroll",       view: "payroll",       label: "Oylik",            icon: CreditCard,      group: "moliya",  keywords: "maosh zarplata avans" },
  { href: "/attendance",    view: "attendance",    label: "Davomat",          icon: Calendar,        group: "boshqa",  keywords: "kelish ketish tabel" },
  { href: "/documents",     view: "documents",     label: "Hujjatlar",        icon: FileText,        group: "boshqa",  keywords: "hujjat fayl arxiv" },
  { href: "/inventory",     view: "inventory",     label: "Inventar",         icon: Package,         group: "boshqa",  keywords: "jihoz inventar texnika" },
  { href: "/notifications", view: "notifications", label: "Xabarlar",         icon: Bell,            group: "boshqa",  keywords: "bildirishnoma xabar" },
  { href: "/cabinet",       view: "cabinet",       label: "Mening kabinetim", icon: UserCircle,      group: "kabinet", keywords: "profil shaxsiy kabinet" },
  { href: "/cabinet/bank",  view: "cabinet_bank",  label: "Bank kabineti",    icon: Banknote,        group: "kabinet", keywords: "bank klient" },
  { href: "/admin",         view: "admin",         label: "Admin panel",      icon: ShieldCheck,     group: "admin",   keywords: "admin sozlash boshqaruv" },
  { href: "/audit-logs",    view: "audit_logs",    label: "Audit jurnali",    icon: ScrollText,      group: "admin",   keywords: "audit jurnal log tarix" },
  { href: "/settings",      view: "settings",      label: "Sozlamalar",       icon: Settings,        group: "admin",   keywords: "sozlama parametr settings" },
];

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  asosiy: "ASOSIY",
  moliya: "MOLIYA",
  boshqa: "BOSHQA",
  kabinet: "KABINET",
  admin: "ADMIN",
};
