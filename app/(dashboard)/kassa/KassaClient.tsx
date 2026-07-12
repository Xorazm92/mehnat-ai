"use client";

import React from "react";
import { useRouter } from "next/navigation";
import KassaModule from "@/components/KassaModule";
import { Company, Payment } from "@/types";
import { upsertPayment, deletePayment } from "@/server/kassa";

interface Props {
  companies: Company[];
  payments: Payment[];
}

export default function KassaClient({ companies, payments }: Props) {
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
    <KassaModule
      companies={companies}
      payments={payments}
      lang="uz"
      onSavePayment={handleSave}
      onDeletePayment={handleDelete}
    />
  );
}
