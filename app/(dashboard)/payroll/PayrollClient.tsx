"use client";

import React, { useState } from "react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import PayrollDrafts from "@/components/PayrollDrafts";
import PayrollTable from "@/components/PayrollTable";
import { Company, Staff, OperationEntry } from "@/types";

interface Props {
  companies: Company[];
  staff: Staff[];
  operations: OperationEntry[];
  userRole: string;
}

export default function PayrollClient({ companies, staff, operations, userRole }: Props) {
  useAutoRefresh();
  const [activeTab, setActiveTab] = useState<'drafts' | 'history'>('drafts');

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex items-center gap-4 border-b border-[var(--rule-strong)] pb-4">
        <button
          onClick={() => setActiveTab('drafts')}
          className={`px-6 py-2.5 rounded-xl font-bold uppercase tracking-widest text-xs transition-all ${
            activeTab === 'drafts' 
              ? 'bg-[var(--brand)] text-text-primary shadow-lg shadow-blue-500/20' 
              : 'bg-bg-card text-text-secondary hover:text-text-primary'
          }`}
        >
          Oylik Hisoblash
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-6 py-2.5 rounded-xl font-bold uppercase tracking-widest text-xs transition-all ${
            activeTab === 'history' 
              ? 'bg-[var(--brand)] text-text-primary shadow-lg shadow-blue-500/20' 
              : 'bg-bg-card text-text-secondary hover:text-text-primary'
          }`}
        >
          To&apos;lovlar Tarixi
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === 'drafts' ? (
          <PayrollDrafts
            companies={companies}
            staff={staff}
            operations={operations}
            lang="uz"
            userRole={userRole}
          />
        ) : (
          <PayrollTable
            companies={companies}
            staff={staff}
            operations={operations}
            lang="uz"
            currentUserRole={userRole}
          />
        )}
      </div>
    </div>
  );
}
