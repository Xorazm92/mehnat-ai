import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCachedCompanies, getCachedUsers, getCachedOperations } from "@/lib/cached-queries";
import { isSeniorRole } from "@/lib/permissions";
import { getEffectiveViewsForRole } from "@/server/rbac";
import { readTabParam } from "@/lib/tabs";
import { KPI_TAB_IDS, defaultKpiTab, type KpiTabId } from "@/lib/kpiTabs";
import KPIClient from "./KPIClient";

export const metadata = { title: "KPI" };

export default async function KpiPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  // Sessiyasiz davom etilsa server amallari "Unauthorized" tashlaydi va
  // foydalanuvchi login o'rniga 500 ko'radi.
  if (!session) redirect("/login?expired=1");
  const userId = session?.user?.id ?? "";
  const userRole = session?.user?.role || "employee";
  // Current accounting month (UTC "YYYY-MM"), computed server-side — safe to pass
  // to the client (no Date rendered in the browser → no hydration mismatch).
  const currentMonth = new Date().toISOString().slice(0, 7);

  const [companies, staff, operations, views] = await Promise.all([
    getCachedCompanies(userId, userRole),
    getCachedUsers(userId, userRole),
    getCachedOperations(userId, userRole),
    // "Oylik hisob-kitobi" havolasi faqat o'sha sahifani ko'ra oladigan rolga
    // chiziladi — admin RBAC editoridagi override ham hisobga olinadi.
    getEffectiveViewsForRole(userRole).catch(() => [] as string[]),
  ]);

  const mappedStaff = staff.map(u => ({
    ...u,
    name: u.fullName,
    status: u.status || undefined,
  }));

  // Yorliq URL'da yashaydi: `/kpi?tab=reyting` havolasi hamkasbda ham aynan
  // reytingni ochadi. Qiymat serverda tekshiriladi — hidratsiya mos keladi.
  const initialTab = readTabParam<KpiTabId>(sp.tab, KPI_TAB_IDS, defaultKpiTab(userRole));

  return (
    <div className="h-full">
      <KPIClient
        companies={JSON.parse(JSON.stringify(companies))}
        staff={JSON.parse(JSON.stringify(mappedStaff))}
        operations={JSON.parse(JSON.stringify(operations))}
        userRole={userRole}
        userId={userId}
        canProjectBotKpi={isSeniorRole(userRole)}
        currentMonth={currentMonth}
        initialTab={initialTab}
        canSeePayroll={(views as string[]).includes("payroll")}
      />
    </div>
  );
}
