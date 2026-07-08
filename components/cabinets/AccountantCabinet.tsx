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
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Salom, {firstName}! 👋
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }} suppressHydrationWarning>
            Buxgalter kabinetingiz — {monthLabel}
          </p>
        </div>
        <div className="px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)", color: "var(--success)" }}>
          🟢 Buxgalter
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl p-5" style={{ background: "var(--accent-blue-light)", border: "1px solid var(--accent-blue)" }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(59, 130, 246, 0.15)" }}>
              <Building2 size={20} style={{ color: "var(--accent-blue)" }} />
            </div>
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>Firmalarim</span>
          </div>
          <div className="text-3xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>{companiesCount}</div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>biriktirilgan firma</div>
        </div>

        <div className="rounded-2xl p-5" style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)" }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(34, 197, 94, 0.15)" }}>
              <CheckCircle2 size={20} style={{ color: "var(--success)" }} />
            </div>
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>KPI Tasdiqlangan</span>
          </div>
          <div className="text-3xl font-bold mb-1" style={{ color: "var(--success)" }}>{kpi.approvedCount}</div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>oy uchun</div>
        </div>

        <div className="rounded-2xl p-5" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(234, 179, 8, 0.15)" }}>
              <Clock size={20} style={{ color: "var(--warning)" }} />
            </div>
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>KPI Kutmoqda</span>
          </div>
          <div className="text-3xl font-bold mb-1" style={{ color: "var(--warning)" }}>{kpi.pendingCount}</div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>tasdiq kutilmoqda</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Firmalar ro'yxati */}
        <div className="glass-card overflow-hidden">
          <div className="flex items-center justify-between p-5" style={{ borderBottom: "1px solid var(--card-border)" }}>
            <div className="flex items-center gap-2">
              <Building2 size={18} style={{ color: "var(--accent-blue)" }} />
              <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>Mening Firmalarim</h2>
            </div>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{companiesCount} ta</span>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--card-border)" }}>
            {companies.length === 0 ? (
              <div className="p-8 text-center text-text-secondary">
                <Building2 size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Firma biriktirilmagan</p>
              </div>
            ) : (
              companies.slice(0, 8).map((company) => (
                <div
                  key={company.id}
                  className="flex items-center gap-4 p-4 transition-colors group"
                  style={{ borderBottom: "1px solid var(--card-border)" }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--table-row-hover)"}
                  onMouseLeave={e => e.currentTarget.style.background = ""}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(59, 130, 246, 0.15)" }}>
                    <Building2 size={14} style={{ color: "var(--accent-blue)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{company.name}</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>INN: {company.inn}</p>
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
                    <ChevronRight size={14} style={{ color: "var(--text-muted)" }} className="transition-colors group-hover:opacity-80" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* KPI Ko'rsatkichlari */}
        <div className="space-y-4">
          {/* KPI Umumiy */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={18} style={{ color: "var(--accent-indigo)" }} />
              <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>KPI Ko&apos;rsatkichlari</h2>
            </div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>Umumiy ball</span>
              <span className="text-2xl font-bold" style={{ color: "var(--accent-indigo)" }}>
                {kpi.totalScore.toFixed(1)}
              </span>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {kpi.records.length === 0 ? (
                <p className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>
                  Bu oyda KPI yozuvi yo&apos;q
                </p>
              ) : (
                kpi.records.map((record) => (
                  <div
                    key={record.id}
                    className="flex items-center justify-between p-3 rounded-xl"
                    style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)" }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {record.rule.nameUz}
                      </p>
                      <p className="text-[10px] mt-0.5 capitalize" style={{ color: "var(--text-muted)" }}>
                        {record.rule.category}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
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
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <FileText size={18} style={{ color: "var(--accent-blue)" }} />
              <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>Oylik Tuzatmalar</h2>
            </div>
            {adjustments.length === 0 ? (
              <p className="text-sm text-center py-3" style={{ color: "var(--text-muted)" }}>
                Bu oyda tuzatma yo&apos;q
              </p>
            ) : (
              <div className="space-y-2">
                {adjustments.map((adj) => (
                  <div
                    key={adj.id}
                    className="flex items-center justify-between p-3 rounded-xl"
                    style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)" }}
                  >
                    <div className="flex-1">
                      <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{adj.reason}</p>
                      <p className="text-[10px] mt-0.5 capitalize" style={{ color: "var(--text-muted)" }}>
                        {adj.adjustmentType}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-sm font-bold"
                        style={{ color: adj.adjustmentType === "jarima" ? "var(--danger)" : "var(--success)" }}
                      >
                        {adj.adjustmentType === "jarima" ? "-" : "+"}
                        {Number(adj.amount).toLocaleString()} so&apos;m
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
