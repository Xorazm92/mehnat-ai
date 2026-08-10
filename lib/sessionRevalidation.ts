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
import { SESSION_MAX_AGE } from "@/lib/auth.config";

/** Qayta tekshiruv oralig'i. Har so'rovda baza so'rovi qilmaslik uchun. */
export const SESSION_REVALIDATE_MS = 5 * 60_000;

/**
 * Kirish paytidan boshlab hisoblanadigan MUTLAQ muddat.
 *
 * NextAuth'ning `maxAge` i yolg'iz yetarli emas: JWT faollikda qayta beriladi
 * va muddat har safar cho'ziladi, ya'ni har kuni ishlaydigan xodim hech qachon
 * chiqmaydi. Bu tekshiruv `loginAt` ga tayanadi va uni faollik uzaytirmaydi.
 */
export const SESSION_ABSOLUTE_MS = SESSION_MAX_AGE * 1000;

export interface RevalidatableToken {
  id?: unknown;
  kind?: unknown;
  role?: unknown;
  avatarColor?: unknown;
  companyId?: unknown;
  checkedAt?: unknown;
  /** Kirish vaqti (ms). Faollikda YANGILANMAYDI. */
  loginAt?: unknown;
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

  // Mutlaq muddat — 5 daqiqalik keshdan OLDIN tekshiriladi, aks holda muddati
  // o'tgan sessiya keyingi qayta tekshiruvgacha yashab qolardi.
  // `loginAt` yo'q tokenlar — bu o'zgarishdan oldin berilganlari; ular
  // muddatsiz qolmasligi uchun darhol bekor qilinadi (bir marta qayta kirish).
  const loginAt = typeof token.loginAt === "number" ? token.loginAt : 0;
  if (now - loginAt > SESSION_ABSOLUTE_MS) return null;

  const checkedAt = typeof token.checkedAt === "number" ? token.checkedAt : 0;
  if (now - checkedAt <= SESSION_REVALIDATE_MS) return token;

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id },
      select: { isActive: true, role: true, avatarColor: true },
    });
    if (!dbUser || !dbUser.isActive) return null;
    token.role = dbUser.role;
    token.avatarColor = dbUser.avatarColor;
    token.checkedAt = now;
  } catch (e) {
    logServerError("auth.jwt.revalidate", e, { note: "sessiya saqlanadi" });
  }

  return token;
}
