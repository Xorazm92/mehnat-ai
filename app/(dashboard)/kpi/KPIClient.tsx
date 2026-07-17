"use client";

import React from "react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import SalaryKPIModule from "@/components/SalaryKPIModule";
import { Company, Staff, OperationEntry } from "@/types";

interface Props {
  companies: Company[];
  staff: Staff[];
  operations: OperationEntry[];
  userRole: string;
  userId: string;
}

export default function KPIClient({ companies, staff, operations, userRole, userId }: Props) {
  useAutoRefresh();
  return (
    <SalaryKPIModule
      companies={companies}
      staff={staff}
      operations={operations}
      lang="uz"
      currentUserRole={userRole}
      currentUserId={userId}
    />
  );
}
