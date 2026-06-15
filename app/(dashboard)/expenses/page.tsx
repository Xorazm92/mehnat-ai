import ExpensesClient from "./ExpensesClient";

export default async function ExpensesPage() {
  return (
    <div className="h-full">
      <ExpensesClient
        expenses={[]}
      />
    </div>
  );
}
