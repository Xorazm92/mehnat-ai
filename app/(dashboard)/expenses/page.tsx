import { getExpenses } from "@/server/kassa";
import { auth } from "@/lib/auth";
import ExpensesClient from "./ExpensesClient";

export default async function ExpensesPage() {
  const session = await auth();
  const userRole = (session?.user?.role as string) || "";
  const expenses = await getExpenses();

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
      <ExpensesClient expenses={JSON.parse(JSON.stringify(mappedExpenses))} userRole={userRole} />
    </div>
  );
}
