import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCachedCompanies, getCachedUsers, getCachedOperations } from "@/lib/cached-queries";
import { readTabParam } from "@/lib/tabs";
import { PAYROLL_TAB_IDS, type PayrollTabId } from "@/lib/payrollTabs";
import PayrollClient from "./PayrollClient";

export const metadata = { title: "Oylik" };

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  // Sessiyasiz davom etilsa server amallari "Unauthorized" tashlaydi va
  // foydalanuvchi login o'rniga 500 ko'radi.
  if (!session) redirect("/login?expired=1");
  const userId = session?.user?.id ?? "";
  const userRole = session?.user?.role || "employee";

  const [companies, staff, operations] = await Promise.all([
    getCachedCompanies(userId, userRole),
    getCachedUsers(userId, userRole),
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
        initialTab={readTabParam<PayrollTabId>(sp.tab, PAYROLL_TAB_IDS, "drafts")}
      />
    </div>
  );
}
