// =====================================================
// SESSIYA REVOKATSIYASI — JWT strategiyasi uchun
// =====================================================
// JWT stateless: server tomonda bekor qilinadigan sessiya yozuvi yo'q, ya'ni
// bloklangan xodim yoki mijoz aks holda 7 kunlik token muddati tugaguncha
// ishlashda davom etardi. Shuning uchun tokenni davriy ravishda bazaga qarab
// qayta tekshiramiz.
//
// Bu mantiq lib/auth.ts dagi `jwt` callback'idan ATAYLAB ajratilgan: callback
// NextAuth() ichida yashiringan va to'g'ridan-to'g'ri chaqirib bo'lmaydi, ya'ni
// "bloklangan mijoz eski sessiya bilan kira olmaydi" degan xavfsizlik shartini
// test bilan qulflab bo'lmasdi.

import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/logger";

/** Qayta tekshiruv oralig'i. Har so'rovda baza so'rovi qilmaslik uchun. */
export const SESSION_REVALIDATE_MS = 5 * 60_000;

export interface RevalidatableToken {
  id?: unknown;
  kind?: unknown;
  role?: unknown;
  avatarColor?: unknown;
  companyId?: unknown;
  checkedAt?: unknown;
  [key: string]: unknown;
}

/**
 * Tokenni bazaga qarab yangilaydi.
 *
 * @returns yangilangan token, yoki **null** — sessiya bekor qilinishi kerak
 *          (foydalanuvchi o'chirilgan yoki `isActive = false`).
 *
 * DB nosozligida token SAQLANADI: bunda availability xavfsizlikdan ustun
 * qo'yilgan, chunki tekshiruv keyingi so'rovda baribir takrorlanadi.
 */
export async function revalidateSessionToken<T extends RevalidatableToken>(
  token: T,
  now: number = Date.now()
): Promise<T | null> {
  const id = token.id;
  if (typeof id !== "string" || !id) return token;

  const checkedAt = typeof token.checkedAt === "number" ? token.checkedAt : 0;
  if (now - checkedAt <= SESSION_REVALIDATE_MS) return token;

  try {
    if (token.kind === "client") {
      // Client identity — ClientUser jadvaliga qarab qayta tekshiramiz.
      const c = await prisma.clientUser.findUnique({
        where: { id },
        select: { isActive: true, companyId: true },
      });
      if (!c || !c.isActive) return null;
      token.companyId = c.companyId;
      token.checkedAt = now;
    } else {
      const dbUser = await prisma.user.findUnique({
        where: { id },
        select: { isActive: true, role: true, avatarColor: true },
      });
      if (!dbUser || !dbUser.isActive) return null;
      token.role = dbUser.role;
      token.avatarColor = dbUser.avatarColor;
      token.checkedAt = now;
    }
  } catch (e) {
    logServerError("auth.jwt.revalidate", e, { note: "sessiya saqlanadi" });
  }

  return token;
}
