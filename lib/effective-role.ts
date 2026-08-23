// =====================================================
// FAOL ROL — ikki rolli xodimlar uchun yagona yechim
// =====================================================
//
// Bitta xodim bir necha TIZIM roliga ega bo'lishi mumkin (masalan
// bank-klient + buxgalter, yoki buxgalter + nazoratchi). Rollar bazada
// `User.extraRoles` da turadi; faqat shu fayl biladi:
//
//   · qaysi cookie faol rolni saqlaydi,
//   · tanlangan rol rostdan shu odamnikimi (tekshiruv SERVER tomonda —
//     cookie'ni qo'lda o'zgartirish hech narsa bermaydi),
//   · sessiyaga qanday qo'llanadi.
//
// Qo'llanish nuqtasi BITTA: `lib/auth.ts` dagi wrapped `auth()`. U
// `session.user.role` ni faol rol bilan almashtiradi, ya'ni kod bo'ylab
// yuzlab `session.user.role` tekshiruvi o'zgarishsiz to'g'ri ishlaydi.

import type { Session } from "next-auth";

export const ACTIVE_ROLE_COOKIE = "asro.active-role";

/** Sessiyada bo'lishi mumkin bo'lgan barcha tizim rollari. */
const KNOWN_ROLES = [
  "super_admin",
  "admin",
  "chief_accountant",
  "bank_manager",
  "supervisor",
  "accountant",
];

/**
 * Foydalanuvchiga tegishli rollar — asosiy + qo'shimchalar, dublikatsiz.
 * Noma'lum qiymatlar (eski ma'lumot, xato kiritish) olib tashlanadi.
 */
export function rolesOf(session: Session): string[] {
  const primary = session.user.primaryRole ?? session.user.role;
  const list = [primary, ...(session.user.roles ?? [])].filter(
    (r): r is string => typeof r === "string" && KNOWN_ROLES.includes(r)
  );
  return [...new Set(list)];
}

/**
 * Cookie'dagi tanlovni tekshirib, FAOL rol qaytaradi. Yaroqsiz bo'lsa —
 * asosiy rol (hech qachon kengaytirmaydi, faqat shu odamning rollari ichida).
 */
export function effectiveRole(session: Session, cookieValue: string | undefined): string {
  const roles = rolesOf(session);
  if (cookieValue && roles.includes(cookieValue)) return cookieValue;
  return roles[0] ?? session.user.role;
}
