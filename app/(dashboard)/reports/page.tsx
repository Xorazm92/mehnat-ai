import { auth } from "@/lib/auth";
import { getCachedCompanies, getCachedUsers, getCachedOperations } from "@/lib/cached-queries";
import { getEffectiveReportColumns } from "@/server/report-columns";
import { getCurrentPeriodKey, normalizePeriodKey } from "@/lib/periods";
import { readTabParam } from "@/lib/tabs";
import { REPORTS_TAB_IDS, type ReportsTabId } from "@/lib/reportsTabs";
import ReportsClient from "./ReportsClient";

export const metadata = { title: "Hisobotlar" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; col?: string; period?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();

  /**
   * Davr SERVERDA hal qilinadi: `new Date()` ni mijozda chaqirish SSR bilan
   * farq qilib hidratsiyani sindirishi mumkin edi.
   *
   * `normalizePeriodKey` — chunki dalil chuqur havolasi ("2026 Avgust" kabi
   * matnli davr bo'lishi mumkin) ham shu yerdan o'tadi; o'qib bo'lmaydigan
   * qiymat jimgina joriy oyga qaytadi.
   */
  const normalizedPeriod = normalizePeriodKey(sp.period ?? "");
  const initialPeriod = /^\d{4}-\d{2}$/.test(normalizedPeriod)
    ? normalizedPeriod
    : getCurrentPeriodKey();
  const userId = session?.user?.id ?? "";
  const userRole = session?.user?.role || "employee";
  const userName = session?.user?.name ?? "";

  const [companies, staff, operations, reportColumns] = await Promise.all([
    getCachedCompanies(userId, userRole),
    getCachedUsers(userId, userRole),
    getCachedOperations(userId, userRole),
    getEffectiveReportColumns(),
  ]);

  const mappedStaff = staff.map((u) => ({
    ...u,
    name: u.fullName,
    status: u.status || undefined,
  }));

  return (
    <div className="h-full">
      <ReportsClient
        companies={JSON.parse(JSON.stringify(companies))}
        staff={JSON.parse(JSON.stringify(mappedStaff))}
        operations={JSON.parse(JSON.stringify(operations))}
        userRole={userRole}
        currentUserId={userId}
        userName={userName}
        focusCompany={sp.company ?? null}
        focusCol={sp.col ?? null}
        initialPeriod={initialPeriod}
        reportColumns={reportColumns}
        initialTab={readTabParam<ReportsTabId>(sp.tab, REPORTS_TAB_IDS, "matrix")}
      />
    </div>
  );
}
