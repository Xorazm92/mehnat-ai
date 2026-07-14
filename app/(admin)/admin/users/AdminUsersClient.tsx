"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createUser,
  updateUser,
  deactivateUser,
  resetUserPassword,
} from "@/server/users";
import { AdminUserManager, type AdminUser } from "@/components/admin/AdminUserManager";

export default function AdminUsersClient({ users }: { users: AdminUser[] }) {
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
    <AdminUserManager
      users={users}
      busy={busy}
      onCreate={(d) =>
        guard(
          () =>
            createUser({
              email: d.email,
              fullName: d.fullName,
              password: d.password || "Password123!",
              role: d.role as never,
              phone: d.phone,
              pinfl: d.pinfl,
              department: d.department,
              gender: d.gender,
              birthDate: d.birthDate || undefined,
              education: d.education,
              hiredAt: d.hiredAt || undefined,
              status: d.status,
            }),
          "Foydalanuvchi qo'shildi"
        )
      }
      onUpdate={(id, d) =>
        guard(
          () =>
            updateUser(id, {
              fullName: d.fullName,
              phone: d.phone,
              role: d.role as never,
              pinfl: d.pinfl,
              department: d.department,
              gender: d.gender,
              birthDate: d.birthDate || undefined,
              education: d.education,
              hiredAt: d.hiredAt || undefined,
              status: d.status,
            }),
          "Saqlandi"
        )
      }
      onToggleActive={(u) =>
        guard(
          () =>
            u.isActive
              ? deactivateUser(u.id)
              : updateUser(u.id, { isActive: true }),
          u.isActive ? "Faolsizlantirildi" : "Faollashtirildi"
        )
      }
      onResetPassword={(id, pw) =>
        guard(() => resetUserPassword(id, pw), "Parol yangilandi")
      }
    />
  );
}
