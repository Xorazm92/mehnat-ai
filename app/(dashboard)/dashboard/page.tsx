import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Building2, CheckCircle2, Clock, Ban, type LucideIcon } from "lucide-react";
import { formatUzDateFull, formatNum } from "@/lib/platform/format";
import {
  getCachedCompanyStats,
  getCachedObligationSummary,
  getCachedUnreadCount,
} from "@/lib/cached-queries";
import {
  getAdminCabinetData,
  getSupervisorCabinetData,
  getChiefAccountantCabinetData,
  getAccountantCabinetData,
  getDashboardDeadlines,
} from "@/server/cabinet";
import { currentUserViews } from "@/server/rbac";
import { getOperationsTimeline } from "@/server/timeline";
import { getCompanyTwins, getStaffCapacity } from "@/server/twin";
import { getCurrentPeriodKey } from "@/lib/periods";
import { readTabParam } from "@/lib/tabs";
import {
  DASHBOARD_TAB_IDS,
  DASHBOARD_DEFAULT_TAB,
  type DashboardTab,
} from "@/lib/dashboardTabs";
import { AdminCabinet } from "@/components/cabinets/AdminCabinet";
import { SupervisorCabinet } from "@/components/cabinets/SupervisorCabinet";
import { ChiefAccountantCabinet } from "@/components/cabinets/ChiefAccountantCabinet";
import { AccountantCabinet } from "@/components/cabinets/AccountantCabinet";
import CockpitPanel from "@/components/cockpit/CockpitPanel";
import DashboardTabs from "./DashboardTabs";

export const metadata = { title: "Boshqaruv paneli" };

// QOIDA: bu sahifada ma'lumot olishdagi xato YUTILMAYDI.
// Ilgari har bir kabinet `.catch(() => nol qiymatlar)` ishlatardi va baza
// yiqilganda ekran nollar bilan to'lardi — buxgalterga esa `percent: 100`,
// ya'ni "hammasi topshirilgan" deb ko'rsatardi. Muddat nazorati tizimida bu
// eng xavfli holat: yolg'on xotirjamlik. Endi xato `error.tsx` ga chiqadi.
//
// YAGONA BOSH EKRAN. Ilgari menyuda ikkita "uy" turardi — bu sahifa va
// `/cockpit` — va uchinchisi (`/director`) umuman menyusiz, darvozasiz
// osilib qolgan edi. Endi bitta manzil, ichida ikki yorliq:
//   `holat`  — rolga qarab kabinet (bu fayldagi eski mantiq, o'zgarmagan)
//   `kokpit` — muddatlar oqimi, xavf va yuklama (`components/cockpit`)
// Yorliq ma'lumoti SERVERDA olinadi, shuning uchun `kokpit` uchun kerakli
// uchta og'ir so'rov faqat o'sha yorliq faol bo'lgandagina yuguradi.

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const session = await auth();
  if (!session) redirect("/login?expired=1");

  const userId = session.user?.id;
  const userRole = session.user?.role as string;
  const userName = session.user?.name || "";

  // Bank-klient o'z maxsus kabinetiga yo'naltirilsin
  if (userRole === "bank_manager") redirect("/cabinet/bank");

  // Kokpit yorlig'i ALOHIDA ruxsat talab qiladi. Darvoza YORLIQDA, marshrutda
  // emas — marshrut endi umumiy. Ruxsatsiz foydalanuvchi `?tab=kokpit` deb
  // qo'lda yozsa `readTabParam` uni jimgina `holat` ga qaytaradi, chunki
  // o'sha yorliq ruxsat etilganlar ro'yxatiga umuman kiritilmaydi.
  //
  // Statik ro'yxatda bu shart bugun hech kimni to'smaydi: `/dashboard` ga
  // kira oladigan to'rtala rolda (`super_admin`, `admin`, `chief_accountant`,
  // `supervisor`) `cockpit` ham bor. Shart baribir kerak, chunki rol→ko'rinish
  // xaritasini admin tahrirlaydi (`SystemSetting: "roleViews"`).
  const views = await currentUserViews();
  const canCockpit = views.includes("cockpit");
  const allowedTabs: readonly DashboardTab[] = canCockpit
    ? DASHBOARD_TAB_IDS
    : [DASHBOARD_DEFAULT_TAB];
  const activeTab = readTabParam<DashboardTab>(tab, allowedTabs, DASHBOARD_DEFAULT_TAB);

  // Yorliq almashtirgich faqat tanlov BOR bo'lganda chiziladi: bitta yorliqli
  // almashtirgich foydalanuvchiga hech narsa bermaydi, faqat joy egallaydi.
  const tabsBar = canCockpit ? (
    <div className="mb-4">
      <DashboardTabs active={activeTab} />
    </div>
  ) : null;

  if (activeTab === "kokpit") {
    const period = getCurrentPeriodKey();
    const [timeline, twins, capacity] = await Promise.all([
      getOperationsTimeline(),
      getCompanyTwins(period),
      getStaffCapacity(period),
    ]);

    return (
      <div className="space-y-4">
        {tabsBar}
        <CockpitPanel
          period={period}
          timeline={JSON.parse(JSON.stringify(timeline))}
          twins={JSON.parse(JSON.stringify(twins))}
          capacity={JSON.parse(JSON.stringify(capacity))}
        />
      </div>
    );
  }

  // ─── BUXGALTER — operatsion dashboard ─────────────────────
  // Statik ro'yxatda buxgalterda `dashboard` ko'rinishi YO'Q (uyi —
  // `/cabinet`), ya'ni bu shox odatda ishlamaydi. O'chirilmaydi: admin
  // `roleViews` orqali `dashboard` ni buxgalterga berishi mumkin va o'shanda
  // u ekranni sarlavhasiz emas, o'z kabineti bilan ochishi kerak.
  if (userRole === "accountant") {
    const [data, deadlines] = await Promise.all([
      getAccountantCabinetData(),
      getDashboardDeadlines(),
    ]);

    return (
      <>
        {tabsBar}
        <AccountantCabinet
          userName={userName}
          companies={data.companies as any}
          companiesCount={data.companiesCount}
          reportSummary={(data as any).reportSummary}
          kpi={(data as any).kpi}
          currentMonth={data.currentMonth}
          deadlines={deadlines as any}
        />
      </>
    );
  }

  // ─── SUPERVISOR ───────────────────────────────────────────
  if (userRole === "supervisor") {
    const [data, deadlines] = await Promise.all([
      getSupervisorCabinetData(),
      getDashboardDeadlines(),
    ]);

    return (
      <>
        {tabsBar}
        <SupervisorCabinet
          userName={userName}
          supervisedCompanies={data.supervisedCompanies as any}
          companiesCount={data.companiesCount}
          accountants={data.accountants as any}
          pendingKpi={data.pendingKpi as any}
          riskStats={data.riskStats as any}
          currentMonth={data.currentMonth}
          deadlines={deadlines as any}
        />
      </>
    );
  }

  // ─── CHIEF ACCOUNTANT ─────────────────────────────────────
  if (userRole === "chief_accountant") {
    const [data, deadlines] = await Promise.all([
      getChiefAccountantCabinetData(),
      getDashboardDeadlines(),
    ]);

    return (
      <>
        {tabsBar}
        <ChiefAccountantCabinet
          userName={userName}
          chiefCompanies={data.chiefCompanies as any}
          companiesCount={data.companiesCount}
          teamMembers={data.teamMembers as any}
          pendingApprovals={data.pendingApprovals as any}
          payrollSummary={data.payrollSummary as any}
          totalTeamScore={data.totalTeamScore}
          currentMonth={data.currentMonth}
          deadlines={deadlines as any}
        />
      </>
    );
  }

  // ─── ADMIN / SUPER_ADMIN ──────────────────────────────────
  if (["admin", "super_admin"].includes(userRole)) {
    const [data, deadlines] = await Promise.all([
      getAdminCabinetData(),
      getDashboardDeadlines(),
    ]);

    return (
      <>
        {tabsBar}
        <AdminCabinet
          userName={userName}
          userRole={userRole}
          userStats={data.userStats as any}
          companyStats={data.companyStats}
          recentAudit={data.recentAudit as any}
          systemHealth={data.systemHealth}
          balance={data.balance}
          monthlyCashFlow={(data as any).monthlyCashFlow ?? []}
          deadlines={deadlines as any}
        />
      </>
    );
  }

  // ─── Fallback: umumiy dashboard — CACHED ──────────────────
  const [companyStats, obligationStats] = await Promise.all([
    getCachedCompanyStats(userId, userRole),
    getCachedObligationSummary(userId, userRole),
    getCachedUnreadCount(userId),
  ]);

  const progressPercent =
    obligationStats.total > 0
      ? Math.round((obligationStats.accepted / obligationStats.total) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {tabsBar}
      <div className="page-header">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Xush kelibsiz, {userName.split(" ")[0]}
        </h1>
        <p className="font-mono text-meta mt-1.5" style={{ color: "var(--text-secondary)" }}>
          {formatUzDateFull(new Date())}
        </p>
      </div>

      {/* Ko'rsatkichlar tasmasi — to'rtta suzuvchi plitka emas, chiziq bilan
          bo'lingan bitta panel. Belgilar lucide'dan: emoji har OT'da boshqa
          ko'rinishda chiziladi va temaga bo'yalmaydi. */}
      <div className="stat-strip">
        <Stat label="Jami firmalar" value={companyStats.total} Icon={Building2} />
        <Stat label="Bajarilgan" value={obligationStats.accepted} Icon={CheckCircle2} tone="var(--success)" />
        <Stat label="Kutilayotgan" value={obligationStats.pending} Icon={Clock} tone="var(--warning)" />
        <Stat label="Muddati o&apos;tgan" value={obligationStats.overdue} Icon={Ban} tone="var(--danger)" />
      </div>

      <div className="dashboard-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Umumiy progress
          </h2>
          <span className="font-mono text-lg font-semibold tabular" style={{ color: "var(--text-primary)" }}>
            {progressPercent}%
          </span>
        </div>
        {/* Gradient o'rniga tekis to'ldirish: qiymatni holat rangi bildiradi,
            rangdan rangga o'tish emas. */}
        <div className="w-full rounded-full h-2 overflow-hidden" style={{ background: "var(--bg-sunken)" }}>
          <div
            className="h-2 rounded-full transition-[width] duration-300"
            style={{
              width: `${progressPercent}%`,
              background:
                progressPercent >= 80
                  ? "var(--success)"
                  : progressPercent >= 50
                  ? "var(--warning)"
                  : "var(--danger)",
            }}
          />
        </div>
        <div
          className="flex items-center justify-between mt-3 font-mono text-micro uppercase"
          style={{ color: "var(--text-muted)", letterSpacing: "0.08em" }}
        >
          <span>{formatNum(obligationStats.accepted)} ta qabul qilindi</span>
          <span>{formatNum(obligationStats.total)} ta jami</span>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  Icon,
  tone,
}: {
  label: string;
  value: number;
  Icon: LucideIcon;
  tone?: string;
}) {
  return (
    <div>
      <span className="stat-label flex items-center gap-1.5">
        <Icon size={12} style={{ color: tone ?? "var(--text-muted)" }} />
        {label}
      </span>
      <span className="stat-value" style={tone ? { color: tone } : undefined}>
        {formatNum(value)}
      </span>
    </div>
  );
}
