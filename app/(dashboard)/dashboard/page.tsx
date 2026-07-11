import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  getCachedCompanyStats,
  getCachedOperationSummary,
  getCachedUnreadCount,
} from "@/lib/cached-queries";
import {
  getAdminCabinetData,
  getSupervisorCabinetData,
  getChiefAccountantCabinetData,
} from "@/server/cabinet";
import { AdminCabinet } from "@/components/cabinets/AdminCabinet";
import { SupervisorCabinet } from "@/components/cabinets/SupervisorCabinet";
import { ChiefAccountantCabinet } from "@/components/cabinets/ChiefAccountantCabinet";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const userId = session.user?.id;
  const userRole = session.user?.role as string;
  const userName = session.user?.name || "";

  // Buxgalter va bank-klient o'z kabinetiga yo'naltirilsin
  if (userRole === "accountant") redirect("/cabinet");
  if (userRole === "bank_manager") redirect("/cabinet/bank");

  // ─── SUPERVISOR ───────────────────────────────────────────
  if (userRole === "supervisor") {
    const data = await getSupervisorCabinetData().catch(() => ({
      supervisedCompanies: [],
      companiesCount: 0,
      accountants: [],
      pendingKpi: [],
      riskStats: [],
      currentMonth: new Date().toISOString().slice(0, 7),
    }));

    return (
      <SupervisorCabinet
        userName={userName}
        supervisedCompanies={data.supervisedCompanies as any}
        companiesCount={data.companiesCount}
        accountants={data.accountants as any}
        pendingKpi={data.pendingKpi as any}
        riskStats={data.riskStats as any}
        currentMonth={data.currentMonth}
      />
    );
  }

  // ─── CHIEF ACCOUNTANT ─────────────────────────────────────
  if (userRole === "chief_accountant") {
    const data = await getChiefAccountantCabinetData().catch(() => ({
      chiefCompanies: [],
      companiesCount: 0,
      teamMembers: [],
      pendingApprovals: [],
      payrollSummary: [],
      totalTeamScore: 0,
      currentMonth: new Date().toISOString().slice(0, 7),
    }));

    return (
      <ChiefAccountantCabinet
        userName={userName}
        chiefCompanies={data.chiefCompanies as any}
        companiesCount={data.companiesCount}
        teamMembers={data.teamMembers as any}
        pendingApprovals={data.pendingApprovals as any}
        payrollSummary={data.payrollSummary as any}
        totalTeamScore={data.totalTeamScore}
        currentMonth={data.currentMonth}
      />
    );
  }

  // ─── ADMIN / SUPER_ADMIN ──────────────────────────────────
  if (["admin", "super_admin"].includes(userRole)) {
    const data = await getAdminCabinetData().catch(() => ({
      userStats: [],
      companyStats: 0,
      recentAudit: [],
      systemHealth: {
        activeUsers: 0,
        activeCompanies: 0,
        unreadNotifs: 0,
        pendingKpi: 0,
        kpiCompletionPercent: 0,
        payrollFund: 0,
      },
    }));

    return (
      <AdminCabinet
        userName={userName}
        userRole={userRole}
        userStats={data.userStats as any}
        companyStats={data.companyStats}
        recentAudit={data.recentAudit as any}
        systemHealth={data.systemHealth}
      />
    );
  }

  // ─── Fallback: umumiy dashboard — CACHED ──────────────────
  const [companyStats, operationStats] = await Promise.all([
    getCachedCompanyStats(userId, userRole).catch(() => ({ total: 0, byTaxRegime: [], byRisk: [] })),
    getCachedOperationSummary(userId, userRole).catch(() => ({
      total: 0,
      accepted: 0,
      rejected: 0,
      blocked: 0,
      inProgress: 0,
      pending: 0,
    })),
    getCachedUnreadCount(userId).catch(() => 0),
  ]);

  const progressPercent =
    operationStats.total > 0
      ? Math.round((operationStats.accepted / operationStats.total) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Xush kelibsiz, {userName.split(" ")[0]}! 👋
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          {new Date().toLocaleDateString("uz-UZ", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Jami firmalar" value={companyStats.total} icon="🏢" color="blue" />
        <StatCard title="Bajarilgan" value={operationStats.accepted} icon="✅" color="green" />
        <StatCard title="Kutilayotgan" value={operationStats.pending} icon="⏳" color="yellow" />
        <StatCard title="Bloklangan" value={operationStats.blocked} icon="🚫" color="red" />
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>Umumiy progress</h2>
          <span className="font-bold text-lg" style={{ color: "var(--accent-blue)" }}>{progressPercent}%</span>
        </div>
        <div className="w-full rounded-full h-3" style={{ background: "var(--input-bg)" }}>
          <div
            className="h-3 rounded-full transition-all duration-500"
            style={{
              width: `${progressPercent}%`,
              background:
                progressPercent >= 80
                  ? "linear-gradient(90deg, var(--success), var(--success-border))"
                  : progressPercent >= 50
                  ? "linear-gradient(90deg, var(--warning), var(--warning-border))"
                  : "linear-gradient(90deg, var(--danger), var(--danger-border))",
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
          <span>{operationStats.accepted} ta qabul qilindi</span>
          <span>{operationStats.total} ta jami</span>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: number;
  icon: string;
  color: "blue" | "green" | "yellow" | "red";
}) {
  const stylesMap = {
    blue: { bg: "var(--accent-blue-light)", border: "1px solid rgba(59, 130, 246, 0.2)", textColor: "var(--accent-blue)" },
    green: { bg: "var(--success-bg)", border: "1px solid var(--success-border)", textColor: "var(--success)" },
    yellow: { bg: "var(--warning-bg)", border: "1px solid var(--warning-border)", textColor: "var(--warning)" },
    red: { bg: "var(--danger-bg)", border: "1px solid var(--danger-border)", textColor: "var(--danger)" },
  };

  const style = stylesMap[color];

  return (
    <div className="rounded-2xl p-5" style={{ background: style.bg, border: style.border }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl">{icon}</span>
      </div>
      <div className="text-3xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>{value.toLocaleString()}</div>
      <div className="text-sm" style={{ color: "var(--text-muted)" }}>{title}</div>
    </div>
  );
}
