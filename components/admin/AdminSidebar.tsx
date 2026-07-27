"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  visibleAdminModules,
  ADMIN_GROUP_LABELS,
  type AdminModuleGroup,
} from "@/lib/admin/registry";
import type { UserRole } from "@/lib/permissions";
import { useMobileNav } from "@/components/MobileNavContext";

const GROUP_ORDER: AdminModuleGroup[] = ["tizim", "moliya", "integratsiya"];

export function AdminSidebar({ userRole }: { userRole: string }) {
  const pathname = usePathname();
  const modules = visibleAdminModules(userRole as UserRole);
  const { open, setOpen } = useMobileNav();

  return (
    <>
    {/* Mobil backdrop */}
    {open && (
      <div
        className="fixed inset-0 md:hidden"
        style={{ background: "rgba(6,10,15,0.55)", zIndex: "var(--z-backdrop)" }}
        onClick={() => setOpen(false)}
      />
    )}
    <aside
      className={`flex-shrink-0 flex flex-col overflow-y-auto scrollbar-hide h-dvh md:h-auto transition-transform duration-200 ease-out fixed md:relative top-0 left-0 md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      style={{
        width: "230px",
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--rule)",
        zIndex: "var(--z-panel)",
      }}
    >
      <div
        className="px-4 h-16 flex items-center gap-2.5 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--rule)" }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center font-mono text-body font-bold"
          style={{ background: "var(--accent-purple-light)", color: "var(--accent-purple)" }}
        >
          A
        </div>
        <div>
          <h2 className="text-sm font-semibold leading-none" style={{ color: "var(--text-primary)" }}>
            Admin Panel
          </h2>
          <p
            className="font-mono text-micro font-medium uppercase mt-1 leading-none"
            style={{ color: "var(--text-muted)", letterSpacing: "0.14em" }}
          >
            Boshqaruv markazi
          </p>
        </div>
      </div>

      <nav className="flex-1 py-2 px-2.5">
        {GROUP_ORDER.map((group) => {
          const items = modules.filter((m) => m.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group}>
              <div className="sidebar-label">{ADMIN_GROUP_LABELS[group]}</div>
              <div className="space-y-0.5">
                {items.map((m) => {
                  const Icon = m.icon;
                  const active =
                    m.href === "/admin"
                      ? pathname === "/admin"
                      : pathname === m.href || pathname.startsWith(m.href + "/");
                  return (
                    <Link
                      key={m.id}
                      href={m.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`sidebar-nav-item ${active ? "active" : ""}`}
                    >
                      <Icon size={16} className="shrink-0" />
                      <span className="truncate flex-1">{m.labelUz}</span>
                      {m.status === "soon" && (
                        <span
                          className="ml-auto font-mono text-micro font-semibold px-1.5 py-0.5 rounded uppercase"
                          style={{
                            background: "var(--warning-bg)",
                            color: "var(--warning)",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Soon
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <Link
        href="/dashboard"
        onClick={() => setOpen(false)}
        className="m-2.5 flex-shrink-0 flex items-center justify-center gap-2 px-3 h-11 rounded-lg font-mono text-micro font-semibold uppercase transition-colors duration-100 hover:bg-[var(--bg-hover)]"
        style={{
          border: "1px solid var(--rule-strong)",
          color: "var(--text-secondary)",
          letterSpacing: "0.1em",
        }}
      >
        <ArrowLeft size={14} /> Tizimga qaytish
      </Link>
    </aside>
    </>
  );
}
