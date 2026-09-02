"use client";

import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  ChevronRight,
  ClipboardList,
  User as UserIcon,
} from "lucide-react";
import { formatUzDateFull, formatUzMonthYear } from "@/lib/platform/format";
import DeadlinesWidget, { type DeadlineRow } from "@/components/DeadlinesWidget";
import { KpiCard } from "@/components/ui/KpiCard";

interface CompanyProgress {
  id: string;
  name: string;
  inn: string;
  taxRegime: string | null;
  riskLevel: string | null;
  kpiEnabled: boolean;
  progress: { total: number; done: number; pending: number; missing: number; percent: number; hasData: boolean };
}

export interface AccountantCabinetProps {
  userName: string;
  companies: CompanyProgress[];
  companiesCount: number;
  reportSummary: { required: number; done: number; pending: number; percent: number | null };
  kpi: { totalScore: number; approvedCount: number; pendingCount: number };
  currentMonth: string;
  deadlines: { overdueCount: number; dueSoonCount: number; upcoming: DeadlineRow[] };
}

const taxRegimeLabels: Record<string, string> = {
  vat: "QQS",
  turnover: "Aylanma",
  fixed: "Qat'iy",
  yatt: "YaTT",
  income: "Daromad",
};

const riskColor = (r: string | null) =>
  r === "high" ? "var(--danger)" : r === "medium" ? "var(--warning)" : "var(--success)";

const barColor = (p: number) =>
  p >= 80 ? "var(--success)" : p >= 40 ? "var(--warning)" : "var(--danger)";

export function AccountantCabinet({
  userName,
  companies,
  companiesCount,
  reportSummary,
  kpi,
  currentMonth,
  deadlines,
}: AccountantCabinetProps) {
  const firstName = userName.split(" ")[0] || userName;
  const monthLabel = formatUzMonthYear(`${currentMonth}-01`);

  return (
    <div className="space-y-6">
      {/* Salomlashuv */}
      <div className="page-header">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Xush kelibsiz, {firstName}
        </h1>
        <p className="font-mono text-meta mt-1.5" style={{ color: "var(--text-secondary)" }}>
          {formatUzDateFull(new Date())} · {monthLabel}
        </p>
      </div>

      {/* Ko'rsatkichlar */}
      {/* To'rttala plitka qo'lda terilgan edi — biri `rgba(99,102,241,0.1)` ni
          qotirib yozgan, ya'ni qorong'u temada ham o'sha och indigo qolardi.
          Endi `KpiCard`: ranglar tokenlardan, plitkalar bosiladigan. Yagona
          katta urg'u — o'tib ketgan muddat, va faqat u nolda bo'lmasa. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          label="Firmalarim" value={companiesCount} tone="brand"
          icon={<Building2 size={15} />} href="/organizations"
        />
        <KpiCard
          label="Hisobot bajarilishi"
          value={reportSummary.percent === null ? "—" : `${reportSummary.percent}%`}
          tone="success" emphasize
          icon={<CheckCircle2 size={15} />}
          hint={reportSummary.percent === null ? "Ma'lumot yo'q" : `${reportSummary.done}/${reportSummary.required} hisobot`}
        />
        <KpiCard
          label="O'tib ketgan muddat"
          value={deadlines.overdueCount}
          tone={deadlines.overdueCount > 0 ? "danger" : "neutral"}
          emphasize={deadlines.overdueCount > 0}
          emphasis={deadlines.overdueCount > 0}
          icon={<AlertTriangle size={15} />} href="/deadlines?tab=overdue"
        />
        <KpiCard
          label="KPI ball" value={kpi.totalScore.toFixed(0)} tone="indigo"
          icon={<TrendingUp size={15} />} href="/kpi"
          hint={kpi.pendingCount > 0 ? `${kpi.pendingCount} tasdiq kutmoqda` : undefined}
        />
      </div>

      {/* Firmalar hisobot holati + Muddatlar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Firmalarim — joriy oy hisobot progressi */}
        <div className="glass-card overflow-hidden">
          <div className="flex items-center justify-between p-5" style={{ borderBottom: "1px solid var(--card-border)" }}>
            <div className="flex items-center gap-2">
              <ClipboardList size={18} style={{ color: "var(--accent-blue)" }} />
              <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>Firmalar hisoboti</h2>
              <span className="text-micro px-1.5 py-0.5 rounded-lg" style={{ background: "var(--input-bg)", color: "var(--text-muted)", border: "1px solid var(--card-border)" }}>
                {monthLabel}
              </span>
            </div>
            <Link href="/reports" className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--brand)" }}>
              Matritsa <ChevronRight size={14} />
            </Link>
          </div>

          {companies.length === 0 ? (
            <div className="p-8 text-center" style={{ color: "var(--text-secondary)" }}>
              <Building2 size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Biriktirilgan firma yo&apos;q</p>
            </div>
          ) : (
            <div>
              {companies.map((c) => (
                <Link
                  key={c.id}
                  href="/reports"
                  className="flex items-center gap-4 p-4 transition-colors hover:bg-[var(--table-row-hover)]"
                  style={{ borderTop: "1px solid var(--card-border)" }}
                >
                  <div className="w-2 h-9 rounded-full flex-shrink-0" style={{ background: riskColor(c.riskLevel) }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{c.name}</p>
                      {c.taxRegime && (
                        <span className="text-micro px-1.5 py-0.5 rounded-lg flex-shrink-0" style={{ background: "var(--input-bg)", color: "var(--text-secondary)", border: "1px solid var(--card-border)" }}>
                          {taxRegimeLabels[c.taxRegime] ?? c.taxRegime}
                        </span>
                      )}
                    </div>
                    {c.progress.hasData ? (
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 rounded-full h-1.5 overflow-hidden" style={{ background: "var(--input-bg)" }}>
                          <div className="h-1.5 rounded-full transition-all" style={{ width: `${c.progress.percent}%`, background: barColor(c.progress.percent) }} />
                        </div>
                        <span className="text-micro w-12 text-right tabular" style={{ color: "var(--text-muted)" }}>
                          {c.progress.done}/{c.progress.total}
                        </span>
                      </div>
                    ) : (
                      <p className="text-micro mt-1.5" style={{ color: "var(--text-muted)" }}>Bu oy hali hisobot belgilanmagan</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    {c.progress.hasData ? (
                      <>
                        <span className="text-sm font-bold tabular" style={{ color: barColor(c.progress.percent) }}>{c.progress.percent}%</span>
                        {c.progress.pending > 0 && (
                          <p className="text-micro" style={{ color: "var(--info)" }}>{c.progress.pending} kutmoqda</p>
                        )}
                      </>
                    ) : (
                      <span className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Muddatlar */}
        <DeadlinesWidget
          overdueCount={deadlines.overdueCount}
          dueSoonCount={deadlines.dueSoonCount}
          upcoming={deadlines.upcoming}
          scopeLabel="Firmalarim"
        />
      </div>

      {/* KPI & Oylik qisqa xulosa — batafsili shaxsiy kabinetda */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <UserIcon size={18} style={{ color: "var(--accent-purple)" }} />
            <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>KPI &amp; Oylik</h2>
          </div>
          <Link href="/cabinet" className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--brand)" }}>
            Shaxsiy kabinet <ChevronRight size={14} />
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-micro uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Umumiy ball</p>
            <p className="text-xl font-bold mt-1" style={{ color: "var(--text-primary)" }}>{kpi.totalScore.toFixed(0)}</p>
          </div>
          <div>
            <p className="text-micro uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Tasdiqlangan</p>
            <p className="text-xl font-bold mt-1" style={{ color: "var(--success)" }}>{kpi.approvedCount}</p>
          </div>
          <div>
            <p className="text-micro uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Kutmoqda</p>
            <p className="text-xl font-bold mt-1" style={{ color: "var(--warning)" }}>{kpi.pendingCount}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
