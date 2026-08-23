import { getExpenses } from "@/server/kassa";
import { getAvailableBalance } from "@/lib/balance";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  KASSA_CATEGORIES_KEY,
  resolveKassaCategories,
} from "@/lib/kassaCategories";
import ExpensesClient from "./ExpensesClient";

export const metadata = { title: "Xarajatlar" };

export default async function ExpensesPage() {
  const session = await auth();
  const userRole = (session?.user?.role as string) || "";
  const [expenses, balance] = await Promise.all([getExpenses(), getAvailableBalance()]);

  // Toifalar KORXONA LUG'ATIDAN ("Kassa.json" → sozlama). Forma qattiq
  // kodlangan inglizcha ro'yxat bilan ochilardi ("Office", "Salary"…) —
  // u bazadagi hech bir yozuvga mos kelmasdi va yangi xarajat hisobotlarni
  // buzib qo'yardi. Sozlama yo'q bo'lsa standart lug'at ishlaydi
  // (`resolveKassaCategories`).
  const catRow = await prisma.systemSetting.findUnique({
    where: { key: KASSA_CATEGORIES_KEY },
  });
  const categories = resolveKassaCategories(catRow?.value).expense;

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
      <ExpensesClient
        expenses={mappedExpenses}
        userRole={userRole}
        balance={balance}
        categories={categories}
      />
    </div>
  );
}
