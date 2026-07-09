import React from "react";
import Link from "next/link";
import { Users, Building, TrendingUp, ShieldCheck, ScrollText } from "lucide-react";
import {
  visibleAdminModules,
  ADMIN_GROUP_LABELS,
  type AdminModuleGroup,
} from "@/lib/admin/registry";
import { ROLE_LABELS, type UserRole } from "@/lib/permissions";

interface AuditRow {
  id: string;
  action: string;
  tableName: string;
  createdAt: string;
  user?: { fullName?: string } | null;
}

interface Props {
  role: string;
  stats: {
    totalUsers: number;
    activeUsers: number;
    byRole: Record<string, number>;
    companies: number;
    kpiRules: number;
  };
  recentAudit: AuditRow[];
}

const GROUP_ORDER: AdminModuleGroup[] = ["tizim", "moliya", "integratsiya"];

const AUDIT_FMT = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Asia/Tashkent",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function AdminOverview({ role, stats, recentAudit }: Props) {
  const modules = visibleAdminModules(role as UserRole);

  const tiles = [
    { label: "Foydalanuvchilar", value: stats.totalUsers, sub: `${stats.activeUsers} faol`, icon: Users, color: "var(--accent-blue)" },
    { label: "Firmalar", value: stats.companies, sub: "faol", icon: Building, color: "var(--success)" },
    { label: "KPI qoidalari", value: stats.kpiRules, sub: "faol", icon: TrendingUp, color: "var(--accent-indigo, #6366F1)" },
    { label: "Rollar", value: Object.keys(stats.byRole).length, sub: "tizimda", icon: ShieldCheck, color: "var(--warning)" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>
          Boshqaruv paneli
        </h1>
        <p className="text-[13px] font-medium mt-1" style={{ color: "var(--text-muted)" }}>
          Tizim boshqaruvi va tezkor havolalar
        </p>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <div
              key={t.label}
              className="p-4 rounded-xl"
              style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                  {t.label}
                </span>
                <Icon size={16} style={{ color: t.color }} />
              </div>
              <div className="mt-2 text-3xl font-black tabular-nums" style={{ color: "var(--text-primary)" }}>
                {t.value}
              </div>
              <div className="text-[11px] font-semibold mt-0.5" style={{ color: "var(--text-muted)" }}>
                {t.sub}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Module launcher grid */}
        <div className="lg:col-span-2 space-y-5">
          {GROUP_ORDER.map((group) => {
            const items = modules.filter((m) => m.group === group && m.id !== "overview");
            if (!items.length) return null;
            return (
              <div key={group}>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>
                  {ADMIN_GROUP_LABELS[group]}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {items.map((m) => {
                    const Icon = m.icon;
                    return (
                      <Link
                        key={m.id}
                        href={m.href}
                        className="group p-3.5 rounded-xl transition-all hover:-translate-y-0.5"
                        style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
                      >
                        <div className="flex items-center justify-between">
                          <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center"
                            style={{ background: "var(--accent-blue-light)", color: "var(--accent-blue)" }}
                          >
                            <Icon size={17} />
                          </div>
                          {m.status === "soon" && (
                            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
                              Soon
                            </span>
                          )}
                        </div>
                        <div className="mt-2.5 text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>
                          {m.labelUz}
                        </div>
                        {m.descUz && (
                          <div className="text-[10px] font-medium mt-0.5 leading-tight" style={{ color: "var(--text-muted)" }}>
                            {m.descUz}
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right column: role breakdown + recent audit */}
        <div className="space-y-6">
          <div className="p-4 rounded-xl" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
            <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
              Rollar bo'yicha
            </div>
            <div className="space-y-2">
              {Object.entries(stats.byRole).map(([r, n]) => (
                <div key={r} className="flex items-center justify-between text-[12px]">
                  <span style={{ color: "var(--text-secondary)" }}>
                    {ROLE_LABELS[r as UserRole] ?? r}
                  </span>
                  <span className="font-black tabular-nums" style={{ color: "var(--text-primary)" }}>{n}</span>
                </div>
              ))}
              {Object.keys(stats.byRole).length === 0 && (
                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Ma'lumot yo'q</div>
              )}
            </div>
          </div>

          <div className="p-4 rounded-xl" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
            <div className="flex items-center gap-2 mb-3">
              <ScrollText size={13} style={{ color: "var(--text-muted)" }} />
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                So'nggi harakatlar
              </span>
            </div>
            <div className="space-y-2.5">
              {recentAudit.slice(0, 8).map((a) => (
                <div key={a.id} className="text-[11px] leading-tight">
                  <div className="font-semibold" style={{ color: "var(--text-secondary)" }}>
                    <span className="font-bold" style={{ color: "var(--text-primary)" }}>{a.action}</span> · {a.tableName}
                  </div>
                  <div style={{ color: "var(--text-muted)" }}>
                    {a.user?.fullName ?? "Tizim"} — {AUDIT_FMT.format(new Date(a.createdAt))}
                  </div>
                </div>
              ))}
              {recentAudit.length === 0 && (
                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Audit yozuvi yo'q</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
