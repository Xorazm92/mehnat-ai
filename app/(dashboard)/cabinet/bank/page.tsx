import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getBankCabinetData, getDashboardDeadlines } from "@/server/cabinet";
import { BankCabinet } from "@/components/cabinets/BankCabinet";

export const metadata = { title: "Bank kabineti" };

export default async function BankCabinetPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const userRole = session.user?.role as string;
  const userName = session.user?.name || "";

  // Faqat bank_manager kirishi mumkin
  if (userRole !== "bank_manager") {
    redirect("/dashboard");
  }

  const [data, deadlines] = await Promise.all([
    getBankCabinetData().catch(() => ({
      assignedCompanies: [],
      companiesCount: 0,
      kassaEntries: [],
      kpiRecords: [],
      balance: { income: 0, expense: 0, net: 0 },
      currentMonth: new Date().toISOString().slice(0, 7),
    })),
    getDashboardDeadlines().catch(() => ({ overdueCount: 0, dueSoonCount: 0, upcoming: [] })),
  ]);

  return (
    <BankCabinet
      userName={userName}
      assignedCompanies={data.assignedCompanies as any}
      companiesCount={data.companiesCount}
      kassaEntries={data.kassaEntries as any}
      kpiRecords={data.kpiRecords as any}
      balance={data.balance}
      currentMonth={data.currentMonth}
      deadlines={deadlines as any}
    />
  );
}
