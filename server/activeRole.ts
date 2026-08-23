"use server";

// IKKI ROLLILAR UCHUN FAOL ROL ALMASHTIRISH.
//
// Tanlov cookie'da saqlanadi (`asro.active-role`) va HAR SO'ROVDA server
// tomonda tekshiriladi (lib/auth.ts wrapped auth + proxy.ts): foydalanuvchi
// faqat O'ZIga tegishli rollar ichida yura oladi. Huquq kengaymaydi — faqat
// shu odam allaqachon egasi bo'lgan rollar orasida o'tish.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { ACTIVE_ROLE_COOKIE, rolesOf } from "@/lib/effective-role";

export interface MyRoles {
  /** Asosiy + qo'shimchalar — almashtirgich ro'yxati. */
  roles: string[];
  /** Hozir ishlatilayotgan rol. */
  active: string;
}

export async function getMyRoles(): Promise<MyRoles | null> {
  const session = await auth();
  if (!session || session.user.kind === "client") return null;
  return { roles: rolesOf(session), active: session.user.role };
}

/** Rolni almashtirish. `null` — asosiy roliga qaytish. */
export async function setActiveRole(role: string | null): Promise<void> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const store = await cookies();
  if (!role) {
    store.delete(ACTIVE_ROLE_COOKIE);
    revalidatePath("/", "layout");
    return;
  }

  const allowed = rolesOf(session);
  if (!allowed.includes(role)) throw new Error("Forbidden: bu rol sizda yo'q");

  store.set(ACTIVE_ROLE_COOKIE, role, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.USE_SECURE_COOKIES === "true",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  // Butun layout yangilanadi: menyu, darvoza va ma'lumotlar yangi rol bilan.
  revalidatePath("/", "layout");
}
