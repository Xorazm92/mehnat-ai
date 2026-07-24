"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Building2, FileText, TrendingUp, Wallet, Receipt,
  UserCircle, Bell, Menu, Banknote,
} from "lucide-react";
import { canSeeView, type UserRole, type AppView } from "@/lib/permissions";
import { useMobileNav } from "@/components/MobileNavContext";

// Pastki panel uchun nomzod tugmalar (muhimlik tartibida). Rol ko'ra oladiganlari olinadi.
const CANDIDATES: { view: AppView; href: string; label: string; icon: React.ElementType }[] = [
  { view: "dashboard", href: "/dashboard", label: "Bosh", icon: LayoutDashboard },
  { view: "cabinet", href: "/cabinet", label: "Kabinet", icon: UserCircle },
  { view: "cabinet_bank", href: "/cabinet/bank", label: "Bank", icon: Banknote },
  { view: "organizations", href: "/organizations", label: "Firmalar", icon: Building2 },
  { view: "reports", href: "/reports", label: "Hisobot", icon: FileText },
  { view: "kpi", href: "/kpi", label: "KPI", icon: TrendingUp },
  { view: "kassa", href: "/kassa", label: "Kassa", icon: Wallet },
  { view: "expenses", href: "/expenses", label: "Xarajat", icon: Receipt },
  { view: "notifications", href: "/notifications", label: "Xabar", icon: Bell },
];

export function MobileBottomNav({ userRole, allowedViews }: { userRole: string; allowedViews?: string[] }) {
  const pathname = usePathname();
  const { toggle } = useMobileNav();
  const role = userRole as UserRole;

  const canSee = (v: AppView) => (allowedViews ? allowedViews.includes(v) : canSeeView(role, v));
  const items = CANDIDATES.filter((c) => canSee(c.view)).slice(0, 4);

  const isActive = (href: string) =>
    pathname === href || (href !== "/cabinet" && pathname.startsWith(href + "/")) ||
    (href === "/cabinet" && pathname === "/cabinet");

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 flex items-stretch"
      style={{
        background: "var(--bg-secondary)",
        borderTop: "1px solid var(--rule-strong)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        height: "calc(60px + env(safe-area-inset-bottom, 0px))",
        zIndex: "var(--z-nav)",
      }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            // Faol band ustidagi jonli chiziq — sidebar bilan bir xil belgi.
            className={`relative flex-1 flex flex-col items-center justify-center gap-1 transition-colors duration-100 ${active ? "live-rule-top" : ""}`}
            style={{ color: active ? "var(--brand)" : "var(--text-muted)" }}
          >
            <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
            <span className="font-mono text-micro font-semibold">{item.label}</span>
          </Link>
        );
      })}
      {/* Yana — to'liq menyu (sidebar drawer) */}
      <button
        onClick={toggle}
        className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors duration-100"
        style={{ color: "var(--text-muted)" }}
        aria-label="Yana"
      >
        <Menu size={20} strokeWidth={1.8} />
        <span className="font-mono text-micro font-semibold">Yana</span>
      </button>
    </nav>
  );
}
