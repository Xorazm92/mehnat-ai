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
  companyStats,
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

  const colorMap: Record<string, string> = {
    blue: "bg-blue-500/20 text-blue-400 border-blue-500/20",
    purple: "bg-purple-500/20 text-purple-400 border-purple-500/20",
    orange: "bg-orange-500/20 text-orange-400 border-orange-500/20",
    cyan: "bg-cyan-500/20 text-cyan-400 border-cyan-500/20",
    red: "bg-red-500/20 text-red-400 border-red-500/20",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">
            {isSuperAdmin ? "🔑" : "⚙️"} Salom, {firstName}!
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            {isSuperAdmin ? "Superadmin" : "Admin"} kabinetingiz
          </p>
        </div>
        <div
          className={`px-4 py-2 rounded-xl text-sm font-medium border ${
            isSuperAdmin
              ? "bg-red-500/10 border-red-500/20 text-red-400"
              : "bg-orange-500/10 border-orange-500/20 text-orange-400"
          }`}
        >
          {isSuperAdmin ? "🔑 Superadmin" : "⚙️ Admin"}
        </div>
      </div>

      {/* Tizim holati */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-600/20 to-blue-600/5 border border-blue-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users size={16} className="text-blue-400" />
            <span className="text-text-secondary text-xs">Faol Foydalanuvchilar</span>
          </div>
          <div className="text-2xl font-bold text-text-primary">{systemHealth.activeUsers}</div>
        </div>

        <div className="bg-gradient-to-br from-purple-600/20 to-purple-600/5 border border-purple-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Building2 size={16} className="text-purple-400" />
            <span className="text-text-secondary text-xs">Faol Firmalar</span>
          </div>
          <div className="text-2xl font-bold text-text-primary">{systemHealth.activeCompanies}</div>
        </div>

        <div className="bg-gradient-to-br from-yellow-600/20 to-yellow-600/5 border border-yellow-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Bell size={16} className="text-yellow-400" />
            <span className="text-text-secondary text-xs">O'qilmagan Xabar</span>
          </div>
          <div className="text-2xl font-bold text-yellow-400">{systemHealth.unreadNotifs}</div>
        </div>

        <div className="bg-gradient-to-br from-cyan-600/20 to-cyan-600/5 border border-cyan-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity size={16} className="text-cyan-400" />
            <span className="text-text-secondary text-xs">KPI Kutmoqda</span>
          </div>
          <div className="text-2xl font-bold text-cyan-400">{systemHealth.pendingKpi}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rol bo'yicha foydalanuvchilar */}
        <div className="bg-bg-card border border-border-glass rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-5">
            <Database size={18} className="text-blue-400" />
            <h2 className="text-text-primary font-semibold">Foydalanuvchilar (Rol bo'yicha)</h2>
          </div>
          <div className="space-y-3">
            {userStats.map((stat) => {
              const percent = totalUsers > 0 ? (stat._count / totalUsers) * 100 : 0;
              const color = roleColors[stat.role] || "#6b7280";
              return (
                <div key={stat.role} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-36 flex-shrink-0">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: color }}
                    />
                    <span className="text-slate-300 text-xs font-medium">
                      {roleLabelsMap[stat.role] || stat.role}
                    </span>
                  </div>
                  <div className="flex-1 bg-slate-700 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all duration-700"
                      style={{ width: `${percent}%`, background: color }}
                    />
                  </div>
                  <span className="text-text-primary text-sm font-bold w-6 text-right">{stat._count}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-border-glass flex justify-between items-center">
            <span className="text-text-secondary text-sm">Jami</span>
            <span className="text-text-primary font-bold text-lg">{totalUsers}</span>
          </div>
        </div>

        {/* Audit Log */}
        <div className="bg-bg-card border border-border-glass rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-border-glass">
            <div className="flex items-center gap-2">
              <ScrollText size={18} className="text-orange-400" />
              <h2 className="text-text-primary font-semibold">So'nggi Harakatlar</h2>
            </div>
          </div>
          <div className="divide-y divide-slate-700/30 max-h-72 overflow-y-auto">
            {recentAudit.length === 0 ? (
              <div className="p-8 text-center text-text-secondary">
                <ScrollText size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Audit yozuvi yo'q</p>
              </div>
            ) : (
              recentAudit.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-3 p-3 hover:bg-slate-700/20 transition-colors"
                >
                  {log.user ? (
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-text-primary text-xs font-bold flex-shrink-0"
                      style={{
                        background: roleColors[log.user.role] || "#6b7280",
                      }}
                    >
                      {log.user.fullName[0]}
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-lg bg-slate-600 flex items-center justify-center flex-shrink-0">
                      <Shield size={12} className="text-text-secondary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-text-primary text-xs font-medium truncate">
                      {log.user?.fullName || "Tizim"}{" "}
                      <span className="text-text-secondary font-normal">
                        — {actionLabels[log.action] || log.action}
                      </span>
                    </p>
                    <p className="text-text-secondary text-[10px] truncate">
                      {log.tableName} ·{" "}
                      {new Date(log.createdAt).toLocaleString("uz-UZ", {
                        hour: "2-digit",
                        minute: "2-digit",
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Tezkor havolalar */}
      <div className="bg-bg-card border border-border-glass rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-5">
          <CheckCircle2 size={18} className="text-emerald-400" />
          <h2 className="text-text-primary font-semibold">Tezkor Havolalar</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {quickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <a
                key={link.href}
                href={link.href}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-200 hover:scale-105 hover:shadow-lg ${colorMap[link.color]}`}
              >
                <Icon size={22} />
                <span className="text-xs font-medium text-center">{link.label}</span>
              </a>
            );
          })}
          <a
            href="/staff/new"
            className="flex flex-col items-center gap-2 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 transition-all duration-200 hover:scale-105 hover:shadow-lg"
          >
            <UserPlus size={22} />
            <span className="text-xs font-medium text-center">Yangi Xodim</span>
          </a>
        </div>
      </div>
    </div>
  );
}
