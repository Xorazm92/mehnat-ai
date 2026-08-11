"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import ExpenseModule from "@/components/ExpenseModule";
import { Expense, BalanceBreakdown } from "@/types";
import { createExpense, updateExpense, deleteExpense, approveExpense, rejectExpense } from "@/server/kassa";
import { toast } from "sonner";
import { usePrompt } from "@/components/ui/ConfirmDialog";

interface Props {
  expenses: Expense[];
  userRole?: string;
  balance?: BalanceBreakdown;
}

export default function ExpensesClient({ expenses, userRole, balance }: Props) {
  const prompt = usePrompt();
  const router = useRouter();
  useAutoRefresh();

  const handleSave = async (expense: Partial<Expense>) => {
    const data = {
      amount: Number(expense.amount || 0),
      date: new Date(expense.date as string),
      category: expense.category as string,
      description: expense.description,
      paymentMethod: expense.paymentMethod || "naqd",
      // Pul manbai — server ham tekshiradi (assertFundingSource).
      channelId: expense.channelId || undefined,
    };
    // Manbani formada MAJBURIY qilamiz: ustun NULL ga ruxsat beradi (691 ta
    // eski yozuv buzilmasin), lekin yangi xarajat manbasiz kirmasligi kerak —
    // aks holda "pul qayerdan chiqdi" savoli yana javobsiz qolardi.
    if (!data.channelId) {
      toast.error("Pul manbaini tanlang — qaysi schyot yoki plastikdan chiqdi");
      throw new Error("channelId required");
    }
    try {
      if (expense.id) {
        await updateExpense(expense.id, data);
      } else {
        await createExpense(data);
      }
      router.refresh();
    } catch (e) {
      // Balans yetarli emas / huquq yo'q — xabarni foydalanuvchiga ko'rsat
      toast.error((e as Error).message);
      throw e; // modal ochiq qolishi uchun xatoni yuqoriga qaytaramiz
    }
  };

  const handleDelete = async (id: string) => {
    await deleteExpense(id);
    router.refresh();
  };

  const handleApprove = async (id: string) => {
    try { await approveExpense(id); router.refresh(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const handleReject = async (id: string) => {
    const reason = await prompt({
      title: "Xarajat rad etilsinmi?",
      reasonLabel: "Rad etish sababi",
      reasonPlaceholder: "Nima uchun rad etilyapti?",
      confirmLabel: "Rad etish",
      tone: "danger",
    });
    if (!reason) return;
    try { await rejectExpense(id, reason); router.refresh(); }
    catch (e) { toast.error((e as Error).message); }
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
