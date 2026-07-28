"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import AttendanceModule, { AttendanceRecord } from "@/components/AttendanceModule";
import ShiftCoverPanel from "@/components/ShiftCoverPanel";
import { Staff } from "@/types";
import { upsertAttendance, deleteAttendance } from "@/server/attendance";
import { syncEjurnalAttendance } from "@/server/ejurnal";

interface Props {
  records: AttendanceRecord[];
  staff: Staff[];
  canEdit: boolean;
}

export default function AttendanceClient({ records, staff, canEdit }: Props) {
  const router = useRouter();
  useAutoRefresh();

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

  const handleSyncEjurnal = async (date: string) => {
    const res = await syncEjurnalAttendance(date);
    router.refresh();
    return res;
  };

  return (
    <div className="space-y-6">
      <AttendanceModule
        records={records}
        staff={staff}
        lang="uz"
        canEdit={canEdit}
        onSave={handleSave}
        onDelete={handleDelete}
        onSyncEjurnal={canEdit ? handleSyncEjurnal : undefined}
      />
      {/* Yo'qlik va o'rinbosarlik bir domen — nazoratchi allaqachon shu ekranda
          kim kelmaganini ko'rib turadi, pulni ham shu yerdan o'tkazadi. */}
      <div className="px-4 pb-6">
        <ShiftCoverPanel staff={staff} canEdit={canEdit} />
      </div>
    </div>
  );
}
