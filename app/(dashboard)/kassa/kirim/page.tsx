import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { canSeeViewWith } from "@/lib/permissions";
import { getRoleViewOverrides } from "@/server/rbac";
import { getBankAccountsOverview, getUnmatchedIncome } from "@/server/bankImport";
import { prisma } from "@/lib/prisma";
import KirimKassaClient from "./KirimKassaClient";

export const metadata = { title: "Kirim kassa" };

export default async function KirimKassaPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = session.user.role as string;
  // proxy.ts ham to'sadi, lekin sahifa o'zini o'zi qo'riqlashi kerak —
  // to'g'ridan-to'g'ri chaqiruvda (RSC) proxy oralig'i bo'lmasligi mumkin.
  const overrides = await getRoleViewOverrides().catch(() => null);
  if (!canSeeViewWith(role as never, "kassa_income", overrides)) redirect("/cabinet");

  const [accounts, unmatched, manualIncome] = await Promise.all([
    getBankAccountsOverview(),
    getUnmatchedIncome(),
    // Naqd va plastik kirimlari — bank vipiskasidan tashqari qo'lda kiritiladi.
    prisma.kassaEntry.findMany({
      where: { type: "income", deletedAt: null },
      select: { id: true, amount: true, category: true, description: true, date: true },
      orderBy: { date: "desc" },
      take: 50,
    }),
  ]);

  // Mijozlar ro'yxati — moslashtirilmagan tranzaksiyani qo'lda bog'lash uchun.
  const companies = await prisma.company.findMany({
    where: { isActive: true, isOwnFirm: false },
    select: {
      id: true,
      name: true,
      inn: true,
      contracts: { where: { isActive: true }, select: { id: true, number: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="h-full">
      <KirimKassaClient
        accounts={JSON.parse(JSON.stringify(accounts))}
        unmatched={JSON.parse(JSON.stringify(unmatched))}
        manualIncome={JSON.parse(JSON.stringify(manualIncome))}
        companies={JSON.parse(JSON.stringify(companies))}
      />
    </div>
  );
}
