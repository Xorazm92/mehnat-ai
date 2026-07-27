"use client";

import React, { useState } from "react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import OperationModule from "@/components/OperationModule";
import HisobotlarModule from "@/components/HisobotlarModule";
import { getCurrentPeriodKey } from "@/lib/periods";
import { upsertMonthlyReport } from "@/server/operations";
import { Company, Staff, OperationEntry } from "@/types";
import type { ReportColumn } from "@/lib/reportColumns";
import { FileText, Grid3x3 } from "lucide-react";

interface Props {
  companies: Company[];
  operations: OperationEntry[];
  staff: Staff[];
  userRole: string;
  currentUserId?: string;
  userName?: string;
  focusCompany?: string | null;
  focusCol?: string | null;
  focusPeriod?: string | null;
  reportColumns?: ReportColumn[];
}

export default function ReportsClient({ companies, operations, staff, userRole, currentUserId, userName, focusCompany, focusCol, focusPeriod, reportColumns }: Props) {
  useAutoRefresh();
  const hasFocus = !!(focusCompany && focusCol);
  const [selectedPeriod, setSelectedPeriod] = useState<string>(focusPeriod || getCurrentPeriodKey());
  const [tab, setTab] = useState<"reports" | "matrix">(hasFocus ? "matrix" : "reports");

  const handleUpdate = async (data: unknown) => {
    const payload = data as { companyId?: string; period?: string };
    if (payload?.companyId && payload?.period) {
      await upsertMonthlyReport(payload as Parameters<typeof upsertMonthlyReport>[0]);
    }
  };

  const tabs = [
    { id: "reports" as const, label: "Hisobotlar", icon: FileText },
    { id: "matrix" as const, label: "Amallar matritsasi", icon: Grid3x3 },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex gap-1 overflow-x-auto border-b bg-[var(--card-bg)] dark:bg-[var(--surface)] pt-2 px-2 shadow-sm rounded-t flex-shrink-0"
        style={{ borderColor: "var(--card-border)" }}>
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 py-2.5 px-6 font-bold text-xs uppercase transition-colors whitespace-nowrap border-t-[3px] rounded-t ${active ? "border-[var(--accent-indigo)] text-[var(--text-primary)] dark:text-white" : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:hover:text-white"}`}
              style={active ? { background: "var(--card-bg)" } : {}}>
              <t.icon size={16} /> <span>{t.label}</span>
            </button>
          );
        })}
      </div>
      <div className={`flex-1 min-h-0 ${tab === "matrix" ? "flex flex-col" : "overflow-auto"}`}>
        {tab === "reports" ? (
          <HisobotlarModule companies={companies} staff={staff} lang="uz" userRole={userRole} />
        ) : (
          <OperationModule
            companies={companies}
            operations={operations}
            staff={staff}
            lang="uz"
            userRole={userRole}
            currentUserId={currentUserId}
            userName={userName}
            focusProof={hasFocus ? { companyId: focusCompany as string, colKey: focusCol as string } : null}
            reportColumns={reportColumns}
            selectedPeriod={selectedPeriod}
            onPeriodChange={setSelectedPeriod}
            onCompanySelect={() => {}}
            onUpdate={handleUpdate}
          />
        )}
      </div>
    </div>
  );
}
