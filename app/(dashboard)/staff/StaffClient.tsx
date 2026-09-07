"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import StaffModule from "@/components/StaffModule";
import { deactivateUser, resetUserPassword } from "@/server/users";
import { saveEmployee } from "@/components/employee-detail/saveEmployee";
import { Staff, Company, OperationEntry } from "@/types";
import { isAdminRole } from "@/lib/platform/permissions";

interface Props {
  staff: Staff[];
  companies: Company[];
  operations: OperationEntry[];
  userRole: string;
}

export default function StaffClient({ staff, companies, operations, userRole }: Props) {
  // RUXSAT — server bilan AYNAN bir shart.
  //
  //   createUser      → ["super_admin", "admin"]
  //   deactivateUser  → ["super_admin", "admin"]
  //
  // Ilgari bu tugmalar hammaga ko'rinardi: nazoratchi "Xodim qo'shish" va
  // qatorda faolsizlantirish ikonkasini ko'rardi, server esa rad etardi.
  // Foydalanuvchi buni faqat BOSGANDAN keyin bilardi.
  const canManageStaff = isAdminRole(userRole);
  const router = useRouter();
  useAutoRefresh();
  const handleSave = async (s: Partial<Staff>) => {
    await saveEmployee(s);
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    await deactivateUser(id);
    router.refresh();
  };

  const handleResetPassword = async (id: string, newPassword: string) => {
    await resetUserPassword(id, newPassword);
  };

  return (
    <StaffModule
      canManageStaff={canManageStaff}
      staff={staff}
      companies={companies}
      operations={operations}
      lang="uz"
      onSave={handleSave as (s: Staff) => Promise<void>}
      onDelete={handleDelete}
      onResetPassword={handleResetPassword}
    />
  );
}
