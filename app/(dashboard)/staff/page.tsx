import { auth } from "@/lib/auth";
import { getCachedUsers, getCachedCompanies, getCachedOperations } from "@/lib/cached-queries";
import StaffClient from "./StaffClient";

export default async function StaffPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  const userRole = (session?.user as any)?.role || "employee";

  // Parallelda ma'lumotlarni cache'dan olish
  const [staff, companies, operations] = await Promise.all([
    getCachedUsers(),
    getCachedCompanies(userId, userRole),
    getCachedOperations(userId, userRole),
  ]);

  // Convert schema objects to frontend format mapping
  const mappedStaff = staff.map(u => ({
    ...u,
    name: u.fullName,
    status: u.status || undefined,
  }));

  return (
    <div className="h-full">
      <StaffClient
        staff={JSON.parse(JSON.stringify(mappedStaff))}
        companies={JSON.parse(JSON.stringify(companies))}
        operations={JSON.parse(JSON.stringify(operations))}
      />
    </div>
  );
}
