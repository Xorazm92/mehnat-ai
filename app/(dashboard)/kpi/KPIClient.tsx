"use client";

import React from "react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import SalaryKPIModule from "@/components/SalaryKPIModule";
import BotKpiProjectionButton from "@/components/BotKpiProjectionButton";
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
      {canProjectBotKpi && currentMonth && (
        <div className="flex justify-end px-4 pt-3">
          <BotKpiProjectionButton month={currentMonth} />
        </div>
      )}
      <div className="min-h-0 flex-1">
        <SalaryKPIModule
          companies={companies}
          staff={staff}
          operations={operations}
          lang="uz"
          currentUserRole={userRole}
          currentUserId={userId}
        />
      </div>
    </div>
  );
}
