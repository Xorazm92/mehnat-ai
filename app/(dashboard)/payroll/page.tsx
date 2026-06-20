import { auth } from "@/lib/auth";
import { getCachedCompanies, getCachedUsers, getCachedOperations } from "@/lib/cached-queries";
import PayrollClient from "./PayrollClient";

export default async function PayrollPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  const userRole = (session?.user as any)?.role || "employee";

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
      <PayrollClient
        companies={JSON.parse(JSON.stringify(companies))}
        staff={JSON.parse(JSON.stringify(mappedStaff))}
        operations={JSON.parse(JSON.stringify(operations))}
        userRole={userRole}
      />
    </div>
  );
}
