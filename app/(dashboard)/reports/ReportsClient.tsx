"use client";

import React, { useState } from "react";
import OperationModule from "@/components/OperationModule";
import { upsertMonthlyReport } from "@/server/operations";
import { Company, Staff, OperationEntry } from "@/types";

interface Props {
  companies: Company[];
  operations: OperationEntry[];
  staff: Staff[];
  userRole: string;
}

export default function ReportsClient({ companies, operations, staff, userRole }: Props) {
  const [selectedPeriod, setSelectedPeriod] = useState<string>("2026-03");

  const handleUpdate = async (data: any) => {
    await upsertMonthlyReport(data);
  };

  return (
    <OperationModule
      companies={companies}
      operations={operations}
      staff={staff}
      lang="uz"
      userRole={userRole}
      selectedPeriod={selectedPeriod}
      onPeriodChange={setSelectedPeriod}
      onCompanySelect={(c) => {}}
      onUpdate={handleUpdate}
    />
  );
}
