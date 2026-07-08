"use client";

import {
  Users,
  Building2,
  Shield,
  Bell,
  Settings,
  ScrollText,
  TrendingUp,
  CheckCircle2,
  UserPlus,
  Activity,
  Database,
} from "lucide-react";

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
  };
}

const roleLabelsMap: Record<string, string> = {
  super_admin: "Superadmin",
  admin: "Admin",
  chief_accountant: "Bosh Buxgalter",
  supervisor: "Nazoratchi",
  accountant: "Buxgalter",
  bank_manager: "Bank-Klient",
};

const roleColors: Record<string, string> = {
  super_admin: "#ef4444",
  admin: "#f97316",
  chief_accountant: "#8b5cf6",
  supervisor: "#3b82f6",
  accountant: "#10b981",
  bank_manager: "#06b6d4",
};

const actionLabels: Record<string, string> = {
  create: "Yaratildi",
  update: "Yangilandi",
  delete: "O'chirildi",
  login: "Kirdi",
  logout: "Chiqdi",
};

export function AdminCabinet({
  userName,
  userRole,
  userStats,
  recentAudit,
  systemHealth,
}: AdminCabinetProps) {
  const firstName = userName.split(" ")[0];
  const isSuperAdmin = userRole === "super_admin";
  const totalUsers = userStats.reduce((s, r) => s + r._count, 0);

  const quickLinks = [
    { href: "/staff", label: "Xodimlar", icon: Users, color: "blue" },
    { href: "/organizations", label: "Firmalar", icon: Building2, color: "purple" },
    { href: "/audit-logs", label: "Audit Log", icon: ScrollText, color: "orange" },
    { href: "/kpi", label: "KPI Qoidalar", icon: TrendingUp, color: "cyan" },
    ...(isSuperAdmin
      ? [{ href: "/settings", label: "Sozlamalar", icon: Settings, color: "red" }]
      : []),
  ];


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            {isSuperAdmin ? "🔑" : "⚙️"} Salom, {firstName}!
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            {isSuperAdmin ? "Superadmin" : "Admin"} kabinetingiz
          </p>
        </div>
        <div className="px-4 py-2 rounded-xl text-[12px] font-bold border"
          style={isSuperAdmin
            ? { background: "var(--danger-bg)", border: "1px solid var(--danger-border)", color: "var(--danger)" }
            : { background: "var(--warning-bg)", border: "1px solid var(--warning-border)", color: "var(--warning)" }}
        >
          {isSuperAdmin ? "🔑 Superadmin" : "⚙️ Admin"}
        </div>
      </div>

      {/* Tizim holati */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl p-4" style={{ background: "var(--accent-blue-light)", border: "1px solid var(--accent-blue)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Users size={16} style={{ color: "var(--accent-blue)" }} />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>Faol Foydalanuvchilar</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{systemHealth.activeUsers}</div>
        </div>

        <div className="rounded-2xl p-4" style={{ background: "var(--accent-indigo)" + "22", border: "1px solid rgba(99,102,241,0.2)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Building2 size={16} style={{ color: "var(--accent-indigo)" }} />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>Faol Firmalar</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{systemHealth.activeCompanies}</div>
        </div>

        <div className="rounded-2xl p-4" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Bell size={16} style={{ color: "var(--warning)" }} />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>O&apos;qilmagan Xabar</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "var(--warning)" }}>{systemHealth.unreadNotifs}</div>
        </div>

        <div className="rounded-2xl p-4" style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Activity size={16} style={{ color: "var(--success)" }} />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>KPI Kutmoqda</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "var(--success)" }}>{systemHealth.pendingKpi}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rol bo'yicha foydalanuvchilar */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-5">
            <Database size={18} style={{ color: "var(--accent-blue)" }} />
            <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>Foydalanuvchilar (Rol bo&apos;yicha)</h2>
          </div>
          <div className="space-y-3">
            {userStats.map((stat) => {
              const percent = totalUsers > 0 ? (stat._count / totalUsers) * 100 : 0;
              const color = roleColors[stat.role] || "#6b7280";
              return (
                <div key={stat.role} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-36 flex-shrink-0">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                    <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                      {roleLabelsMap[stat.role] || stat.role}
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

        {/* Audit Log */}
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
                  className="flex items-center gap-3 p-3 transition-colors rounded-lg"
                  onMouseEnter={e => e.currentTarget.style.background = "var(--table-row-hover)"}
                  onMouseLeave={e => e.currentTarget.style.background = ""}
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
                    <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                      {log.tableName} ·{" "}
                      {new Date(log.createdAt).toLocaleString("uz-UZ", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
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
              <a key={link.href} href={link.href}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-200 hover:scale-105 hover:shadow-lg"
                style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text-secondary)" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent-blue)"; e.currentTarget.style.color = "var(--accent-blue)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--card-border)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
              >
                <Icon size={22} />
                <span className="text-xs font-medium text-center">{link.label}</span>
              </a>
            );
          })}
          <a href="/staff/new"
            className="flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-200 hover:scale-105 hover:shadow-lg"
            style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)", color: "var(--success)" }}
          >
            <UserPlus size={22} />
            <span className="text-xs font-medium text-center">Yangi Xodim</span>
          </a>
        </div>
      </div>
    </div>
  );
}
