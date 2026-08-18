import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { currentUserViews } from "@/server/rbac";
import { prisma } from "@/lib/prisma";
import { getTransitOverview, getUnlinkedCardTransfers, getHouseholdExpenses } from "@/server/transit";
import { getBankExpenses } from "@/server/bankImport";
import ChiqimKassaClient from "./ChiqimKassaClient";

export const metadata = { title: "Chiqim kassa" };

export default async function ChiqimKassaPage() {
  const session = await auth();
  if (!session) redirect("/login?expired=1");

  // Darvoza `kassa_expense` ko'rinishi orqali — proxy bilan AYNAN bir manba
  // (server/rbac.ts → currentUserViews), ya'ni admin RBAC editoridan
  // o'zgartirilsa bu sahifa ham darhol unga bo'ysunadi.
  //
  // Ilgari bu yerda qattiq `isAdminRole` turardi ("rasxodni faqat man
  // qilaman"). Qoida 2026-08-18 da o'zgardi — kassani kundalik yurituvchi
  // xodim chiqim tomonini ham yozadi; server action'lar o'z tekshiruvini
  // saqlaydi (server/transit.ts requireKassa / requireAdmin).
  const views = await currentUserViews();
  if (!views.includes("kassa_expense")) redirect("/cabinet");

  const [overview, unlinked, household, bankExpenses, employees] = await Promise.all([
    getTransitOverview(),
    getUnlinkedCardTransfers(),
    getHouseholdExpenses(),
    getBankExpenses(),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  return (
    <div className="h-full">
      <ChiqimKassaClient
        overview={JSON.parse(JSON.stringify(overview))}
        unlinked={JSON.parse(JSON.stringify(unlinked))}
        household={JSON.parse(JSON.stringify(household))}
        bankExpenses={JSON.parse(JSON.stringify(bankExpenses))}
        employees={JSON.parse(JSON.stringify(employees))}
      />
    </div>
  );
}
