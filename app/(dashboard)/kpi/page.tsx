import { auth } from "@/lib/auth";
import { getCompanies } from "@/server/companies";
import { getUsers } from "@/server/users";
import { getOperations } from "@/server/operations";
import KPIClient from "./KPIClient";

export default async function KpiPage() {
  const session = await auth();
  const userRole = (session?.user as any)?.role || "employee";

  const [companies, staff, operations] = await Promise.all([
    getCompanies(),
    getUsers(),
    getOperations(),
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
      />
    </div>
  );
}
