"use client";

import React from "react";
import { useRouter } from "next/navigation";
import KassaModule from "@/components/KassaModule";
import BalanceOverview from "@/components/BalanceOverview";
import { Company, Payment, BalanceBreakdown } from "@/types";
import { upsertPayment, deletePayment } from "@/server/kassa";

interface Props {
  companies: Company[];
  payments: Payment[];
  balance?: BalanceBreakdown;
}

export default function KassaClient({ companies, payments, balance }: Props) {
  const router = useRouter();

  const handleSave = async (payment: Partial<Payment>) => {
    await upsertPayment({
      companyId: payment.companyId as string,
      period: payment.period as string,
      amount: Number(payment.amount || 0),
      status: payment.status as string,
      paymentDate: payment.paymentDate ? new Date(payment.paymentDate) : undefined,
      paymentMethod: payment.paymentMethod || "naqd",
      comment: payment.comment,
    });
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    await deletePayment(id);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {balance && <BalanceOverview breakdown={balance} />}
      <KassaModule
        companies={companies}
        payments={payments}
        lang="uz"
        onSavePayment={handleSave}
        onDeletePayment={handleDelete}
      />
    </div>
  );
}
