"use client";

import React from "react";
import { useRouter } from "next/navigation";
import ExpenseModule from "@/components/ExpenseModule";
import { Expense, BalanceBreakdown } from "@/types";
import { createExpense, updateExpense, deleteExpense, approveExpense, rejectExpense } from "@/server/kassa";

interface Props {
  expenses: Expense[];
  userRole?: string;
  balance?: BalanceBreakdown;
}

export default function ExpensesClient({ expenses, userRole, balance }: Props) {
  const router = useRouter();

  const handleSave = async (expense: Partial<Expense>) => {
    const data = {
      amount: Number(expense.amount || 0),
      date: new Date(expense.date as string),
      category: expense.category as string,
      description: expense.description,
      paymentMethod: expense.paymentMethod || "naqd",
    };
    try {
      if (expense.id) {
        await updateExpense(expense.id, data);
      } else {
        await createExpense(data);
      }
      router.refresh();
    } catch (e) {
      // Balans yetarli emas / huquq yo'q — xabarni foydalanuvchiga ko'rsat
      alert((e as Error).message);
      throw e; // modal ochiq qolishi uchun xatoni yuqoriga qaytaramiz
    }
  };

  const handleDelete = async (id: string) => {
    await deleteExpense(id);
    router.refresh();
  };

  const handleApprove = async (id: string) => {
    try { await approveExpense(id); router.refresh(); }
    catch (e) { alert((e as Error).message); }
  };
  const handleReject = async (id: string) => {
    const reason = window.prompt("Rad etish sababi:") || "";
    if (!reason) return;
    try { await rejectExpense(id, reason); router.refresh(); }
    catch (e) { alert((e as Error).message); }
  };

  return (
    <ExpenseModule
      expenses={expenses}
      lang="uz"
      userRole={userRole}
      balance={balance}
      onSaveExpense={handleSave}
      onDeleteExpense={handleDelete}
      onApproveExpense={handleApprove}
      onRejectExpense={handleReject}
    />
  );
}
