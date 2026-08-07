"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import OrganizationModule from "@/components/OrganizationModule";
import CompanyDrawer from "@/components/CompanyDrawer";
import { createCompany, updateCompany, deleteCompany } from "@/server/companies";
import { getCurrentPeriodKey } from "@/lib/periods";
import { Company, Staff, OperationEntry } from "@/types";
import type { TariffPreset } from "@/lib/tariffPresets";

interface Props {
  companies: Company[];
  staff: Staff[];
  operations: OperationEntry[];
  userRole: string;
  tariffPreset: TariffPreset;
}

export default function OrganizationsClient({ companies, staff, operations, tariffPreset }: Props) {
  const router = useRouter();
  useAutoRefresh();
  const [selectedPeriod, setSelectedPeriod] = useState<string>(getCurrentPeriodKey());
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  // router.refresh() dan keyin drawer'dagi ma'lumot server holati bilan
  // sinxron bo'lsin — aks holda tahrirdan keyin eski qiymatlar ko'rinadi.
  useEffect(() => {
    setSelectedCompany(prev =>
      prev ? companies.find(c => c.id === prev.id) ?? prev : prev
    );
  }, [companies]);

  const handleSave = async (company: Partial<Company>, assignments?: any[]) => {
    const isExisting = companies.some(c => c.id === company.id);
    if (isExisting) {
      await updateCompany(company.id as string, company as any, assignments);
      // Drawer ochiq qolsin — faqat ko'rsatilayotgan ma'lumotni yangilaymiz.
      // Aks holda xizmat checkboxini belgilash drawerni yopib yuborardi.
      setSelectedCompany(prev =>
        prev && prev.id === company.id ? { ...prev, ...company } as Company : prev
      );
    } else {
      await createCompany(company as any, assignments);
    }
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    await deleteCompany(id);
    router.refresh();
  };

  return (
    <>
      <OrganizationModule
        companies={companies}
        staff={staff}
        operations={operations}
        lang="uz"
        tariffPreset={tariffPreset}
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
        onSave={handleSave}
        onDelete={handleDelete}
        onCompanySelect={setSelectedCompany}
      />
      <CompanyDrawer
        company={selectedCompany}
        operation={null}
        payments={[]}
        staff={staff}
        lang="uz"
        onClose={() => setSelectedCompany(null)}
        onSave={handleSave}
      />
    </>
  );
}
