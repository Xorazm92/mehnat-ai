import { auth } from "@/lib/auth";
import { getCachedCompanies, getCachedUsers, getCachedOperations } from "@/lib/cached-queries";
import { isSeniorRole } from "@/lib/permissions";
import KPIClient from "./KPIClient";

export const metadata = { title: "KPI" };

export default async function KpiPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const userRole = session?.user?.role || "employee";
  // Current accounting month (UTC "YYYY-MM"), computed server-side — safe to pass
  // to the client (no Date rendered in the browser → no hydration mismatch).
  const currentMonth = new Date().toISOString().slice(0, 7);

  const [companies, staff, operations] = await Promise.all([
    getCachedCompanies(userId, userRole),
    getCachedUsers(),
    getCachedOperations(userId, userRole),
  ]);

  const mappedStaff = staff.map(u => ({
    ...u,
    name: u.fullName,
    status: u.status || undefined,
  }));

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
      />
    </div>
  );
}
