import { auth } from "@/lib/auth";
import { getUsers } from "@/server/users";
import { getCompanyStats } from "@/server/companies";
import { getKpiRules } from "@/server/kpi";
import { getAuditLogs } from "@/server/audit";
import { AdminOverview } from "@/components/admin/AdminOverview";

export default async function AdminOverviewPage() {
  const session = await auth();
  const role = (session?.user?.role ?? "") as string;

  // Resilient: one failing query must not blank the whole overview.
  const [usersR, companyR, kpiR, auditR] = await Promise.allSettled([
    getUsers(),
    getCompanyStats(),
    getKpiRules(),
    getAuditLogs({ limit: 8 }),
  ]);

  const users = usersR.status === "fulfilled" ? usersR.value : [];
  const companyStats = companyR.status === "fulfilled" ? companyR.value : { total: 0 };
  const kpiRules = kpiR.status === "fulfilled" ? kpiR.value : [];
  const audit = auditR.status === "fulfilled" ? auditR.value : [];

  const byRole: Record<string, number> = {};
  for (const u of users as Array<{ role: string; isActive: boolean }>) {
    byRole[u.role] = (byRole[u.role] || 0) + 1;
  }
  const activeUsers = (users as Array<{ isActive: boolean }>).filter((u) => u.isActive).length;

  const stats = {
    totalUsers: users.length,
    activeUsers,
    byRole,
    companies: (companyStats as { total?: number }).total ?? 0,
    kpiRules: (kpiRules as unknown[]).length,
  };

  return (
    <AdminOverview
      role={role}
      stats={stats}
      recentAudit={JSON.parse(JSON.stringify(audit))}
    />
  );
}
