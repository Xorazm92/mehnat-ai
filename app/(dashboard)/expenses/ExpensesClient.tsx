"use client";

import React from "react";
import ExpenseModule from "@/components/ExpenseModule";
import { Expense } from "@/types";

interface Props {
  expenses: Expense[];
}

export default function ExpensesClient({ expenses }: Props) {
  return (
    <ExpenseModule
      expenses={expenses}
      lang="uz"
      onSaveExpense={async () => {}}
      onDeleteExpense={async () => {}}
    />
  );
}
