"use client";

import React, { useState } from "react";
import StaffModule from "@/components/StaffModule";
import { createUser, updateUser, deactivateUser } from "@/server/users";
import { Staff, Company, OperationEntry } from "@/types";

interface Props {
  staff: Staff[];
  companies: Company[];
  operations: OperationEntry[];
}

export default function StaffClient({ staff, companies, operations }: Props) {
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);

  const handleSave = async (s: Partial<Staff>) => {
    if (s.id) {
      await updateUser(s.id, {
        fullName: s.name,
        phone: s.phone,
        role: s.role as any,
        avatarColor: s.avatarColor,
      });
    } else {
      await createUser({
        email: s.email || `${s.name?.replace(/\s+/g, "").toLowerCase()}@mehnat.uz`,
        fullName: s.name || "Unknown",
        password: s.password || "Password123!",
        role: s.role as any,
        phone: s.phone,
        avatarColor: s.avatarColor,
      });
    }
  };

  const handleDelete = async (id: string) => {
    await deactivateUser(id);
  };

  return (
    <StaffModule
      staff={staff}
      companies={companies}
      operations={operations}
      lang="uz"
      onSave={handleSave as any}
      onDelete={handleDelete}
      onStaffSelect={setSelectedStaff}
    />
  );
}
