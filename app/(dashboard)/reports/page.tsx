import { auth } from "@/lib/auth";
import { getCachedCompanies, getCachedUsers, getCachedOperations } from "@/lib/cached-queries";
import { getEffectiveReportColumns } from "@/server/report-columns";
import ReportsClient from "./ReportsClient";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; col?: string; period?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const userRole = session?.user?.role || "employee";
  const userName = session?.user?.name ?? "";

  const [companies, staff, operations, reportColumns] = await Promise.all([
    getCachedCompanies(userId, userRole),
    getCachedUsers(),
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
        focusPeriod={sp.period ?? null}
        reportColumns={reportColumns}
      />
    </div>
  );
}
