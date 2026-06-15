import { auth } from "@/lib/auth";
import { getCompanies } from "@/server/companies";
import { getUsers } from "@/server/users";
import { getOperations } from "@/server/operations";
import OrganizationsClient from "./OrganizationsClient";

export default async function OrganizationsPage() {
  const session = await auth();
  const userRole = (session?.user as any)?.role || "employee";

  // Parallelda ma'lumotlarni olish
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
      <OrganizationsClient
        companies={JSON.parse(JSON.stringify(companies))}
        staff={JSON.parse(JSON.stringify(mappedStaff))}
        operations={JSON.parse(JSON.stringify(operations))}
        userRole={userRole}
      />
    </div>
  );
}
