"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ALLOWED_VIEWS, getHomeRoute, type UserRole } from "@/lib/permissions";
import { useMobileNav } from "@/components/MobileNavContext";
import {
  LayoutDashboard,
  Building2,
  Users,
  FileText,
  TrendingUp,
  Wallet,
  Receipt,
  CreditCard,
  UserCircle,
  ScrollText,
  Calendar,
  Settings,
  Package,
  Bell,
  Banknote,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";

const ALL_NAV_ITEMS = [
  { href: "/dashboard",     view: "dashboard",     label: "Dashboard",   icon: LayoutDashboard, group: "asosiy" },
  { href: "/organizations", view: "organizations", label: "Firmalar",    icon: Building2,       group: "asosiy" },
  { href: "/staff",         view: "staff",         label: "Xodimlar",    icon: Users,           group: "asosiy" },
  { href: "/kpi",           view: "kpi",           label: "KPI",         icon: TrendingUp,      group: "asosiy" },
  { href: "/reports",       view: "reports",       label: "Hisobotlar",  icon: FileText,        group: "moliya" },
  { href: "/kassa",         view: "kassa",         label: "Kassa",       icon: Wallet,          group: "moliya" },
  { href: "/expenses",      view: "expenses",      label: "Xarajatlar",  icon: Receipt,         group: "moliya" },
  { href: "/payroll",       view: "payroll",       label: "Oylik",       icon: CreditCard,      group: "moliya" },
  { href: "/attendance",    view: "attendance",    label: "Davomat",     icon: Calendar,        group: "boshqa" },
  { href: "/documents",     view: "documents",     label: "Hujjatlar",   icon: FileText,        group: "boshqa" },
  { href: "/inventory",     view: "inventory",     label: "Inventar",    icon: Package,         group: "boshqa" },
  { href: "/notifications", view: "notifications", label: "Xabarlar",    icon: Bell,            group: "boshqa" },
  { href: "/cabinet",       view: "cabinet",       label: "Kabinet",     icon: UserCircle,      group: "kabinet" },
  { href: "/cabinet/bank",  view: "cabinet_bank",  label: "Bank",        icon: Banknote,        group: "kabinet" },
  { href: "/admin",         view: "admin",         label: "Admin Panel", icon: ShieldCheck,     group: "admin" },
  { href: "/audit-logs",    view: "audit_logs",    label: "Audit Log",   icon: ScrollText,      group: "admin" },
  { href: "/settings",      view: "settings",      label: "Sozlamalar",  icon: Settings,        group: "admin" },
];

const GROUP_LABELS: Record<string, string> = {
  asosiy: "ASOSIY",
  moliya:  "MOLIYA",
  boshqa:  "BOSHQA",
  kabinet: "KABINET",
  admin:   "ADMIN",
};

interface DashboardSidebarProps {
  userRole: string;
  /** Admin RBAC editoridan kelgan amaldagi view'lar; berilmasa kod default'i. */
  allowedViews?: string[];
}

export function DashboardSidebar({ userRole, allowedViews: allowedViewsProp }: DashboardSidebarProps) {
  const pathname = usePathname();
  const { open, setOpen, collapsed } = useMobileNav();
  const role = userRole as UserRole;
  const allowedViews: string[] = allowedViewsProp ?? ALLOWED_VIEWS[role] ?? [];

  const visibleItems = ALL_NAV_ITEMS.filter((item) =>
    allowedViews.includes(item.view as string)
  );

  // Group items
  const groups = ["asosiy", "moliya", "boshqa", "kabinet", "admin"];

  return (
    <>
    {/* Mobil backdrop */}
    {open && (
      <div className="fixed inset-0 z-30 md:hidden" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setOpen(false)} />
    )}
    <aside
      className={`flex-shrink-0 h-screen flex flex-col z-40 md:z-20 overflow-hidden transition-all duration-300 fixed md:relative top-0 left-0 w-[var(--sidebar-width)] ${open ? "translate-x-0" : "-translate-x-full"} ${collapsed ? "md:w-[72px] md:translate-x-0" : "md:w-[var(--sidebar-width)] md:translate-x-0"}`}
      style={{
        background: "var(--sidebar-bg)",
        borderRight: "1px solid var(--sidebar-border)",
      }}
    >
      {/* Logo */}
      <div
        className={`h-16 flex items-center flex-shrink-0 ${collapsed ? "px-5 md:px-0 md:justify-center" : "px-5"}`}
        style={{ borderBottom: "1px solid var(--sidebar-border)" }}
      >
        <Link
          href={getHomeRoute(userRole)}
          onClick={() => setOpen(false)}
          className={`flex items-center transition-opacity hover:opacity-80 ${collapsed ? "gap-3 md:gap-0" : "gap-3"}`}
          aria-label="Bosh sahifa"
        >
          <Image
            src="/asro-logo-192.png"
            alt="ASRO"
            width={34}
            height={34}
            priority
            className="w-[34px] h-[34px] object-contain shrink-0"
          />
          <div className={collapsed ? "md:hidden" : ""}>
            <h1
              className="text-[16px] font-black tracking-tight leading-none"
              style={{ color: "var(--text-primary)" }}
            >
              ASRO
            </h1>
            <p
              className="text-[9px] font-semibold uppercase tracking-widest leading-none mt-0.5"
              style={{ color: "var(--text-muted)" }}
            >
              Boshqaruv tizimi
            </p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 scrollbar-hide space-y-0.5">
        {groups.map((group) => {
          const groupItems = visibleItems.filter((item) => item.group === group);
          if (groupItems.length === 0) return null;

          return (
            <div key={group}>
              <div className={`sidebar-label ${collapsed ? "md:hidden" : ""}`}>{GROUP_LABELS[group]}</div>
              {groupItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/cabinet" && pathname.startsWith(item.href + "/")) ||
                  (item.href === "/cabinet" && pathname === "/cabinet") ||
                  (item.href === "/cabinet/bank" && pathname.startsWith("/cabinet/bank"));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    title={collapsed ? item.label : undefined}
                    className={`sidebar-nav-item ${isActive ? "active" : ""} ${collapsed ? "md:justify-center" : ""}`}
                    style={
                      isActive
                        ? {
                            background: "var(--sidebar-item-active-bg)",
                            color: "var(--sidebar-item-active-text)",
                          }
                        : {}
                    }
                  >
                    <Icon
                      size={17}
                      className="flex-shrink-0"
                      style={{ opacity: isActive ? 1 : 0.7 }}
                    />
                    <span className={`flex-1 text-[13px] font-medium ${collapsed ? "md:hidden" : ""}`}>{item.label}</span>
                    {isActive && (
                      <ChevronRight
                        size={14}
                        className={`flex-shrink-0 opacity-60 ${collapsed ? "md:hidden" : ""}`}
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Bottom - Settings quick link */}
      <div
        className="p-3 flex-shrink-0"
        style={{ borderTop: "1px solid var(--sidebar-border)" }}
      >
        <div
          className={`flex items-center gap-2 py-2 rounded-lg ${collapsed ? "px-3 md:px-0 md:justify-center" : "px-3"}`}
          style={{ background: "var(--bg-hover)" }}
        >
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-black text-white flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #2563EB, #4F46E5)" }}
          >
            {userRole?.charAt(0)?.toUpperCase() || "U"}
          </div>
          <div className={`flex-1 min-w-0 ${collapsed ? "md:hidden" : ""}`}>
            <p
              className="text-[11px] font-semibold truncate leading-none"
              style={{ color: "var(--text-primary)" }}
            >
              {role === "super_admin"
                ? "Super Admin"
                : role === "chief_accountant"
                ? "Bosh Buxgalter"
                : role === "accountant"
                ? "Buxgalter"
                : role === "supervisor"
                ? "Nazoratchi"
                : role || "Foydalanuvchi"}
            </p>
            <p
              className="text-[10px] mt-0.5 leading-none"
              style={{ color: "var(--text-muted)" }}
            >
              Faol
            </p>
          </div>
        </div>
      </div>
    </aside>
    </>
  );
}
