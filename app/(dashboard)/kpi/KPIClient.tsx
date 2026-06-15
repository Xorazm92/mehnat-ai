"use client";

import React from "react";
import SalaryKPIModule from "@/components/SalaryKPIModule";
import { Company, Staff, OperationEntry } from "@/types";

interface Props {
  companies: Company[];
  staff: Staff[];
  operations: OperationEntry[];
  userRole: string;
}

export default function KPIClient({ companies, staff, operations, userRole }: Props) {
  return (
    <SalaryKPIModule
      companies={companies}
      staff={staff}
      operations={operations}
      lang="uz"
      currentUserRole={userRole}
    />
  );
}
