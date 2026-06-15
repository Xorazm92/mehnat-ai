"use client";

import {
  Users,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronRight,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

interface SupervisedCompany {
  id: string;
  name: string;
  inn: string;
  riskLevel: string | null;
  companyStatus: string | null;
  accountant: { id: string; fullName: string; avatarColor: string | null } | null;
}

interface Accountant {
  id: string;
  fullName: string;
  avatarColor: string | null;
  status: string | null;
  rating: number | null;
  _count: { assignedCompanies: number };
  performanceRecords: Array<{ calculatedScore: number; status: string }>;
}

interface PendingKpi {
  id: string;
  employee: { fullName: string; avatarColor: string | null };
  rule: { nameUz: string };
  calculatedScore: number;
  submittedAt: string | null;
}

interface RiskStat {
  riskLevel: string | null;
  _count: number;
}

interface SupervisorCabinetProps {
  userName: string;
  supervisedCompanies: SupervisedCompany[];
  companiesCount: number;
  accountants: Accountant[];
  pendingKpi: PendingKpi[];
  riskStats: RiskStat[];
  currentMonth: string;
}

export function SupervisorCabinet({
  userName,
  supervisedCompanies,
  companiesCount,
  accountants,
  pendingKpi,
  riskStats,
  currentMonth,
}: SupervisorCabinetProps) {
  const firstName = userName.split(" ")[0];
  const monthLabel = new Date(`${currentMonth}-01`).toLocaleDateString("uz-UZ", {
    month: "long",
    year: "numeric",
  });

  const highRisk = riskStats.find((r) => r.riskLevel === "high")?._count || 0;
  const mediumRisk = riskStats.find((r) => r.riskLevel === "medium")?._count || 0;
  const lowRisk = riskStats.find((r) => r.riskLevel === "low")?._count || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Salom, {firstName}! 🔍</h1>
          <p className="text-text-secondary text-sm mt-1" suppressHydrationWarning>
            Nazoratchi kabinetingiz — {monthLabel}
          </p>
        </div>
        <div className="px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium">
          🛡️ Nazoratchi
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-600/20 to-blue-600/5 border border-blue-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Building2 size={16} className="text-blue-400" />
            <span className="text-text-secondary text-xs">Firmalar</span>
          </div>
          <div className="text-2xl font-bold text-text-primary">{companiesCount}</div>
        </div>

        <div className="bg-gradient-to-br from-purple-600/20 to-purple-600/5 border border-purple-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users size={16} className="text-purple-400" />
            <span className="text-text-secondary text-xs">Buxgalterlar</span>
          </div>
          <div className="text-2xl font-bold text-text-primary">{accountants.length}</div>
        </div>

        <div className="bg-gradient-to-br from-red-600/20 to-red-600/5 border border-red-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-red-400" />
            <span className="text-text-secondary text-xs">Yuqori risk</span>
          </div>
          <div className="text-2xl font-bold text-red-400">{highRisk}</div>
        </div>

        <div className="bg-gradient-to-br from-yellow-600/20 to-yellow-600/5 border border-yellow-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={16} className="text-yellow-400" />
            <span className="text-text-secondary text-xs">KPI Kutmoqda</span>
          </div>
          <div className="text-2xl font-bold text-yellow-400">{pendingKpi.length}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Buxgalterlar holati */}
        <div className="bg-bg-card border border-border-glass rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-border-glass">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-purple-400" />
              <h2 className="text-text-primary font-semibold">Buxgalterlar Holati</h2>
            </div>
          </div>
          <div className="divide-y divide-slate-700/30">
            {accountants.length === 0 ? (
              <div className="p-8 text-center text-text-secondary">
                <Users size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Buxgalter biriktirilmagan</p>
              </div>
            ) : (
              accountants.map((acc) => {
                const totalScore = acc.performanceRecords.reduce(
                  (s, p) => s + Number(p.calculatedScore),
                  0
                );
                const approvedCount = acc.performanceRecords.filter(
                  (p) => p.status === "approved"
                ).length;

                return (
                  <div
                    key={acc.id}
                    className="flex items-center gap-4 p-4 hover:bg-black/5 dark:bg-white/5 transition-colors"
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-text-primary text-sm font-bold flex-shrink-0"
                      style={{ background: acc.avatarColor || "#3b82f6" }}
                    >
                      {acc.fullName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-text-primary text-sm font-medium truncate">{acc.fullName}</p>
                      <p className="text-text-secondary text-xs">
                        {acc._count.assignedCompanies} ta firma · KPI: {totalScore.toFixed(0)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          acc.status === "active"
                            ? "bg-emerald-400"
                            : acc.status === "vacation"
                            ? "bg-yellow-400"
                            : "bg-red-400"
                        }`}
                      />
                      <ChevronRight size={14} className="text-slate-600" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-4">
          {/* Risk Matritsasi */}
          <div className="bg-bg-card border border-border-glass rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck size={18} className="text-orange-400" />
              <h2 className="text-text-primary font-semibold">Risk Daraja</h2>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-red-400 text-xs font-medium w-16">Yuqori</span>
                <div className="flex-1 bg-slate-700 rounded-full h-2">
                  <div
                    className="h-2 rounded-full bg-red-500 transition-all"
                    style={{
                      width: companiesCount
                        ? `${(highRisk / companiesCount) * 100}%`
                        : "0%",
                    }}
                  />
                </div>
                <span className="text-text-primary text-sm font-bold w-6">{highRisk}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-yellow-400 text-xs font-medium w-16">O'rta</span>
                <div className="flex-1 bg-slate-700 rounded-full h-2">
                  <div
                    className="h-2 rounded-full bg-yellow-500 transition-all"
                    style={{
                      width: companiesCount
                        ? `${(mediumRisk / companiesCount) * 100}%`
                        : "0%",
                    }}
                  />
                </div>
                <span className="text-text-primary text-sm font-bold w-6">{mediumRisk}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-emerald-400 text-xs font-medium w-16">Past</span>
                <div className="flex-1 bg-slate-700 rounded-full h-2">
                  <div
                    className="h-2 rounded-full bg-emerald-500 transition-all"
                    style={{
                      width: companiesCount
                        ? `${(lowRisk / companiesCount) * 100}%`
                        : "0%",
                    }}
                  />
                </div>
                <span className="text-text-primary text-sm font-bold w-6">{lowRisk}</span>
              </div>
            </div>
          </div>

          {/* Tasdiqlash kutayotgan KPI */}
          <div className="bg-bg-card border border-border-glass rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-border-glass">
              <div className="flex items-center gap-2">
                <TrendingUp size={18} className="text-cyan-400" />
                <h2 className="text-text-primary font-semibold">KPI Tasdiqlanishi</h2>
              </div>
              <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
                {pendingKpi.length} ta
              </span>
            </div>
            <div className="divide-y divide-slate-700/30 max-h-52 overflow-y-auto">
              {pendingKpi.length === 0 ? (
                <div className="p-6 text-center text-text-secondary">
                  <CheckCircle2 size={28} className="mx-auto mb-2 text-emerald-400/30" />
                  <p className="text-sm">Barcha KPI tasdiqlangan</p>
                </div>
              ) : (
                pendingKpi.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-3 hover:bg-slate-700/20 transition-colors"
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-text-primary text-xs font-bold flex-shrink-0"
                      style={{ background: item.employee.avatarColor || "#8b5cf6" }}
                    >
                      {item.employee.fullName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-text-primary text-xs font-medium truncate">
                        {item.employee.fullName}
                      </p>
                      <p className="text-text-secondary text-[10px] truncate">
                        {item.rule.nameUz}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-text-primary">
                      {Number(item.calculatedScore).toFixed(1)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Yuqori risk firmalar */}
      {highRisk > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={18} className="text-red-400" />
            <h2 className="text-text-primary font-semibold">Yuqori Risk Firmalar</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {supervisedCompanies
              .filter((c) => c.riskLevel === "high")
              .map((company) => (
                <div
                  key={company.id}
                  className="flex items-center gap-3 p-3 bg-bg-card rounded-xl"
                >
                  <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-text-primary text-sm font-medium truncate">{company.name}</p>
                    {company.accountant && (
                      <p className="text-text-secondary text-xs">
                        Buxgalter: {company.accountant.fullName}
                      </p>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
