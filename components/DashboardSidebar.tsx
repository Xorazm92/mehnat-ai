"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ALLOWED_VIEWS, ROLE_LABELS, type UserRole } from "@/lib/permissions";
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
  TrainFront
} from "lucide-react";

const ALL_NAV_ITEMS = [
  { href: "/dashboard", view: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/organizations", view: "organizations", label: "Firmalar", icon: Building2 },
  { href: "/staff", view: "staff", label: "Xodimlar", icon: Users },
  { href: "/reports", view: "reports", label: "Hisobotlar", icon: FileText },
  { href: "/kpi", view: "kpi", label: "KPI", icon: TrendingUp },
  { href: "/kassa", view: "kassa", label: "Kassa", icon: Wallet },
  { href: "/expenses", view: "expenses", label: "Xarajatlar", icon: Receipt },
  { href: "/payroll", view: "payroll", label: "Oylik", icon: CreditCard },
  { href: "/attendance", view: "attendance", label: "Davomat", icon: Calendar },
  { href: "/documents", view: "documents", label: "Hujjatlar", icon: FileText },
  { href: "/inventory", view: "inventory", label: "Inventar", icon: Package },
  { href: "/notifications", view: "notifications", label: "Xabarlar", icon: Bell },
  // Kabinetlar
  { href: "/cabinet", view: "cabinet", label: "Kabinet", icon: UserCircle },
  { href: "/cabinet/bank", view: "cabinet_bank", label: "Bank Kabinet", icon: Banknote },
  // Admin
  { href: "/audit-logs", view: "audit_logs", label: "Audit Log", icon: ScrollText },
  { href: "/settings", view: "settings", label: "Sozlamalar", icon: Settings },
];

interface DashboardSidebarProps {
  userRole: string;
}

export function DashboardSidebar({ userRole }: DashboardSidebarProps) {
  const pathname = usePathname();
  const role = userRole as UserRole;
  const allowedViews = ALLOWED_VIEWS[role] || [];
  
  const visibleItems = ALL_NAV_ITEMS.filter((item) =>
    allowedViews.includes(item.view as any)
  );

  return (
    <aside className="w-20 flex-shrink-0 h-screen bg-bg-secondary border-r border-border-glass flex flex-col items-center z-20 relative">
      {/* Logo qismi (Figma: UTY BI logosi uchun joy) */}
      <div className="h-20 w-full flex items-center justify-center border-b border-border-glass">
         <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-accent-blue/10 text-accent-blue">
            <TrainFront size={24} />
         </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 w-full p-4 space-y-4 overflow-y-auto scrollbar-hide flex flex-col items-center">
        {visibleItems.map((item) => {
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
              title={item.label}
              className={`w-12 h-12 flex items-center justify-center rounded-2xl transition-all duration-200 group relative ${
                isActive
                  ? "bg-accent-blue text-white shadow-md shadow-accent-blue/30"
                  : "text-text-secondary hover:text-accent-blue hover:bg-accent-blue/10 border border-transparent"
              }`}
            >
              <Icon
                size={22}
                className={`transition-colors ${
                  isActive ? "text-white" : ""
                }`}
              />
              
              {/* Tooltip */}
              <div className="absolute left-14 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>
      
      <div className="w-full p-4 border-t border-border-glass flex items-center justify-center">
        <div className="w-10 h-10 rounded-full bg-bg-primary flex items-center justify-center border border-border-glass text-text-secondary">
          <Settings size={20} />
        </div>
      </div>
    </aside>
  );
}
