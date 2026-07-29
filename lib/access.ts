// =====================================================
// OBJECT-LEVEL ACCESS — view scope vs mutation gate (Faza A)
// =====================================================
// Reviewer #11: ikki alohida operatsiya — (1) qaysi kompaniyalarni KO'RA oladi
// (companyScopeWhere → Prisma where), (2) muayyan kompaniyada AMAL bajara oladi
// (assertCompanyPermission → rol gate + obyekt-scope). server/obligations.ts va
// kelajakda companies/operations shu yagona qatlamdan foydalanadi.
//
// Eslatma: mavjud getCompanies supervisor/chief'ni "hammani ko'radi" deb
// hisoblaydi; bu yerda ular PORTFELIga cheklanadi (to'g'riroq). getCompanies
// migratsiyasi alohida refactor (regressiya xavfi) — hozir tegilmaydi.
import type { Prisma } from "@prisma/client";
import { isSeniorRole } from "@/lib/permissions";

export interface Actor {
  id: string;
  role: string;
}

/** Foydalanuvchi ko'ra oladigan kompaniyalar filtri (rol bo'yicha). */
export function companyScopeWhere(actor: Actor): Prisma.CompanyWhereInput {
  switch (actor.role) {
    case "super_admin":
    case "admin":
      return {}; // hammasi
    case "supervisor":
      return { supervisorId: actor.id };
    case "chief_accountant":
      return {
        OR: [{ chiefAccountantId: actor.id }, { departmentRef: { chiefAccountantId: actor.id } }],
      };
    case "bank_manager":
      return {
        OR: [
          { bankClientId: actor.id },
          { contractAssignments: { some: { userId: actor.id, isActive: true, role: "bank_manager" } } },
        ],
      };
    default: // accountant
      return {
        OR: [
          { accountantId: actor.id },
          { contractAssignments: { some: { userId: actor.id, isActive: true, role: "accountant" } } },
        ],
      };
  }
}

/** Senior-darajali (manager/reviewer) amallar — oddiy buxgalter bajara olmaydi. */
export const SENIOR_PERMISSIONS = new Set<string>([
  "obligation:accept",
  "obligation:reject",
  "obligation:cancel",
  "obligation:assign",
  "delay-reason:approve",
  "invoice:manage",
  // Eskalatsiya hukmi: jarima / ogohlantirish / sababli. KPI ledgeriga yozadi,
  // oylikka emas — pul faqat chief ERP'da tasdiqlagach ushlanadi (ADR-0001).
  "kpi:penalize",
]);

type Db = Prisma.TransactionClient;

/**
 * Muayyan kompaniyada `permission` amalini bajarishga ruxsatni tasdiqlaydi.
 * (1) admin → to'liq; (2) senior-only amal bo'lsa rol tekshiriladi;
 * (3) OBYEKT-scope: kompaniya foydalanuvchi ko'rish doirasida bo'lishi shart
 * (IDOR himoyasi — payload'dagi companyId almashtirilsa ham o'tmaydi).
 */
export async function assertCompanyPermission(
  db: Db,
  actor: Actor,
  companyId: string,
  permission: string,
): Promise<void> {
  if (actor.role === "super_admin" || actor.role === "admin") return;

  if (SENIOR_PERMISSIONS.has(permission) && !isSeniorRole(actor.role)) {
    throw new Error("Ruxsat yo'q: bu amal uchun senior rol talab qilinadi");
  }

  const inScope = await db.company.findFirst({
    where: { id: companyId, ...companyScopeWhere(actor) },
    select: { id: true },
  });
  if (!inScope) {
    throw new Error("Bu kompaniyaga ruxsatingiz yo'q");
  }
}
