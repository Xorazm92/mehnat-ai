"use client";

import Link from "next/link";
import {
  Users,
  Building2,
  Shield,
  Settings,
  ScrollText,
  TrendingUp,
  CheckCircle2,
  UserPlus,
  Wallet,
  Database,
} from "lucide-react";
import { CashFlowChart } from "./CashFlowChart";
import BalanceOverview from "@/components/BalanceOverview";
import DeadlinesWidget, { type DeadlineRow } from "@/components/DeadlinesWidget";
import { KpiCard } from "@/components/ui/KpiCard";
import { formatUzDateTime, formatNum } from "@/lib/platform/format";
import { ROLE_LABELS, type UserRole } from "@/lib/platform/permissions";
import type { BalanceBreakdown } from "@/types";

const fmtMln = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} mln`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)} ming`;
  return formatNum(v);
};

interface RoleStat {
  role: string;
  _count: number;
}

interface AuditRecord {
  id: string;
  action: string;
  tableName: string;
  createdAt: string;
  user: { fullName: string; role: string; avatarColor: string | null } | null;
}

interface AdminCabinetProps {
  userName: string;
  userRole: string;
  userStats: RoleStat[];
  companyStats: number;
  recentAudit: AuditRecord[];
  systemHealth: {
    activeUsers: number;
    activeCompanies: number;
    unreadNotifs: number;
    pendingKpi: number;
    kpiCompletionPercent?: number | null;
    payrollFund?: number;
  };
  balance?: BalanceBreakdown;
  monthlyCashFlow?: { month: string; income: number; expense: number }[];
  deadlines?: { overdueCount: number; dueSoonCount: number; upcoming: DeadlineRow[] };
}

// Lavozim yorliqlari — `lib/permissions.ROLE_LABELS` yagona manba.

const roleColors: Record<string, string> = {
  super_admin: "var(--danger)",
  admin: "var(--warning)",
  chief_accountant: "var(--accent-purple)",
  supervisor: "var(--brand)",
  accountant: "var(--success)",
  bank_manager: "var(--info)",
};

const actionLabels: Record<string, string> = {
  create: "Yaratildi",
  update: "Yangilandi",
  delete: "O'chirildi",
  login: "Kirdi",
  logout: "Chiqdi",
};

export function AdminCabinet({
  userRole,
  userStats,
  recentAudit,
  systemHealth,
  balance,
  monthlyCashFlow = [],
  deadlines,
}: AdminCabinetProps) {
  const isSuperAdmin = userRole === "super_admin";
  const totalUsers = userStats.reduce((s, r) => s + r._count, 0);

  const quickLinks = [
    { href: "/staff", label: "Xodimlar", icon: Users, color: "blue" },
    { href: "/organizations", label: "Firmalar", icon: Building2, color: "purple" },
    { href: "/audit-logs", label: "Audit Log", icon: ScrollText, color: "orange" },
    { href: "/kpi", label: "KPI Qoidalar", icon: TrendingUp, color: "cyan" },
    // Admin kabinetidagi "Sozlamalar" — TIZIM parametrlari (`/admin/settings`),
    // shaxsiy profil emas. Ilgari u `/settings` ga, ya'ni oddiy profil
    // formasiga olib borardi.
    ...(isSuperAdmin
      ? [{ href: "/admin/settings", label: "Tizim sozlamalari", icon: Settings, color: "red" }]
      : []),
  ];


  return (
    <div className="space-y-6">
      {/* Yagona kassa balansi (butun tizim) */}
      {balance && <BalanceOverview breakdown={balance} />}

      {/* Tizim holati */}
      {/* Tizim holati — plitkalar drill-through havolalari */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          label="Faol foydalanuvchilar" value={systemHealth.activeUsers} tone="brand"
          icon={<Users size={15} />} href="/staff?staff_status=active"
        />
        <KpiCard
          label="Faol firmalar" value={systemHealth.activeCompanies} tone="indigo"
          icon={<Building2 size={15} />} href="/organizations"
        />
        <KpiCard
          label="KPI bajarilishi"
          value={systemHealth.kpiCompletionPercent === null || systemHealth.kpiCompletionPercent === undefined
            ? "—"
            : `${systemHealth.kpiCompletionPercent}%`}
          hint={systemHealth.kpiCompletionPercent === null || systemHealth.kpiCompletionPercent === undefined
            ? "Bu oy uchun baholangan KPI yo'q"
            : undefined}
          tone="success"
          icon={<TrendingUp size={15} />} href="/kpi"
        />
        <KpiCard
          label="Oylik fondi" tone="warning"
          icon={<Wallet size={15} />} href="/payroll"
          value={<>{fmtMln(systemHealth.payrollFund ?? 0)}<span className="text-xs font-bold ml-1" style={{ color: "var(--text-muted)" }}>so&apos;m</span></>}
          hint={systemHealth.pendingKpi > 0 ? `${systemHealth.pendingKpi} KPI tasdiq kutmoqda` : undefined}
        />
      </div>

      {/* Muddatlar — butun tizim bo'yicha */}
      {deadlines && (
        <DeadlinesWidget
          overdueCount={deadlines.overdueCount}
          dueSoonCount={deadlines.dueSoonCount}
          upcoming={deadlines.upcoming}
          scopeLabel="Butun tizim"
        />
      )}

      {/* Pul oqimi + Rollar bo'yicha (ASRO prototip layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <CashFlowChart data={monthlyCashFlow} />
        </div>

        {/* Rol bo'yicha foydalanuvchilar */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-5">
            <Database size={18} style={{ color: "var(--accent-blue)" }} />
            <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>Foydalanuvchilar (Rol bo&apos;yicha)</h2>
          </div>
          <div className="space-y-3">
            {userStats.map((stat) => {
              const percent = totalUsers > 0 ? (stat._count / totalUsers) * 100 : 0;
              const color = roleColors[stat.role] || "var(--text-muted)";
              return (
                <div key={stat.role} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-36 flex-shrink-0">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                    <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                      {ROLE_LABELS[stat.role as UserRole] || stat.role}
                    </span>
                  </div>
                  <div className="flex-1 rounded-full h-2" style={{ background: "var(--input-bg)" }}>
                    <div className="h-2 rounded-full transition-all duration-700" style={{ width: `${percent}%`, background: color }} />
                  </div>
                  <span className="text-sm font-bold w-6 text-right" style={{ color: "var(--text-primary)" }}>{stat._count}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 flex justify-between items-center" style={{ borderTop: "1px solid var(--card-border)" }}>
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>Jami</span>
            <span className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>{totalUsers}</span>
          </div>
        </div>
      </div>

      {/* Audit Log — full width */}
      <div className="glass-card overflow-hidden">
          <div className="flex items-center justify-between p-5" style={{ borderBottom: "1px solid var(--card-border)" }}>
            <div className="flex items-center gap-2">
              <ScrollText size={18} style={{ color: "var(--warning)" }} />
              <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>So&apos;nggi Harakatlar</h2>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto" style={{ contentVisibility: "auto" }}>
            {recentAudit.length === 0 ? (
              <div className="p-8 text-center" style={{ color: "var(--text-muted)" }}>
                <ScrollText size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Audit yozuvi yo&apos;q</p>
              </div>
            ) : (
              recentAudit.map((log) => (
                <div key={log.id}
                  className="flex items-center gap-3 p-3 transition-colors rounded-lg row-hover"
                >
                  {log.user ? (
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ background: roleColors[log.user.role] || "var(--text-muted)" }}
                    >
                      {log.user.fullName[0]}
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: "var(--input-bg)" }}>
                      <Shield size={12} style={{ color: "var(--text-muted)" }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                      {log.user?.fullName || "Tizim"}{" "}
                      <span style={{ color: "var(--text-muted)" }}>— {actionLabels[log.action] || log.action}</span>
                    </p>
                    <p className="text-micro truncate" style={{ color: "var(--text-muted)" }}>
                      {log.tableName} ·{" "}
                      {formatUzDateTime(log.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      {/* Tezkor havolalar */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-5">
          <CheckCircle2 size={18} style={{ color: "var(--success)" }} />
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>Tezkor Havolalar</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {quickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link key={link.href} href={link.href}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-200 hover:scale-105 hover:shadow-lg icon-btn-accent"
                style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text-secondary)" }}
              >
                <Icon size={22} />
                <span className="text-xs font-medium text-center">{link.label}</span>
              </Link>
            );
          })}
          {/* `/staff/new` yo'nalishi mavjud emas edi — bu havola 404 qaytarardi.
              Endi mavjud `/staff` sahifasiga `?new=1` bilan boradi va u yerda
              "yangi xodim" formasi darhol ochiladi. */}
          <Link href="/staff?new=1"
            className="flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-200 hover:scale-105 hover:shadow-lg"
            style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)", color: "var(--success)" }}
          >
            <UserPlus size={22} />
            <span className="text-xs font-medium text-center">Yangi Xodim</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
