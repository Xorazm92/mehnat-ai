"use client";

import React from "react";
import { useRouter } from "next/navigation";
import AttendanceModule, { AttendanceRecord } from "@/components/AttendanceModule";
import { Staff } from "@/types";
import { upsertAttendance, deleteAttendance } from "@/server/attendance";

interface Props {
  records: AttendanceRecord[];
  staff: Staff[];
  canEdit: boolean;
}

export default function AttendanceClient({ records, staff, canEdit }: Props) {
  const router = useRouter();

  const handleSave = async (data: {
    userId: string;
    date: string;
    status: string;
    checkIn?: string;
    checkOut?: string;
    notes?: string;
  }) => {
    await upsertAttendance(data);
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    await deleteAttendance(id);
    router.refresh();
  };

  return (
    <AttendanceModule
      records={records}
      staff={staff}
      lang="uz"
      canEdit={canEdit}
      onSave={handleSave}
      onDelete={handleDelete}
    />
  );
}
