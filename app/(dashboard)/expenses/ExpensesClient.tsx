"use client";

import React from "react";
import { useRouter } from "next/navigation";
import ExpenseModule from "@/components/ExpenseModule";
import { Expense } from "@/types";
import { createExpense, updateExpense, deleteExpense } from "@/server/kassa";

interface Props {
  expenses: Expense[];
}

export default function ExpensesClient({ expenses }: Props) {
  const router = useRouter();

  const handleSave = async (expense: Partial<Expense>) => {
    const data = {
      amount: Number(expense.amount || 0),
      date: new Date(expense.date as string),
      category: expense.category as string,
      description: expense.description,
    };
    if (expense.id) {
      await updateExpense(expense.id, data);
    } else {
      await createExpense(data);
    }
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    await deleteExpense(id);
    router.refresh();
  };

  return (
    <ExpenseModule
      expenses={expenses}
      lang="uz"
      onSaveExpense={handleSave}
      onDeleteExpense={handleDelete}
    />
  );
}
