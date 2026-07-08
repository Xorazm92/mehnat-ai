import { getExpenses } from "@/server/kassa";
import ExpensesClient from "./ExpensesClient";

export default async function ExpensesPage() {
  const expenses = await getExpenses();

  const mappedExpenses = expenses.map((e) => ({
    id: e.id,
    amount: Number(e.amount),
    date: e.date.toISOString(),
    category: e.category,
    description: e.description || "",
    createdAt: e.createdAt.toISOString(),
  }));

  return (
    <div className="h-full">
      <ExpensesClient expenses={JSON.parse(JSON.stringify(mappedExpenses))} />
    </div>
  );
}
