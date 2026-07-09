"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createDepartment,
  updateDepartment,
  deactivateDepartment,
} from "@/server/departments";
import {
  AdminDepartments,
  type DeptRow,
  type ChiefOption,
} from "@/components/admin/AdminDepartments";

export default function AdminDepartmentsClient({
  departments,
  chiefs,
}: {
  departments: DeptRow[];
  chiefs: ChiefOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const guard = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      router.refresh();
    } catch (e) {
      toast.error((e as Error)?.message || "Xatolik yuz berdi");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminDepartments
      departments={departments}
      chiefs={chiefs}
      busy={busy}
      onCreate={(d) => guard(() => createDepartment(d), "Bo'lim qo'shildi")}
      onUpdate={(id, d) => guard(() => updateDepartment(id, d), "Saqlandi")}
      onDeactivate={(id) => guard(() => deactivateDepartment(id), "Faolsizlantirildi")}
    />
  );
}
