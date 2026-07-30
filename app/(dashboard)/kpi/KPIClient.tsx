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
  canProjectBotKpi?: boolean;
  currentMonth?: string;
}

export default function KPIClient({
  companies,
  staff,
  operations,
  userRole,
  userId,
  canProjectBotKpi,
  currentMonth,
}: Props) {
  useAutoRefresh();
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <SalaryKPIModule
          companies={companies}
          staff={staff}
          operations={operations}
          lang="uz"
          currentUserRole={userRole}
          currentUserId={userId}
          canProjectBotKpi={canProjectBotKpi}
          currentMonth={currentMonth}
        />
      </div>
    </div>
  );
}
