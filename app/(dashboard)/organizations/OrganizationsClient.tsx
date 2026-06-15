"use client";

import React, { useState } from "react";
import OrganizationModule from "@/components/OrganizationModule";
import { createCompany, updateCompany, deleteCompany } from "@/server/companies";
import { Company, Staff, OperationEntry } from "@/types";

interface Props {
  companies: Company[];
  staff: Staff[];
  operations: OperationEntry[];
  userRole: string;
}

export default function OrganizationsClient({ companies, staff, operations, userRole }: Props) {
  const [selectedPeriod, setSelectedPeriod] = useState<string>("2026-03");

  const handleSave = async (company: Partial<Company>) => {
    const isExisting = companies.some(c => c.id === company.id);
    if (isExisting) {
      await updateCompany(company.id as string, company as any);
    } else {
      await createCompany(company as any);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteCompany(id);
  };

  return (
    <OrganizationModule
      companies={companies}
      staff={staff}
      operations={operations}
      lang="uz"
      selectedPeriod={selectedPeriod}
      onPeriodChange={setSelectedPeriod}
      onSave={handleSave}
      onDelete={handleDelete}
      onCompanySelect={(c) => {}}
    />
  );
}
