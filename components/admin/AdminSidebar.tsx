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

const GROUP_ORDER: AdminModuleGroup[] = ["tizim", "moliya", "integratsiya"];

export function AdminSidebar({ userRole }: { userRole: string }) {
  const pathname = usePathname();
  const modules = visibleAdminModules(userRole as UserRole);

  return (
    <aside
      className="flex-shrink-0 flex flex-col overflow-y-auto scrollbar-hide"
      style={{
        width: "230px",
        background: "var(--card-bg)",
        borderRight: "1px solid var(--card-border)",
      }}
    >
      <div
        className="px-4 py-4 flex items-center gap-2"
        style={{ borderBottom: "1px solid var(--card-border)" }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
          style={{ background: "linear-gradient(135deg, #7C3AED, #4F46E5)" }}
        >
          <span className="text-[13px] font-black">A</span>
        </div>
        <div>
          <h2 className="text-[13px] font-black leading-none" style={{ color: "var(--text-primary)" }}>
            Admin Panel
          </h2>
          <p className="text-[9px] font-bold uppercase tracking-widest mt-0.5" style={{ color: "var(--text-muted)" }}>
            Boshqaruv markazi
          </p>
        </div>
      </div>

      <nav className="flex-1 py-3 px-2.5 space-y-3">
        {GROUP_ORDER.map((group) => {
          const items = modules.filter((m) => m.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group}>
              <div className="px-2 mb-1 text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                {ADMIN_GROUP_LABELS[group]}
              </div>
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
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] font-semibold transition-all"
                      style={
                        active
                          ? { background: "var(--accent-blue)", color: "#fff" }
                          : { color: "var(--text-secondary)" }
                      }
                    >
                      <Icon size={15} className="shrink-0" />
                      <span className="truncate">{m.labelUz}</span>
                      {m.status === "soon" && (
                        <span
                          className="ml-auto text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
                          style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
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
        className="m-2.5 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all"
        style={{ border: "1px solid var(--card-border)", color: "var(--text-muted)" }}
      >
        <ArrowLeft size={13} /> Tizimga qaytish
      </Link>
    </aside>
  );
}
