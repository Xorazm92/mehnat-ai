"use client";

import {
  Users,
  Building2,
  AlertTriangle,
  Clock,
  ChevronRight,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { formatUzMonthYear } from "@/lib/platform/format";
import Link from "next/link";
import DeadlinesWidget, { type DeadlineRow } from "@/components/DeadlinesWidget";
import { KpiCard } from "@/components/ui/KpiCard";
import { PageHeader } from "@/components/ui/PageHeader";

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
  deadlines: { overdueCount: number; dueSoonCount: number; upcoming: DeadlineRow[] };
}

export function SupervisorCabinet({
  userName,
  supervisedCompanies,
  companiesCount,
  accountants,
  pendingKpi,
  riskStats,
  currentMonth,
  deadlines,
}: SupervisorCabinetProps) {
  const firstName = userName.split(" ")[0];
  const monthLabel = formatUzMonthYear(`${currentMonth}-01`);

  const highRisk = riskStats.find((r) => r.riskLevel === "high")?._count || 0;
  const mediumRisk = riskStats.find((r) => r.riskLevel === "medium")?._count || 0;
  const lowRisk = riskStats.find((r) => r.riskLevel === "low")?._count || 0;

  return (
    <div className="space-y-6">
      {/* SARLAVHA — ilgari bu ekran umuman sarlavhasiz ochilardi.
          `firstName` va `monthLabel` yuqorida HISOBLANARDI, lekin hech
          qayerda chizilmasdi: ikkita o'lik o'zgaruvchi. Xuddi shu xato
          `ChiefAccountantCabinet` da topilib tuzatilgan (u yerdagi izohga
          qarang), lekin qo'shni fayl e'tibordan chetda qolgan — nazoratchi
          ekranni ochganda qaysi davr ko'rsatilayotganini bilmasdi. */}
      <PageHeader
        icon={<ShieldCheck size={20} />}
        title={`Xush kelibsiz, ${firstName}`}
        description={`Nazoratchi kabineti — ${monthLabel}`}
      />

      {/* Stats */}
      {/* Ko'rsatkichlar — har biri filtri qo'yilgan ro'yxatga olib boradi.
          Avval plitkalar bosilmasdi: "12 ta yuqori risk" ni ko'rgan nazoratchi
          qaysi firmalar ekanini bilish uchun filtrni qo'lda qayta terardi. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          label="Firmalar" value={companiesCount} tone="brand"
          icon={<Building2 size={15} />} href="/organizations"
        />
        <KpiCard
          label="Buxgalterlar" value={accountants.length} tone="indigo"
          icon={<Users size={15} />} href="/staff?staff_role=accountant"
        />
        <KpiCard
          label="Yuqori risk" value={highRisk} tone="danger" emphasize
          icon={<AlertTriangle size={15} />} href="/organizations?org_risk=high"
        />
        <KpiCard
          label="KPI kutmoqda" value={pendingKpi.length} tone="warning" emphasize
          icon={<Clock size={15} />} href="/kpi"
        />
      </div>

      {/* Muddatlar — nazorat ostidagi firmalar bo'yicha */}
      <DeadlinesWidget
        overdueCount={deadlines.overdueCount}
        dueSoonCount={deadlines.dueSoonCount}
        upcoming={deadlines.upcoming}
        scopeLabel="Nazorat firmalari"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Buxgalterlar holati */}
        <div className="bg-bg-card border border-border-glass rounded-xl overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-border-glass">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-[var(--accent-purple)]" />
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
                return (
                  <Link
                    href={`/staff?userId=${acc.id}`}
                    key={acc.id}
                    className="flex items-center gap-4 p-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-text-primary text-sm font-bold flex-shrink-0"
                      style={{ background: acc.avatarColor || "var(--brand)" }}
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
                            ? "bg-[var(--success)]"
                            : acc.status === "vacation"
                            ? "bg-[var(--warning)]"
                            : "bg-[var(--danger)]"
                        }`}
                      />
                      <ChevronRight size={14} style={{ color: "var(--text-muted)" }} />
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-4">
          {/* Risk Daraja */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck size={18} style={{ color: "var(--warning)" }} />
              <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>Risk Daraja</h2>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium w-16" style={{ color: "var(--danger)" }}>Yuqori</span>
                <div className="flex-1 rounded-full h-2" style={{ background: "var(--input-bg)" }}>
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: companiesCount
                        ? `${(highRisk / companiesCount) * 100}%`
                        : "0%",
                      background: "var(--danger)"
                    }}
                  />
                </div>
                <span className="text-sm font-bold w-6" style={{ color: "var(--text-primary)" }}>{highRisk}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium w-16" style={{ color: "var(--warning)" }}>O&apos;rta</span>
                <div className="flex-1 rounded-full h-2" style={{ background: "var(--input-bg)" }}>
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: companiesCount
                        ? `${(mediumRisk / companiesCount) * 100}%`
                        : "0%",
                      background: "var(--warning)"
                    }}
                  />
                </div>
                <span className="text-sm font-bold w-6" style={{ color: "var(--text-primary)" }}>{mediumRisk}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium w-16" style={{ color: "var(--success)" }}>Past</span>
                <div className="flex-1 rounded-full h-2" style={{ background: "var(--input-bg)" }}>
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: companiesCount
                        ? `${(lowRisk / companiesCount) * 100}%`
                        : "0%",
                      background: "var(--success)"
                    }}
                  />
                </div>
                <span className="text-sm font-bold w-6" style={{ color: "var(--text-primary)" }}>{lowRisk}</span>
              </div>
            </div>
          </div>
 
          {/* Tasdiqlash kutayotgan KPI */}
          <div className="glass-card overflow-hidden">
            <div className="flex items-center justify-between p-5" style={{ borderBottom: "1px solid var(--card-border)" }}>
              <div className="flex items-center gap-2">
                <TrendingUp size={18} style={{ color: "var(--accent-blue)" }} />
                <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>KPI Tasdiqlanishi</h2>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--warning-bg)", color: "var(--warning)", border: "1px solid var(--warning-border)" }}>
                {pendingKpi.length} ta
              </span>
            </div>
            <div className="max-h-52 overflow-y-auto">
              {pendingKpi.length === 0 ? (
                <div className="p-6 text-center" style={{ color: "var(--text-muted)" }}>
                  {/* "Barcha KPI tasdiqlangan" DEB BO'LMAYDI: bu ro'yxat faqat
                      TASDIQ KUTAYOTGANLARNI biladi. Umuman KPI kiritilmagan oyda
                      ham u bo'sh bo'ladi va ekran yashil belgi bilan "hammasi
                      bajarilgan" deb ko'rsatardi — nazoratchi uchun bu ish
                      boshlanmaganini bajarilgan deb o'qish demakdir.
                      (Xuddi shu oila: boshqaruv panelidagi "KPI bajarilishi 0%".)
                      Yangi matn ikkala holatda ham ROST. */}
                  <Clock size={28} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Tasdiqlash kutayotgan KPI yo&apos;q</p>
                </div>
              ) : (
                pendingKpi.map((item) => (
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
                      <p className="text-micro truncate" style={{ color: "var(--text-muted)" }}>
                        {item.rule.nameUz}
                      </p>
                    </div>
                    <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
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
        <div className="rounded-xl p-5" style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={18} style={{ color: "var(--danger)" }} />
            <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>Yuqori Risk Firmalar</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {supervisedCompanies
              .filter((c) => c.riskLevel === "high")
              .map((company) => (
                <div
                  key={company.id}
                  className="flex items-center gap-3 rounded-xl p-3"
                  style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)" }}
                >
                  <AlertTriangle size={14} style={{ color: "var(--danger)" }} className="flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{company.name}</p>
                    {company.accountant && (
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
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
