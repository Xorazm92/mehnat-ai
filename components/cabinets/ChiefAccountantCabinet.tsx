"use client";

import {
  Users,
  Building2,
  TrendingUp,
  CheckCircle2,
  Clock,
  Award,
  DollarSign,
  FileCheck,
  ShieldCheck,
} from "lucide-react";
import { formatUzMonthYear, formatNum } from "@/lib/format";
import DeadlinesWidget, { type DeadlineRow } from "@/components/DeadlinesWidget";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiCard } from "@/components/ui/KpiCard";

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
  deadlines: { overdueCount: number; dueSoonCount: number; upcoming: DeadlineRow[] };
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
  deadlines,
}: ChiefAccountantCabinetProps) {
  const firstName = userName.split(" ")[0];
  const monthLabel = formatUzMonthYear(`${currentMonth}-01`);

  const roleLabels: Record<string, string> = {
    accountant: "Buxgalter",
    bank_manager: "Bank-Klient",
    supervisor: "Nazoratchi",
  };

  return (
    <div className="space-y-6">
      {/* Sarlavha — `firstName` va `monthLabel` allaqachon hisoblanardi,
          lekin HECH QAYERDA ko'rsatilmasdi: bu ekran umuman sarlavhasiz,
          davr belgisisiz ochilardi. */}
      <PageHeader
        icon={<ShieldCheck size={20} />}
        title={`Xush kelibsiz, ${firstName}`}
        description={`Bosh buxgalter kabineti — ${monthLabel}`}
      />

      {/* Ko'rsatkichlar — endi bosiladigan. Bu fayl 344 qator bo'lib,
          ichida BIRORTA ham havola yo'q edi. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          label="Firmalar" value={companiesCount} tone="indigo"
          icon={<Building2 size={15} />} href="/organizations"
        />
        <KpiCard
          label="Jamoa" value={teamMembers.length} tone="brand"
          icon={<Users size={15} />} href="/staff"
        />
        <KpiCard
          label="KPI kutmoqda" value={pendingApprovals.length} tone="warning" emphasize
          icon={<Clock size={15} />} href="/kpi"
        />
        <KpiCard
          label="Jamoa KPI" value={Math.round(totalTeamScore)} tone="success" emphasize
          icon={<TrendingUp size={15} />} href="/kpi"
        />
      </div>

      {/* Muddatlar — jamoa firmalari bo'yicha */}
      <DeadlinesWidget
        overdueCount={deadlines.overdueCount}
        dueSoonCount={deadlines.dueSoonCount}
        upcoming={deadlines.upcoming}
        scopeLabel="Jamoa firmalari"
      />

      {/* Jamoa ko'rsatkichlari + KPI tasdiqlash */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Jamoa a'zolari */}
        <div className="glass-card overflow-hidden">
          <div className="flex items-center justify-between p-5" style={{ borderBottom: "1px solid var(--card-border)" }}>
            <div className="flex items-center gap-2">
              <Users size={18} style={{ color: "var(--accent-blue)" }} />
              <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>Jamoa Ko&apos;rsatkichlari</h2>
            </div>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--card-border)" }}>
            {teamMembers.length === 0 ? (
              <div className="p-8 text-center text-text-secondary">
                <Users size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Jamoa a&apos;zolari yo&apos;q</p>
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
                    className="flex items-center gap-4 p-4 transition-colors row-hover"
                    style={{ borderBottom: "1px solid var(--card-border)" }}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                      style={{ background: member.avatarColor || "var(--accent-indigo)" }}
                    >
                      {member.fullName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                          {member.fullName}
                        </p>
                        <span className="text-micro px-1.5 py-0.5 rounded-lg" style={{ background: "var(--input-bg)", color: "var(--text-secondary)", border: "1px solid var(--card-border)" }}>
                          {roleLabels[member.role] || member.role}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 rounded-full h-1.5" style={{ background: "var(--input-bg)" }}>
                          <div
                            className="h-1.5 rounded-full transition-all"
                            style={{ width: `${percent}%`, background: "var(--accent-indigo)" }}
                          />
                        </div>
                        <span className="text-xs w-8 text-right" style={{ color: "var(--text-muted)" }}>{percent}%</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{score.toFixed(0)}</p>
                      <p className="text-micro" style={{ color: "var(--text-muted)" }}>
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
          <div className="glass-card overflow-hidden">
            <div className="flex items-center justify-between p-5" style={{ borderBottom: "1px solid var(--card-border)" }}>
              <div className="flex items-center gap-2">
                <TrendingUp size={18} style={{ color: "var(--accent-blue)" }} />
                <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>KPI Tasdiqlanishi</h2>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--warning-bg)", color: "var(--warning)", border: "1px solid var(--warning-border)" }}>
                {pendingApprovals.length}
              </span>
            </div>
            <div className="max-h-52 overflow-y-auto">
              {pendingApprovals.length === 0 ? (
                <div className="p-6 text-center text-text-secondary">
                  <CheckCircle2 size={28} className="mx-auto mb-2 text-[color-mix(in_srgb,var(--success)_30%,transparent)]" />
                  <p className="text-sm">Barcha KPI tasdiqlangan</p>
                </div>
              ) : (
                pendingApprovals.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-3 transition-colors row-hover"
                    style={{ borderBottom: "1px solid var(--card-border)" }}
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ background: item.employee.avatarColor || "var(--accent-indigo)" }}
                    >
                      {item.employee.fullName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {item.employee.fullName}
                      </p>
                      <p className="text-micro truncate" style={{ color: "var(--text-muted)" }}>{item.rule.nameUz}</p>
                    </div>
                    <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                      {Number(item.calculatedScore).toFixed(1)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Maosh tuzatmalar */}
          <div className="glass-card overflow-hidden">
            <div className="flex items-center justify-between p-5" style={{ borderBottom: "1px solid var(--card-border)" }}>
              <div className="flex items-center gap-2">
                <DollarSign size={18} style={{ color: "var(--success)" }} />
                <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>Tasdiq Kutayotgan</h2>
              </div>
            </div>
            <div className="divide-y" style={{ borderColor: "var(--card-border)" }}>
              {payrollSummary.length === 0 ? (
                <div className="p-5 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                  Tasdiq kutayotgan yo&apos;q
                </div>
              ) : (
                payrollSummary.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 p-3 transition-colors row-hover"
                    style={{ borderBottom: "1px solid var(--card-border)" }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {item.employee.fullName}
                      </p>
                      <p className="text-micro truncate" style={{ color: "var(--text-muted)" }}>{item.reason}</p>
                    </div>
                    <span
                      className="text-sm font-bold"
                      style={{ color: item.adjustmentType === "jarima" ? "var(--danger)" : "var(--success)" }}
                    >
                      {item.adjustmentType === "jarima" ? "-" : "+"}
                      {formatNum(Number(item.amount))}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Firmalar jadvali */}
      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-between p-5" style={{ borderBottom: "1px solid var(--card-border)" }}>
          <div className="flex items-center gap-2">
            <FileCheck size={18} style={{ color: "var(--accent-indigo)" }} />
            <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>Nazorat Ostidagi Firmalar</h2>
          </div>
          <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{companiesCount} ta</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px" style={{ background: "var(--card-border)" }}>
          {chiefCompanies.slice(0, 9).map((company) => (
            <div
              key={company.id}
              className="flex items-center gap-3 p-4 transition-colors row-hover"
              style={{ background: "var(--input-bg)" }}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(99,102,241,0.15)" }}>
                <Building2 size={14} style={{ color: "var(--accent-indigo)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{company.name}</p>
                {company.accountant && (
                  <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                    {company.accountant.fullName}
                  </p>
                )}
              </div>
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{
                  background: company.riskLevel === "high"
                    ? "var(--danger)"
                    : company.riskLevel === "medium"
                    ? "var(--warning)"
                    : "var(--success)"
                }}
              />
            </div>
          ))}
        </div>
        {companiesCount > 9 && (
          <div className="p-3 text-center text-xs" style={{ color: "var(--text-muted)", borderTop: "1px solid var(--card-border)" }}>
            +{companiesCount - 9} ta firma ko&apos;rsatilmadi
          </div>
        )}
      </div>
    </div>
  );
}
