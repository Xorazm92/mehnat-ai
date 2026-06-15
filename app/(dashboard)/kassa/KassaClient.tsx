"use client";

import React from "react";
import KassaModule from "@/components/KassaModule";
import { Company, Payment } from "@/types";

interface Props {
  companies: Company[];
  payments: Payment[];
}

export default function KassaClient({ companies, payments }: Props) {
  return (
    <KassaModule
      companies={companies}
      payments={payments}
      lang="uz"
      onSavePayment={async () => {}}
      onDeletePayment={async () => {}}
    />
  );
}
