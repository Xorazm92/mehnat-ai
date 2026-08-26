"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import StaffModule from "@/components/StaffModule";
import { createUser, updateUser, deactivateUser, resetUserPassword } from "@/server/users";
import { Staff, Company, OperationEntry } from "@/types";
import type { UserRole } from "@/lib/permissions";

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
  const [, setSelectedStaff] = useState<Staff | null>(null);

  const handleSave = async (s: Partial<Staff>) => {
    if (s.id) {
      await updateUser(s.id, {
        fullName: s.name,
        phone: s.phone,
        pinfl: s.pinfl,
        department: s.department,
        gender: s.gender,
        birthDate: s.birthDate,
        education: s.education,
        hiredAt: s.hiredAt,
        status: s.status,
        role: s.role as UserRole,
        avatarColor: s.avatarColor,
      });
    } else {
      await createUser({
        email: (s.email || "").trim(),
        fullName: s.name || "Unknown",
        password: s.password || "",
        role: s.role as UserRole,
        phone: s.phone,
        pinfl: s.pinfl,
        department: s.department,
        gender: s.gender,
        birthDate: s.birthDate,
        education: s.education,
        hiredAt: s.hiredAt,
        status: s.status,
        avatarColor: s.avatarColor,
      });
    }
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
      onStaffSelect={setSelectedStaff}
    />
  );
}
