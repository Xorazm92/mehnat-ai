// =====================================================
// OBJECT-LEVEL ACCESS — view scope vs mutation gate (Faza A)
// =====================================================
// Reviewer #11: ikki alohida operatsiya — (1) qaysi kompaniyalarni KO'RA oladi
// (companyScopeWhere → Prisma where), (2) muayyan kompaniyada AMAL bajara oladi
// (assertCompanyPermission → rol gate + obyekt-scope).
//
// ASOSIY QOIDA: ROL = nima qila olasan, BIRIKTIRUV = qaysi firmada.
// Bu ikkisi avval chalkashtirilgan edi — firma ro'yxati `isSeniorRole` orqali
// hal qilinardi va nazoratchi/bosh buxgalter BARCHA firmalarni ko'rardi.
// Endi ro'yxat faqat biriktiruvdan kelib chiqadi: odam bir firmada nazoratchi,
// boshqasida buxgalter, uchinchisida bank-klient bo'lishi mumkin (bazadagi
// haqiqiy holat), va uchalasi ham uning portfeliga kiradi.
import type { Prisma } from "@prisma/client";
import { isAdminRole, isSeniorRole, type CompanyRelation } from "@/lib/permissions";

// `CompanyRelation` endi `lib/permissions.ts` da yashaydi: sahifa darvozasi
// (`effectiveViewsForRole`) ham shu turga tayanadi, permissions esa access'dan
// import qila olmaydi (aylanma bog'liqlik). Bu yerda faqat qayta eksport.
export type { CompanyRelation };

export interface Actor {
  id: string;
  role: string;
  /**
   * Rol konteksti — KO'RINISH filtri (lib/roleContext.ts).
   *
   * Bitta odam bir firmada buxgalter, boshqasida nazoratchi bo'lishi mumkin.
   * Kontekst tanlansa ro'yxat faqat o'sha vazifadagi firmalarga TORAYADI.
   * Berilmasa — barcha biriktiruvlar (eski xatti-harakat).
   *
   * Bu HUQUQ emas: kontekst hech qachon ko'rinishni KENGAYTIRMAYDI, shuning
   * uchun uni cookie'dan olish xavfsiz.
   */
  context?: CompanyRelation | "all";
}

/** Firma qatoridan scope uchun kerak bo'ladigan minimal maydonlar. */
export interface CompanySlots {
  accountantId?: string | null;
  supervisorId?: string | null;
  chiefAccountantId?: string | null;
  bankClientId?: string | null;
  /** Bosh buxgalter firmaga to'g'ridan-to'g'ri emas, departament orqali biriktirilishi mumkin. */
  departmentRef?: { chiefAccountantId?: string | null } | null;
}

/**
 * Foydalanuvchi ko'ra oladigan kompaniyalar filtri — BIRIKTIRUV bo'yicha.
 *
 * Rolga qaramaydi (admindan tashqari): nazoratchining buxgalteriyasini yuritadigan
 * firmalari ham, bank-klientning buxgalteriya firmalari ham shu birlashmaga tushadi.
 */
/** Kontekst tanlanganda faqat SHU mas'uliyat bo'yicha filtrlanadi. */
/**
 * `ContractAssignment.role` — oddiy String, tarixan bir nechta imlo bilan
 * yozilgan (`server/companies.ts#ALIASES_FOR_ROLE` bilan bir xil ro'yxat).
 * Kontekst bo'yicha TORAYTIRISHDA aynan shu rolni bilish shart — "all"
 * bucket'idagi kabi "har qanday biriktiruv = meniki" ishlamaydi, aks holda
 * "Buxgalter" konteksti "Bank-klient" firmalarini ham qo'shib yuborardi.
 */
const ASSIGNMENT_ROLE_ALIASES: Record<CompanyRelation, string[]> = {
  accountant: ["accountant"],
  supervisor: ["supervisor", "controller"],
  chief_accountant: ["chief_accountant", "chief"],
  bank_manager: ["bank_manager", "bank_client"],
};

/**
 * Kontekst bo'yicha torayishda FAQAT `Company.*Id` ustuniga qarash yetarli
 * emas: ba'zi biriktiruvlar (Ruslan — 10 ta "accountant" yozuvi) faqat
 * `ContractAssignment`da qayd etilgan, `Company.accountantId` sloti hech
 * qachon sinxronlanmagan (3 joydan biri unutilgan — CONTEXT.md). Shuning
 * uchun bu yerda ham "all" bucket'i kabi ikkalasi OR bilan qo'shiladi —
 * faqat rolga QARAB filtrlanadi (aliaslar bilan).
 */
const RELATION_FILTER: Record<CompanyRelation, (id: string) => Prisma.CompanyWhereInput> = {
  accountant: (id) => ({
    OR: [
      { accountantId: id },
      { contractAssignments: { some: { userId: id, isActive: true, role: { in: ASSIGNMENT_ROLE_ALIASES.accountant } } } },
    ],
  }),
  supervisor: (id) => ({
    OR: [
      { supervisorId: id },
      { contractAssignments: { some: { userId: id, isActive: true, role: { in: ASSIGNMENT_ROLE_ALIASES.supervisor } } } },
    ],
  }),
  chief_accountant: (id) => ({
    OR: [
      { chiefAccountantId: id },
      { departmentRef: { chiefAccountantId: id } },
      { contractAssignments: { some: { userId: id, isActive: true, role: { in: ASSIGNMENT_ROLE_ALIASES.chief_accountant } } } },
    ],
  }),
  bank_manager: (id) => ({
    OR: [
      { bankClientId: id },
      { contractAssignments: { some: { userId: id, isActive: true, role: { in: ASSIGNMENT_ROLE_ALIASES.bank_manager } } } },
    ],
  }),
};

export function companyScopeWhere(actor: Actor): Prisma.CompanyWhereInput {
  if (isAdminRole(actor.role)) return {}; // super_admin, admin — hammasi

  // Kontekst tanlangan bo'lsa — faqat o'sha vazifadagi firmalar.
  // TORAYTIRADI, kengaytirmaydi: har qanday holatda ham asos biriktiruv.
  if (actor.context && actor.context !== "all") {
    return RELATION_FILTER[actor.context](actor.id);
  }

  return {
    OR: [
      { accountantId: actor.id },
      { supervisorId: actor.id },
      { chiefAccountantId: actor.id },
      { bankClientId: actor.id },
      // Bosh buxgalter boshqaradigan departamentdagi firmalar.
      { departmentRef: { chiefAccountantId: actor.id } },
      // JAMOA-tab biriktiruvi. ATAYLAB `role` bo'yicha filtrlanmaydi: bazada imlo
      // bir xil emas (supervisor/controller, chief_accountant/chief), va har qanday
      // turdagi aktiv biriktiruv "bu firma meniki" degani.
      { contractAssignments: { some: { userId: actor.id, isActive: true } } },
    ],
  };
}

/** Shu firmada foydalanuvchining BARCHA mas'uliyatlari (bir nechta bo'lishi mumkin). */
export function companyRelations(company: CompanySlots, userId: string): Set<CompanyRelation> {
  const rels = new Set<CompanyRelation>();
  if (company.accountantId === userId) rels.add("accountant");
  if (company.supervisorId === userId) rels.add("supervisor");
  if (
    company.chiefAccountantId === userId ||
    company.departmentRef?.chiefAccountantId === userId
  ) {
    rels.add("chief_accountant");
  }
  if (company.bankClientId === userId) rels.add("bank_manager");
  return rels;
}

/**
 * Shu firmada nazorat (tasdiqlash/rad etish) huquqi bormi?
 *
 * O'Z-O'ZINI NAZORAT BLOKI: nazoratchi o'zi buxgalteriyasini yuritadigan firmada
 * o'z ishini tasdiqlay olmaydi — u yerda oddiy buxgalter sifatida ishlaydi.
 */
export function isReviewerOn(company: CompanySlots, actor: Actor): boolean {
  if (isAdminRole(actor.role)) return true;
  const rels = companyRelations(company, actor.id);
  if (rels.has("accountant")) return false;
  return rels.has("supervisor") || rels.has("chief_accountant");
}

/** Senior-darajali (manager/reviewer) amallar — oddiy buxgalter bajara olmaydi. */
export const SENIOR_PERMISSIONS = new Set<string>([
  // KPI qoidalarini O'ZGARTIRISH = mukofot/jarima foizini o'zgartirish, ya'ni
  // pul qarori — senior rol + portfel. O'QISH esa senior emas: buxgalterga
  // o'z firmasidagi qoidalarni ko'rish kerak, chunki bu uning maoshi
  // ("company:kpi-rules:view" — faqat portfel scope'i).
  "company:kpi-rules",
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
 * Portfeldagi firmalarga biriktirilgan xodimlar id'lari (+ o'zi).
 * Admin uchun `null` — filtrsiz, ya'ni barcha xodimlar.
 */
export async function scopedStaffIds(db: Db, actor: Actor): Promise<string[] | null> {
  const scope = companyScopeWhere(actor);
  if (Object.keys(scope).length === 0) return null; // admin

  const companies = await db.company.findMany({
    where: { isActive: true, ...scope },
    select: {
      accountantId: true,
      supervisorId: true,
      chiefAccountantId: true,
      bankClientId: true,
      contractAssignments: { where: { isActive: true }, select: { userId: true } },
    },
  });

  const ids = new Set<string>([actor.id]);
  for (const c of companies) {
    for (const id of [c.accountantId, c.supervisorId, c.chiefAccountantId, c.bankClientId]) {
      if (id) ids.add(id);
    }
    for (const a of c.contractAssignments) ids.add(a.userId);
  }
  return [...ids];
}

/**
 * Xodim-kesimidagi so'rovlar uchun (`employeeId` / `userId`) filtr qiymati.
 *
 * Ilgari bu joylarda `isSeniorRole(role) ? requestedId : actor.id` yozilardi:
 * senior `requestedId` bermasa filtr UMUMAN qo'yilmasdi va butun tizimning
 * oyligi/KPI'si/davomati qaytardi; bergan taqdirda esa istalgan begona xodimni
 * so'ray olardi. Endi:
 *   - oddiy xodim  → faqat o'zi
 *   - senior       → portfelidagi xodimlar (begona id → xato)
 *   - admin        → cheklovsiz (`undefined`)
 */
export async function staffScopeFilter(
  db: Db,
  actor: Actor,
  requestedId?: string,
): Promise<string | { in: string[] } | undefined> {
  if (!isSeniorRole(actor.role)) return actor.id;
  if (isAdminRole(actor.role)) return requestedId || undefined;

  const allowed = await scopedStaffIds(db, actor);
  if (allowed === null) return requestedId || undefined;

  if (requestedId) {
    if (!allowed.includes(requestedId)) {
      throw new Error("Bu xodim ma'lumotiga ruxsatingiz yo'q");
    }
    return requestedId;
  }
  return { in: allowed };
}

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
  if (isAdminRole(actor.role)) return;

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
