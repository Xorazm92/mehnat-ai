// =====================================================
// ROL DARVOZALARI — server action'lar uchun
// =====================================================
//
// Bu fayl ATAYIN "use server" EMAS: u server action emas, ichki yordamchi.
// "use server" qo'yilsa Next.js har bir eksportni mijozdan chaqiriladigan
// action deb hisoblardi — darvoza esa tashqariga ochilmasligi kerak.
//
// NIMA UCHUN KERAK. Bir xil olti qator (`auth()` → rolni ol → `Forbidden`)
// server modullarida qayta-qayta yozilgan edi: `requireAdmin` to'rt faylda,
// `requireSenior` uch faylda, `requireKassa` ikki faylda. Har biri mustaqil
// nusxa, ya'ni rol ro'yxati o'zgarsa kimdir albatta unutilardi.
//
// Rol PREDIKATLARI `lib/permissions.ts` da qoladi — bu yerda faqat
// "sessiyani ol, predikatni qo'lla, xato tashla" qismi.

import { auth } from "@/lib/auth";
import { isAdminRole, isFinanceRole, isSeniorRole } from "@/lib/platform/permissions";

export interface Actor {
  userId: string;
  role: string;
}

/**
 * Sessiyani oladi va rol predikatini qo'llaydi.
 *
 * Ikki xato bir-biridan FARQ QILADI va shunday qolishi kerak:
 *   "Unauthorized" — kirmagan (login'ga yuboriladi);
 *   "Forbidden"    — kirgan, lekin huquqi yo'q (403 sahifasi).
 * Ularni birlashtirish foydalanuvchini login'ga qaytarib, cheksiz aylanaga
 * tushirardi.
 */
export async function requireRole(allowed: (role: string) => boolean): Promise<Actor> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const role = session.user.role as string;
  if (!allowed(role)) throw new Error("Forbidden");
  return { userId: session.user.id as string, role };
}

/** Kundalik kassa qaydi: superadmin, admin, bosh buxgalter, bank-klient. */
export const requireKassa = (): Promise<Actor> => requireRole(isFinanceRole);

/** Qaytarib bo'lmaydigan amal (kanalni muzlatish, yozuvni o'chirish). */
export const requireAdmin = (): Promise<Actor> => requireRole(isAdminRole);

/** Portfelga mas'ul rollar: admin, bosh buxgalter, nazoratchi. */
export const requireSenior = (): Promise<Actor> => requireRole(isSeniorRole);

/** Bank vipiskasi bilan ishlash — bank-klient ham kiradi. */
const STATEMENT_ROLES = ["super_admin", "admin", "bank_manager"];
export const requireStatementRole = (): Promise<Actor> =>
  requireRole((r) => STATEMENT_ROLES.includes(r));
