"use server";

// Rol konteksti — o'qish va almashtirish.
//
// Kontekst COOKIE'da saqlanadi (sessiyada emas): u ko'rinish sozlamasi,
// huquq emas, va uni o'zgartirish uchun qayta login qilish kerak emas.
// Xavfsizlik jihatidan bu to'g'ri, chunki `companyScopeWhere` kontekstni
// faqat TORAYTIRISH uchun ishlatadi — u hech qachon biriktirilmagan
// firmani ochib bermaydi.

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import {
  ROLE_CONTEXT_COOKIE,
  parseRoleContext,
  resolveContexts,
  type RoleContext,
  type ContextOption,
} from "@/lib/roleContext";
import { revalidatePath } from "next/cache";

/** Joriy kontekst — sahifalar `Actor` ga shu qiymatni qo'shadi. */
export async function getRoleContext(): Promise<RoleContext> {
  const store = await cookies();
  return parseRoleContext(store.get(ROLE_CONTEXT_COOKIE)?.value);
}

/** Foydalanuvchida mavjud kontekstlar. Bittadan kam bo'lsa bo'sh massiv. */
export async function getMyContexts(): Promise<ContextOption[]> {
  const session = await auth();
  if (!session || session.user.kind === "client") return [];
  return resolveContexts(
    prisma,
    session.user.id,
    isAdminRole(session.user.role as string)
  );
}

export async function setRoleContext(context: RoleContext): Promise<void> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const store = await cookies();
  store.set(ROLE_CONTEXT_COOKIE, parseRoleContext(context), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.USE_SECURE_COOKIES === "true",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  // Firma ro'yxati keshlangan — kontekst o'zgarsa u ham yangilanishi kerak.
  revalidatePath("/", "layout");
}
