import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { currentUserViews } from "@/server/rbac";
import { prisma } from "@/lib/prisma";
import { getTransitOverview, getUnlinkedCardTransfers, getHouseholdExpenses } from "@/server/transit";
import { getExpenseQueue } from "@/server/bankImport";
import { getExpenses } from "@/server/kassa";
import { getAvailableBalance } from "@/lib/balance";
import { KASSA_CATEGORIES_KEY, resolveKassaCategories } from "@/lib/kassaCategories";
import ChiqimKassaClient from "./ChiqimKassaClient";

export const metadata = { title: "Chiqim kassa" };

export default async function ChiqimKassaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const session = await auth();
  if (!session) redirect("/login?expired=1");

  // Darvoza IKKI ko'rinishdan BIRI bilan ochiladi — proxy bilan AYNAN bir
  // manba (server/rbac.ts → currentUserViews):
  //   `kassa_expense` — tranzit kanallarni kundalik yurituvchi (to'liq sahifa)
  //   `expenses`      — faqat xarajat tasdig'i (masalan Nazoratchi, Bosh
  //                     buxgalter — ular tranzit kartalarni BOSHQARMAYDI,
  //                     lekin xarajatni ko'rish/tasdiqlash huquqi bor edi
  //                     va ilgari buning uchun ALOHIDA `/expenses` sahifasi
  //                     bor edi. `/expenses` va shu yerdagi "Yopish kerak →
  //                     Xarajat" navbati AYNAN BIR jadvalga (`KassaEntry`)
  //                     yozar edi — ikki joyda bir xil ma'lumot ko'rsatish
  //                     "qayerga borishni bilmayman" chalkashligini kuchaytirardi.
  //                     Endi bitta joy: shu sahifaning "Xarajat" tabi.
  const views = await currentUserViews();
  const canManageChannels = views.includes("kassa_expense");
  const canViewExpenses = views.includes("expenses");
  if (!canManageChannels && !canViewExpenses) redirect("/cabinet");

  const [overview, unlinked, household, queue, employees, expenses, balance, catRow] = await Promise.all([
    canManageChannels ? getTransitOverview() : Promise.resolve({ channels: [], totalBalance: 0, unlinkedCount: 0 }),
    canManageChannels ? getUnlinkedCardTransfers() : Promise.resolve([]),
    canManageChannels ? getHouseholdExpenses() : Promise.resolve(undefined),
    canManageChannels ? getExpenseQueue() : Promise.resolve({ rows: [], truncated: 0 }),
    canManageChannels
      ? prisma.user.findMany({
          where: { isActive: true },
          select: { id: true, fullName: true, role: true },
          orderBy: { fullName: "asc" },
        })
      : Promise.resolve([]),
    getExpenses(),
    getAvailableBalance(),
    prisma.systemSetting.findUnique({ where: { key: KASSA_CATEGORIES_KEY } }),
  ]);

  const expenseCategories = resolveKassaCategories(catRow?.value).expense;
  const mappedExpenses = expenses.map((e) => ({
    id: e.id,
    amount: Number(e.amount),
    date: e.date.toISOString(),
    category: e.category,
    description: e.description || "",
    createdAt: e.createdAt.toISOString(),
    status: (e as { status?: string }).status || "approved",
    rejectedReason: (e as { rejectedReason?: string | null }).rejectedReason ?? null,
  }));

  return (
    <div className="h-full">
      <ChiqimKassaClient
        overview={JSON.parse(JSON.stringify(overview))}
        unlinked={JSON.parse(JSON.stringify(unlinked))}
        household={household ? JSON.parse(JSON.stringify(household)) : undefined}
        queue={JSON.parse(JSON.stringify(queue))}
        employees={JSON.parse(JSON.stringify(employees))}
        expenses={mappedExpenses}
        expenseBalance={JSON.parse(JSON.stringify(balance))}
        expenseCategories={expenseCategories}
        userRole={(session.user.role as string) || ""}
        canManageChannels={canManageChannels}
        initialTab={
          tab === "navbat" || tab === "kartalar" || tab === "xojalik" || tab === "xarajat"
            ? tab
            : undefined
        }
      />
    </div>
  );
}
