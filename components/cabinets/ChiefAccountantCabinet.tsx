"use client";

import {
  Users,
  Building2,
  TrendingUp,
  CheckCircle2,
  Clock,
  ChevronRight,
  Award,
  DollarSign,
  FileCheck,
} from "lucide-react";

interface TeamMember {
  id: string;
  fullName: string;
  role: string;
  avatarColor: string | null;
  rating: number | null;
  status: string | null;
  _count: { assignedCompanies: number };
  performanceRecords: Array<{ calculatedScore: number; status: string }>;
}

interface PendingApproval {
  id: string;
  employee: { fullName: string; avatarColor: string | null; role: string };
  rule: { nameUz: string; category: string };
  calculatedScore: number;
  submittedAt: string | null;
}

interface PayrollItem {
  id: string;
  employee: { fullName: string; role: string };
  adjustmentType: string;
  amount: number;
  reason: string;
}

interface ChiefAccountantCabinetProps {
  userName: string;
  chiefCompanies: Array<{
    id: string;
    name: string;
    inn: string;
    taxRegime: string;
    riskLevel: string | null;
    accountant: { id: string; fullName: string; avatarColor: string | null } | null;
  }>;
  companiesCount: number;
  teamMembers: TeamMember[];
  pendingApprovals: PendingApproval[];
  payrollSummary: PayrollItem[];
  totalTeamScore: number;
  currentMonth: string;
}

export function ChiefAccountantCabinet({
  userName,
  chiefCompanies,
  companiesCount,
  teamMembers,
  pendingApprovals,
  payrollSummary,
  totalTeamScore,
  currentMonth,
}: ChiefAccountantCabinetProps) {
  const firstName = userName.split(" ")[0];
  const monthLabel = new Date(`${currentMonth}-01`).toLocaleDateString("uz-UZ", {
    month: "long",
    year: "numeric",
  });

  const roleLabels: Record<string, string> = {
    accountant: "Buxgalter",
    bank_manager: "Bank-Klient",
    supervisor: "Nazoratchi",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Salom, {firstName}! 📊</h1>
          <p className="text-text-secondary text-sm mt-1" suppressHydrationWarning>
            Bosh Buxgalter kabinetingiz — {monthLabel}
          </p>
        </div>
        <div className="px-4 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm font-medium">
          👑 Bosh Buxgalter
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-purple-600/20 to-purple-600/5 border border-purple-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Building2 size={16} className="text-purple-400" />
            <span className="text-text-secondary text-xs">Firmalar</span>
          </div>
          <div className="text-2xl font-bold text-text-primary">{companiesCount}</div>
        </div>

        <div className="bg-gradient-to-br from-blue-600/20 to-blue-600/5 border border-blue-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users size={16} className="text-blue-400" />
            <span className="text-text-secondary text-xs">Jamoa</span>
          </div>
          <div className="text-2xl font-bold text-text-primary">{teamMembers.length}</div>
        </div>

        <div className="bg-gradient-to-br from-yellow-600/20 to-yellow-600/5 border border-yellow-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={16} className="text-yellow-400" />
            <span className="text-text-secondary text-xs">KPI Kutmoqda</span>
          </div>
          <div className="text-2xl font-bold text-yellow-400">{pendingApprovals.length}</div>
        </div>

        <div className="bg-gradient-to-br from-emerald-600/20 to-emerald-600/5 border border-emerald-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Award size={16} className="text-emerald-400" />
            <span className="text-text-secondary text-xs">Jamoa KPI</span>
          </div>
          <div className="text-2xl font-bold text-emerald-400">
            {totalTeamScore.toFixed(0)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Jamoa a'zolari */}
        <div className="bg-bg-card border border-border-glass rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-border-glass">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-blue-400" />
              <h2 className="text-text-primary font-semibold">Jamoa Ko'rsatkichlari</h2>
            </div>
          </div>
          <div className="divide-y divide-slate-700/30">
            {teamMembers.length === 0 ? (
              <div className="p-8 text-center text-text-secondary">
                <Users size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Jamoa a'zolari yo'q</p>
              </div>
            ) : (
              teamMembers.map((member) => {
                const score = member.performanceRecords.reduce(
                  (s, p) => s + Number(p.calculatedScore),
                  0
                );
                const approved = member.performanceRecords.filter(
                  (p) => p.status === "approved"
                ).length;
                const total = member.performanceRecords.length;
                const percent = total > 0 ? Math.round((approved / total) * 100) : 0;

                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-4 p-4 hover:bg-black/5 dark:bg-white/5 transition-colors"
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-text-primary text-sm font-bold flex-shrink-0"
                      style={{ background: member.avatarColor || "#8b5cf6" }}
                    >
                      {member.fullName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-text-primary text-sm font-medium truncate">
                          {member.fullName}
                        </p>
                        <span className="text-[10px] text-text-secondary bg-slate-700 px-1.5 py-0.5 rounded">
                          {roleLabels[member.role] || member.role}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 bg-slate-700 rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full bg-purple-500 transition-all"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="text-xs text-text-secondary w-8 text-right">{percent}%</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-text-primary text-sm font-bold">{score.toFixed(0)}</p>
                      <p className="text-text-secondary text-[10px]">
                        {member._count.assignedCompanies} firma
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-4">
          {/* Tasdiqlash kutayotgan KPI */}
          <div className="bg-bg-card border border-border-glass rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-border-glass">
              <div className="flex items-center gap-2">
                <TrendingUp size={18} className="text-cyan-400" />
                <h2 className="text-text-primary font-semibold">KPI Tasdiqlanishi</h2>
              </div>
              <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
                {pendingApprovals.length}
              </span>
            </div>
            <div className="divide-y divide-slate-700/30 max-h-52 overflow-y-auto">
              {pendingApprovals.length === 0 ? (
                <div className="p-6 text-center text-text-secondary">
                  <CheckCircle2 size={28} className="mx-auto mb-2 text-emerald-400/30" />
                  <p className="text-sm">Barcha KPI tasdiqlangan</p>
                </div>
              ) : (
                pendingApprovals.map((item) => (
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
                      <p className="text-text-secondary text-[10px] truncate">{item.rule.nameUz}</p>
                    </div>
                    <span className="text-sm font-bold text-text-primary">
                      {Number(item.calculatedScore).toFixed(1)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Maosh tuzatmalar */}
          <div className="bg-bg-card border border-border-glass rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-border-glass">
              <div className="flex items-center gap-2">
                <DollarSign size={18} className="text-emerald-400" />
                <h2 className="text-text-primary font-semibold">Tasdiq Kutayotgan</h2>
              </div>
            </div>
            <div className="divide-y divide-slate-700/30">
              {payrollSummary.length === 0 ? (
                <div className="p-5 text-center text-text-secondary text-sm">
                  Tasdiq kutayotgan yo'q
                </div>
              ) : (
                payrollSummary.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 p-3 hover:bg-slate-700/20"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-text-primary text-xs font-medium truncate">
                        {item.employee.fullName}
                      </p>
                      <p className="text-text-secondary text-[10px] truncate">{item.reason}</p>
                    </div>
                    <span
                      className={`text-sm font-bold ${
                        item.adjustmentType === "jarima" ? "text-red-400" : "text-emerald-400"
                      }`}
                    >
                      {item.adjustmentType === "jarima" ? "-" : "+"}
                      {Number(item.amount).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Firmalar jadvali */}
      <div className="bg-bg-card border border-border-glass rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-border-glass">
          <div className="flex items-center gap-2">
            <FileCheck size={18} className="text-purple-400" />
            <h2 className="text-text-primary font-semibold">Nazorat Ostidagi Firmalar</h2>
          </div>
          <span className="text-xs text-text-secondary">{companiesCount} ta</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-black/5 dark:bg-white/5">
          {chiefCompanies.slice(0, 9).map((company) => (
            <div
              key={company.id}
              className="flex items-center gap-3 p-4 bg-bg-card hover:bg-black/5 dark:bg-white/5 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                <Building2 size={14} className="text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-text-primary text-sm font-medium truncate">{company.name}</p>
                {company.accountant && (
                  <p className="text-text-secondary text-xs truncate">
                    {company.accountant.fullName}
                  </p>
                )}
              </div>
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  company.riskLevel === "high"
                    ? "bg-red-400"
                    : company.riskLevel === "medium"
                    ? "bg-yellow-400"
                    : "bg-emerald-400"
                }`}
              />
            </div>
          ))}
        </div>
        {companiesCount > 9 && (
          <div className="p-3 text-center text-text-secondary text-xs">
            +{companiesCount - 9} ta firma ko'rsatilmadi
          </div>
        )}
      </div>
    </div>
  );
}
