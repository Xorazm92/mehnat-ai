"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  isAdminRole,
  ALL_VIEWS,
  ROLES,
  effectiveViewsForRole,
  type CompanyRelation,
  type RoleViewOverrides,
  type UserRole,
  type AppView,
} from "@/lib/platform/permissions";
import { updateTag } from "next/cache";
import { serialize } from "@/lib/serialize";

const SETTING_KEY = "roleViews";
const ROLE_LIST = Object.values(ROLES) as UserRole[];
const VIEW_SET = new Set<string>(ALL_VIEWS);

async function readOverrides(): Promise<RoleViewOverrides | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEY } });
  if (!row || !row.value || typeof row.value !== "object") return null;
  return row.value as RoleViewOverrides;
}

/** Rol→view override'lari. Har qanday autentifikatsiyalangan foydalanuvchi o'qiy oladi (nav uchun). */
export async function getRoleViewOverrides(): Promise<RoleViewOverrides> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  return serialize((await readOverrides()) ?? {});
}

/**
 * JORIY foydalanuvchi uchun amaldagi view'lar: kod default'i + admin
 * override'i + uning haqiqiy biriktiruvlari (sessiyadan).
 *
 * `role` argumenti chaqiruvchining qulayligi uchun qoladi, lekin biriktiruvlar
 * har doim SESSIYADAN olinadi — boshqa rol uchun "faraz" hisoblab bo'lmaydi.
 */
export async function getEffectiveViewsForRole(role: string): Promise<AppView[]> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const overrides = await readOverrides();
  const relations = (session.user?.relations ?? []) as CompanyRelation[];
  return effectiveViewsForRole(role as UserRole, overrides, relations);
}

/**
 * JORIY foydalanuvchining amaldagi ekranlari — sahifa darvozasi uchun.
 *
 * DIQQAT: sahifa ichidagi tekshiruv `proxy.ts` bilan AYNAN bir xil uchta
 * manbadan hisoblanishi SHART: rol + admin override'i + biriktiruvlar. Aks
 * holda proxy kiritadi, sahifa esa qaytarib yuboradi — va yon panel o'sha
 * havolani prefetch qilgani uchun bu cheksiz sikl bo'lib qoladi (prod'da
 * aynan shunday bo'ldi: `/kassa/kirim` prefetch → `/cabinet` ga redirect →
 * yon panel qayta prefetch → sekundiga o'nlab so'rov).
 *
 * Shuning uchun sahifalar `canSeeViewWith(role, view, overrides)` ni QO'LDA
 * chaqirmasin — shu funksiyani ishlatsin.
 */
export async function currentUserViews(): Promise<AppView[]> {
  const session = await auth();
  if (!session) return [];
  const overrides = await readOverrides();
  return effectiveViewsForRole(
    session.user.role as UserRole,
    overrides,
    (session.user.relations ?? []) as CompanyRelation[]
  );
}

export interface RoleViewMatrix {
  roles: UserRole[];
  views: AppView[];
  // enabled[role][view] = shu rol shu view'ni ko'radimi
  enabled: Record<string, Record<string, boolean>>;
}

/** Admin editor uchun to'liq rol×view matritsasi (amaldagi holat bilan). */
export async function getRoleViewMatrix(): Promise<RoleViewMatrix> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isAdminRole(session.user.role as string)) throw new Error("Forbidden");

  const overrides = await readOverrides();
  const enabled: Record<string, Record<string, boolean>> = {};
  for (const role of ROLE_LIST) {
    const views = new Set(effectiveViewsForRole(role, overrides));
    enabled[role] = {};
    for (const v of ALL_VIEWS) enabled[role][v] = views.has(v);
  }
  return serialize({ roles: ROLE_LIST, views: ALL_VIEWS, enabled });
}

/**
 * Rol→view override'larini saqlaydi. Faqat admin.
 * Superadmin cheklab bo'lmaydi (u har doim hammasini ko'radi).
 */
export async function saveRoleViews(enabled: Record<string, Record<string, boolean>>) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isAdminRole(session.user.role as string)) throw new Error("Forbidden");

  const overrides: RoleViewOverrides = {};
  for (const role of ROLE_LIST) {
    if (role === "super_admin") continue; // superadmin override'siz — doim to'liq
    const perRole = enabled[role];
    if (!perRole) continue;
    const views = ALL_VIEWS.filter((v) => VIEW_SET.has(v) && perRole[v]);
    overrides[role] = views;
  }

  const result = await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY },
    update: { value: overrides as object, updatedBy: session.user.id },
    create: { key: SETTING_KEY, value: overrides as object, updatedBy: session.user.id },
  });
  updateTag("system-settings");
  return serialize(result);
}
