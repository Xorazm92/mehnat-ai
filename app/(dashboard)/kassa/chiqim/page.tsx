import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isAdminRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getTransitOverview, getUnlinkedCardTransfers, getHouseholdExpenses } from "@/server/transit";
import ChiqimKassaClient from "./ChiqimKassaClient";

export const metadata = { title: "Chiqim kassa" };

export default async function ChiqimKassaPage() {
  const session = await auth();
  if (!session) redirect("/login");

  // "Rasxodni faqat man qilaman" — bu sahifa faqat admin uchun.
  // proxy.ts ham to'sadi, lekin sahifa o'zini o'zi qo'riqlashi kerak.
  if (!isAdminRole(session.user.role as string)) redirect("/cabinet");

  const [overview, unlinked, household, employees] = await Promise.all([
    getTransitOverview(),
    getUnlinkedCardTransfers(),
    getHouseholdExpenses(),
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
        employees={JSON.parse(JSON.stringify(employees))}
      />
    </div>
  );
}
