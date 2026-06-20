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

  const userId = (session.user as any)?.id;
  const userRole = (session.user as any)?.role as string;
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
  const [companyStats, operationStats, unreadNotifs] = await Promise.all([
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
        <h1 className="text-2xl font-bold text-text-primary">
          Xush kelibsiz, {userName.split(" ")[0]}! 👋
        </h1>
        <p className="text-text-secondary text-sm mt-1">
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

      <div className="bg-bg-card border border-border-glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-text-primary font-semibold">Umumiy progress</h2>
          <span className="text-blue-400 font-bold text-lg">{progressPercent}%</span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-3">
          <div
            className="h-3 rounded-full transition-all duration-500"
            style={{
              width: `${progressPercent}%`,
              background:
                progressPercent >= 80
                  ? "linear-gradient(90deg, #22c55e, #16a34a)"
                  : progressPercent >= 50
                  ? "linear-gradient(90deg, #eab308, #ca8a04)"
                  : "linear-gradient(90deg, #ef4444, #dc2626)",
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-3 text-xs text-text-secondary">
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
  const colors = {
    blue: "from-blue-600/20 to-blue-600/5 border-blue-500/20",
    green: "from-green-600/20 to-green-600/5 border-green-500/20",
    yellow: "from-yellow-600/20 to-yellow-600/5 border-yellow-500/20",
    red: "from-red-600/20 to-red-600/5 border-red-500/20",
  };

  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-2xl p-5`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl">{icon}</span>
      </div>
      <div className="text-3xl font-bold text-text-primary mb-1">{value.toLocaleString()}</div>
      <div className="text-sm text-text-secondary">{title}</div>
    </div>
  );
}
