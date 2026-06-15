"use client";

import { Building2, TrendingUp, CheckCircle2, Clock, AlertCircle, ChevronRight, FileText } from "lucide-react";

interface Company {
  id: string;
  name: string;
  inn: string;
  taxRegime: string;
  riskLevel: string | null;
}

interface KpiRecord {
  id: string;
  calculatedScore: number;
  status: string;
  rule: { nameUz: string; category: string };
  month: string;
}

interface Adjustment {
  id: string;
  adjustmentType: string;
  amount: number;
  reason: string;
  isApproved: boolean;
}

interface AccountantCabinetProps {
  userName: string;
  companies: Company[];
  companiesCount: number;
  kpi: {
    totalScore: number;
    approvedCount: number;
    pendingCount: number;
    records: KpiRecord[];
  };
  adjustments: Adjustment[];
  currentMonth: string;
}

export function AccountantCabinet({
  userName,
  companies,
  companiesCount,
  kpi,
  adjustments,
  currentMonth,
}: AccountantCabinetProps) {
  const firstName = userName.split(" ")[0];
  const monthLabel = new Date(`${currentMonth}-01`).toLocaleDateString("uz-UZ", {
    month: "long",
    year: "numeric",
  });

  const riskColors: Record<string, string> = {
    low: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    high: "text-red-400 bg-red-500/10 border-red-500/20",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">
            Salom, {firstName}! 👋
          </h1>
          <p className="text-text-secondary text-sm mt-1" suppressHydrationWarning>
            Buxgalter kabinetingiz — {monthLabel}
          </p>
        </div>
        <div className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium">
          🟢 Buxgalter
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-600/20 to-blue-600/5 border border-blue-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Building2 size={20} className="text-blue-400" />
            </div>
            <span className="text-text-secondary text-sm">Firmalarim</span>
          </div>
          <div className="text-3xl font-bold text-text-primary">{companiesCount}</div>
          <div className="text-xs text-text-secondary mt-1">biriktirilgan firma</div>
        </div>

        <div className="bg-gradient-to-br from-emerald-600/20 to-emerald-600/5 border border-emerald-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 size={20} className="text-emerald-400" />
            </div>
            <span className="text-text-secondary text-sm">KPI Tasdiqlangan</span>
          </div>
          <div className="text-3xl font-bold text-emerald-400">{kpi.approvedCount}</div>
          <div className="text-xs text-text-secondary mt-1">oy uchun</div>
        </div>

        <div className="bg-gradient-to-br from-yellow-600/20 to-yellow-600/5 border border-yellow-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center">
              <Clock size={20} className="text-yellow-400" />
            </div>
            <span className="text-text-secondary text-sm">KPI Kutmoqda</span>
          </div>
          <div className="text-3xl font-bold text-yellow-400">{kpi.pendingCount}</div>
          <div className="text-xs text-text-secondary mt-1">tasdiq kutilmoqda</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Firmalar ro'yxati */}
        <div className="bg-bg-card border border-border-glass rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-border-glass">
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-blue-400" />
              <h2 className="text-text-primary font-semibold">Mening Firmalarim</h2>
            </div>
            <span className="text-xs text-text-secondary">{companiesCount} ta</span>
          </div>
          <div className="divide-y divide-slate-700/30">
            {companies.length === 0 ? (
              <div className="p-8 text-center text-text-secondary">
                <Building2 size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Firma biriktirilmagan</p>
              </div>
            ) : (
              companies.slice(0, 8).map((company) => (
                <div
                  key={company.id}
                  className="flex items-center gap-4 p-4 hover:bg-black/5 dark:bg-white/5 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <Building2 size={14} className="text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-text-primary text-sm font-medium truncate">{company.name}</p>
                    <p className="text-text-secondary text-xs">INN: {company.inn}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                        riskColors[company.riskLevel || "low"]
                      }`}
                    >
                      {company.riskLevel === "high"
                        ? "Yuqori"
                        : company.riskLevel === "medium"
                        ? "O'rta"
                        : "Past"}
                    </span>
                    <ChevronRight size={14} className="text-slate-600 group-hover:text-text-secondary transition-colors" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* KPI Ko'rsatkichlari */}
        <div className="space-y-4">
          {/* KPI Umumiy */}
          <div className="bg-bg-card border border-border-glass rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={18} className="text-purple-400" />
              <h2 className="text-text-primary font-semibold">KPI Ko'rsatkichlari</h2>
            </div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-text-secondary text-sm">Umumiy ball</span>
              <span className="text-2xl font-bold text-purple-400">
                {kpi.totalScore.toFixed(1)}
              </span>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {kpi.records.length === 0 ? (
                <p className="text-text-secondary text-sm text-center py-4">
                  Bu oyda KPI yozuvi yo'q
                </p>
              ) : (
                kpi.records.map((record) => (
                  <div
                    key={record.id}
                    className="flex items-center justify-between p-3 bg-black/5 dark:bg-white/5 rounded-xl"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-text-primary text-xs font-medium truncate">
                        {record.rule.nameUz}
                      </p>
                      <p className="text-text-secondary text-[10px] mt-0.5 capitalize">
                        {record.rule.category}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <span className="text-sm font-bold text-text-primary">
                        {Number(record.calculatedScore).toFixed(1)}
                      </span>
                      <span
                        className={`w-2 h-2 rounded-full ${
                          record.status === "approved"
                            ? "bg-emerald-400"
                            : record.status === "submitted"
                            ? "bg-blue-400"
                            : "bg-yellow-400"
                        }`}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Oylik tuzatmalar */}
          <div className="bg-bg-card border border-border-glass rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <FileText size={18} className="text-cyan-400" />
              <h2 className="text-text-primary font-semibold">Oylik Tuzatmalar</h2>
            </div>
            {adjustments.length === 0 ? (
              <p className="text-text-secondary text-sm text-center py-3">
                Bu oyda tuzatma yo'q
              </p>
            ) : (
              <div className="space-y-2">
                {adjustments.map((adj) => (
                  <div
                    key={adj.id}
                    className="flex items-center justify-between p-3 bg-black/5 dark:bg-white/5 rounded-xl"
                  >
                    <div className="flex-1">
                      <p className="text-text-primary text-xs font-medium">{adj.reason}</p>
                      <p className="text-text-secondary text-[10px] mt-0.5 capitalize">
                        {adj.adjustmentType}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-bold ${
                          adj.adjustmentType === "jarima"
                            ? "text-red-400"
                            : "text-emerald-400"
                        }`}
                      >
                        {adj.adjustmentType === "jarima" ? "-" : "+"}
                        {Number(adj.amount).toLocaleString()} so'm
                      </span>
                      {adj.isApproved ? (
                        <CheckCircle2 size={14} className="text-emerald-400" />
                      ) : (
                        <AlertCircle size={14} className="text-yellow-400" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
