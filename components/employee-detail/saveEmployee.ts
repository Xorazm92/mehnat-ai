import { createUser, updateUser } from "@/server/users";
import type { Staff } from "@/types";
import type { UserRole } from "@/lib/platform/permissions";

/**
 * ANKETA → SERVER MAYDONLARI — yagona xarita.
 *
 * `EmployeeForm` ekran shakli (`Staff.name`) bilan ishlaydi, server esa baza
 * shakli bilan (`fullName`). Bu tarjima ilgari faqat `StaffClient` da edi;
 * xodim kartasi sahifasi ham xuddi shu formani ochgani uchun nusxa yozish
 * o'rniga shu yerga chiqarildi — aks holda ikkalasi ajralib ketardi va bir
 * joyda saqlangan maydon ikkinchisida jimgina tushib qolardi.
 */
export async function saveEmployee(s: Partial<Staff>): Promise<void> {
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
    return;
  }

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
