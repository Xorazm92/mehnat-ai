import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getBankCabinetData, getDashboardDeadlines } from "@/server/cabinet";
import { currentUserViews } from "@/server/rbac";
import { BankCabinet } from "@/components/cabinets/BankCabinet";

export const metadata = { title: "Bank kabineti" };

export default async function BankCabinetPage() {
  const session = await auth();
  if (!session) redirect("/login?expired=1");

  const userName = session.user?.name || "";

  // Darvoza LAVOZIMGA emas, amaldagi ekranlarga qaraydi — proxy bilan aynan
  // bir manba (rol + override + biriktiruv).
  //
  // Ilgari bu yerda `userRole !== "bank_manager"` turardi va `/dashboard` ga
  // yuborardi. Bank slotida turgan buxgalter (Zamira, Humora) menyuda "Bank
  // kabineti" ni ko'rardi, bosgach `/dashboard` ga tushardi, u yerga esa
  // ruxsati yo'q — proxy uni `/403` ga otardi. Yon panel o'sha havolani
  // prefetch qilgani uchun bu sekundiga o'nlab marta takrorlanardi.
  //
  // Qaytish manzili ham `/dashboard` emas, `/cabinet`: uni HAR BIR rol
  // ko'radi, ya'ni bu redirect hech qachon 403 ga aylanmaydi.
  const views = await currentUserViews();
  if (!views.includes("cabinet_bank")) {
    redirect("/cabinet");
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
