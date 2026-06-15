import { auth } from "@/lib/auth";
import { getUsers } from "@/server/users";
import { getCompanies } from "@/server/companies";
import { getOperations } from "@/server/operations";
import StaffClient from "./StaffClient";

export default async function StaffPage() {
  const session = await auth();

  // Parallelda ma'lumotlarni olish
  const [staff, companies, operations] = await Promise.all([
    getUsers(),
    getCompanies(),
    getOperations(),
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
