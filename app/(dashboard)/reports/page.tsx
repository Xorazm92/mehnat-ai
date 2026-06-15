import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCompanies } from "@/server/companies";
import { getUsers } from "@/server/users";
import { getMonthlyReports } from "@/server/operations";
import ReportsClient from "./ReportsClient";

export default async function ReportsPage() {
  const session = await auth();
  const userRole = (session?.user as any)?.role || "employee";

  // Actually, getMonthlyReports requires companyId to be provided, but here we want all reports.
  // The server action getMonthlyReports(companyId, period) is implemented only for specific company.
  // Wait, the frontend operations are actually monthly reports mapped.
  // Let's use getCompanies and empty operations for now, since getOperations exists but is for annual reports?
  // Let me look at getMonthlyReports - it requires companyId. Let's just fetch getOperations() instead or map all companies.
  const companies = await getCompanies();
  const companyIds = companies.map((c) => c.id);

  let staff: any[] = [];
  if (["super_admin", "admin", "chief_accountant", "supervisor"].includes(userRole)) {
    staff = await getUsers().catch(() => []);
  }

  const rawReports = await prisma.monthlyReport.findMany({
    where: { companyId: { in: companyIds } },
  });

  const mappedStaff = staff.map(u => ({
    ...u,
    name: u.fullName,
    status: u.status || undefined,
  }));

  // Convert raw reports to frontend OperationEntry format
  const mappedOperations: any[] = [];
  rawReports.forEach(r => {
    // Map each report column to an operation entry
    const cols = ['vat', 'turnover', 'income', 'water', 'property', 'land', 'salary', 'social', 'sick_leave', 'dividend'];
    cols.forEach(col => {
      if ((r as any)[col]) {
        mappedOperations.push({
          id: `${r.id}-${col}`,
          companyId: r.companyId,
          reportType: col,
          period: r.period,
          status: (r as any)[col],
          deadline: new Date().toISOString() // placeholder
        });
      }
    });
  });

  return (
    <div className="h-full">
      <ReportsClient
        companies={JSON.parse(JSON.stringify(companies))}
        staff={JSON.parse(JSON.stringify(mappedStaff))}
        operations={mappedOperations} 
        userRole={userRole}
      />
    </div>
  );
}
