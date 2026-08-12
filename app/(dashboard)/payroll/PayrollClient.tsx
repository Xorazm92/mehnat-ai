"use client";

import React from "react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import PayrollDrafts from "@/components/PayrollDrafts";
import PayrollTable from "@/components/PayrollTable";
import { Company, Staff, OperationEntry } from "@/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, TabPanel } from "@/components/ui/Tabs";
import { useTabParam } from "@/hooks/useTabParam";
import { PAYROLL_TAB_IDS, type PayrollTabId } from "@/lib/payrollTabs";
import { CreditCard, Calculator, History } from "lucide-react";

interface Props {
  companies: Company[];
  staff: Staff[];
  operations: OperationEntry[];
  userRole: string;
  initialTab?: PayrollTabId;
}

/**
 * OYLIK — maosh hisob-kitobining YAGONA manzili.
 *
 * Ilgari `PayrollTable` shu yerda ham, `/kpi` ning "Payroll (Oylik)"
 * yorlig'ida ham chizilardi. Nusxa `/kpi` dan olib tashlandi; u yerda faqat
 * shu sahifaga havola qoldi.
 *
 * Yorliqlar `Tabs` primitiviga o'tkazildi. Eski tugmalarda `text-text-primary`
 * va `bg-bg-card` kabi Tailwind'da MAVJUD BO'LMAGAN sinflar bor edi — ya'ni
 * faol tugmaning matn rangi umuman qo'llanmasdi va brend fon ustida past
 * kontrastli matn qolardi.
 */
export default function PayrollClient({ companies, staff, operations, userRole, initialTab = "drafts" }: Props) {
  useAutoRefresh();
  const [tab, setTab] = useTabParam<PayrollTabId>("tab", PAYROLL_TAB_IDS, initialTab);

  const tabs = [
    { id: "drafts" as const, label: "Oylik hisoblash", icon: Calculator, hint: "Joriy oy qoralamalari va tasdiqlash" },
    { id: "history" as const, label: "To'lovlar tarixi", icon: History, hint: "Tasdiqlangan va to'langan oyliklar" },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        icon={<CreditCard size={20} />}
        title="Oylik"
        description="Maosh hisoblash, qoralamalar va to'lovlar"
        className="flex-shrink-0"
      >
        <Tabs items={tabs} value={tab} onChange={setTab} idBase="payroll" ariaLabel="Oylik bo'limlari" />
      </PageHeader>

      <TabPanel tabId={tab} idBase="payroll" className="flex-1 min-h-0 overflow-y-auto">
        {tab === "drafts" ? (
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
      </TabPanel>
    </div>
  );
}
