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
import { isAdminRole } from "@/lib/permissions";

interface Props {
  companies: Company[];
  staff: Staff[];
  operations: OperationEntry[];
  userRole: string;
  tariffPreset: TariffPreset;
  /** "Ichki shartnoma tomoni" variantlari — bazadagi o'z firmalarimiz. */
  internalContractors: { id: string; name: string }[];
  /**
   * Og'zaki shartnoma tomonlari — plastik/naqd kanallari (mas'ul odami bilan).
   * Mijoz 10 ta firmamizdan biri bilan shartnoma tuzmagan holat uchun.
   */
  internalParties?: { id: string; label: string; type: string; employee?: { fullName: string } | null }[];
}

export default function OrganizationsClient({ companies, staff, operations, userRole, tariffPreset, internalContractors, internalParties }: Props) {
  // RUXSAT — server bilan AYNAN bir xil shart.
  //
  // `userRole` bu komponentga allaqachon kelardi, lekin destructuring'da
  // tashlab yuborilgan va pastga uzatilmagan edi. Natijada buxgalter ham
  // "Yangi qo'shish" tugmasini va qatorda o'chirish ikonkasini ko'rardi:
  // server rad etadi, lekin foydalanuvchi buni faqat BOSGANDAN keyin
  // biladi. Shartlar `server/companies.ts` dagi darvozalardan ko'chirildi,
  // ya'ni ikkalasi bir manbadan emas, lekin BIR XIL — ular ajralib
  // ketmasligi uchun quyidagi izoh qoldiriladi.
  //
  //   createCompany  → isAdminRole(role) || role === "chief_accountant"
  //   deleteCompany  → isAdminRole(role)
  const canCreate = isAdminRole(userRole) || userRole === "chief_accountant";
  const canDelete = isAdminRole(userRole);
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
        internalContractors={internalContractors}
        internalParties={internalParties}
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
        onSave={handleSave}
        onDelete={handleDelete}
        canCreate={canCreate}
        canDelete={canDelete}
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
