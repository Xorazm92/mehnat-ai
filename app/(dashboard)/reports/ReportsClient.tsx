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
}

export default function ReportsClient({ companies, operations, staff, userRole }: Props) {
  const [selectedPeriod, setSelectedPeriod] = useState<string>("2026-03");
  const [tab, setTab] = useState<"reports" | "matrix">("reports");

  const handleUpdate = async (data: unknown) => {
    await upsertMonthlyReport(data as Parameters<typeof upsertMonthlyReport>[0]);
  };

  const tabs = [
    { id: "reports" as const, label: "Hisobotlar", icon: FileText },
    { id: "matrix" as const, label: "Amallar matritsasi", icon: Grid3x3 },
  ];

  return (
    <div className="space-y-0">
      <div className="flex gap-1 overflow-x-auto border-b bg-white dark:bg-[#1a1d23] pt-2 px-2 shadow-sm rounded-t"
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
      <div>
        {tab === "reports" ? (
          <HisobotlarModule companies={companies} staff={staff} lang="uz" />
        ) : (
          <OperationModule
            companies={companies}
            operations={operations}
            staff={staff}
            lang="uz"
            userRole={userRole}
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
