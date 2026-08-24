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
 *
 * IKKI MANBA BIRLASHTIRILADI:
 *   1. `session.user.roles` — `User.extraRoles` (qo'lda kiritilgan, JWT'da).
 *   2. `session.user.relations` — HAQIQIY biriktiruvlardan (Company.accountantId
 *      va h.k. + ContractAssignment) HAR 5 DAQIQADA avtomatik hisoblangan
 *      (`lib/userRelations.ts#getUserCompanyRelations`, `lib/sessionRevalidation.ts`).
 *
 * NEGA IKKALASI: `relations` allaqachon mavjud va to'g'ri edi (ekran
 * darvozasi undan foydalanadi — `VIEWS_BY_RELATION`), lekin rol
 * almashtirgich faqat `extraRoles`ni bilardi. Natija: xodim yangi firmaga
 * ikkinchi mas'uliyat sifatida biriktirilganda ekranlari 5 daqiqada
 * to'g'ri kengaysa ham, almashtirgich HR/admin `extraRoles`ni qo'lda
 * to'ldirmaguncha chizilmasdi — amalda ko'p marta unutilgan (masalan
 * bank-klient Ruslan 10 firmada buxgalter sifatida biriktirilgan edi,
 * lekin buni almashtirmasdan ko'ra olmasdi). `relations` qo'shilishi bilan
 * bu butunlay avtomatlashadi: yangi biriktiruv extraRoles yozuvisiz ham
 * 5 daqiqada almashtirgichda paydo bo'ladi.
 *
 * `CompanyRelation` qiymatlari ("accountant", "supervisor",
 * "chief_accountant", "bank_manager") `UserRole` bilan AYNAN bir xil satr —
 * to'g'ridan-to'g'ri qo'shish mumkin, alohida moslashtirish shart emas.
 */
export function rolesOf(session: Session): string[] {
  const primary = session.user.primaryRole ?? session.user.role;
  const list = [
    primary,
    ...(session.user.roles ?? []),
    ...(session.user.relations ?? []),
  ].filter((r): r is string => typeof r === "string" && KNOWN_ROLES.includes(r));
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
