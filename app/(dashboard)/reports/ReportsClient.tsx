"use client";

import React, { useState } from "react";
import OperationModule from "@/components/OperationModule";
import HisobotlarModule from "@/components/HisobotlarModule";
import { upsertMonthlyReport } from "@/server/operations";
import { Company, Staff, OperationEntry } from "@/types";
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
}

export default function ReportsClient({ companies, operations, staff, userRole, currentUserId, userName, focusCompany, focusCol, focusPeriod }: Props) {
  const hasFocus = !!(focusCompany && focusCol);
  const [selectedPeriod, setSelectedPeriod] = useState<string>(focusPeriod || "2026-03");
  const [tab, setTab] = useState<"reports" | "matrix">(hasFocus ? "matrix" : "reports");

  const handleUpdate = async (data: unknown) => {
    await upsertMonthlyReport(data as Parameters<typeof upsertMonthlyReport>[0]);
  };

  const tabs = [
    { id: "reports" as const, label: "Hisobotlar", icon: FileText },
    { id: "matrix" as const, label: "Amallar matritsasi", icon: Grid3x3 },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex gap-1 overflow-x-auto border-b bg-white dark:bg-[#1a1d23] pt-2 px-2 shadow-sm rounded-t flex-shrink-0"
        style={{ borderColor: "var(--card-border)" }}>
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 py-2.5 px-6 font-bold text-xs uppercase transition-colors whitespace-nowrap border-t-[3px] rounded-t ${active ? "border-indigo-600 text-gray-900 dark:text-white" : "border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white"}`}
              style={active ? { background: "var(--card-bg)" } : {}}>
              <t.icon size={16} /> <span>{t.label}</span>
            </button>
          );
        })}
      </div>
      <div className={`flex-1 min-h-0 ${tab === "matrix" ? "flex flex-col" : "overflow-auto"}`}>
        {tab === "reports" ? (
          <HisobotlarModule companies={companies} staff={staff} lang="uz" />
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
