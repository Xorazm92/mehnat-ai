import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAccountantCabinetData } from "@/server/cabinet";
import { AccountantCabinet } from "@/components/cabinets/AccountantCabinet";

export default async function CabinetPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const userRole = (session.user as any)?.role as string;
  const userName = session.user?.name || "";

  // Faqat accountant bu sahifaga kirishi mumkin
  // bank_manager → /cabinet/bank ga yo'naltiriladi
  if (userRole === "bank_manager") redirect("/cabinet/bank");

  // Senior rollar uchun → dashboard
  if (["super_admin", "admin", "chief_accountant", "supervisor"].includes(userRole)) {
    redirect("/dashboard");
  }

  const data = await getAccountantCabinetData().catch(() => ({
    companies: [],
    companiesCount: 0,
    kpi: { totalScore: 0, approvedCount: 0, pendingCount: 0, records: [] },
    adjustments: [],
    currentMonth: new Date().toISOString().slice(0, 7),
  }));

  return (
    <AccountantCabinet
      userName={userName}
      companies={data.companies as any}
      companiesCount={data.companiesCount}
      kpi={data.kpi as any}
      adjustments={data.adjustments as any}
      currentMonth={data.currentMonth}
    />
  );
}
