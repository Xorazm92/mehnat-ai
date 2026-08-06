// =====================================================
// ACCOUNTING DOMAIN — kompaniya → SubjectFacts proyeksiyasi
// =====================================================
// Bu yer soliq lug'atini biladi; lib/engines/** bilmaydi (Konstitutsiya 4b).
// Engine `attributes` lug'atini taqqoslaydi, xolos — qaysi ustun qaysi
// `criteriaType` ga aylanishini shu fayl hal qiladi.
//
// Yangi mezon qo'shish shu yerda bir qator: engine ham, migratsiya ham
// o'zgarmaydi (Konstitutsiya 8 — template ma'lumot, kod emas).
import type { Prisma } from "@prisma/client";
import type { SubjectRow } from "@/lib/engines/obligation/obligations";

type Db = Prisma.TransactionClient;

/**
 * Generator uchun kerakli ustunlar. Engine bu nomlarni ko'rmaydi —
 * u faqat `SubjectRow` oladi.
 */
const SELECT = {
  id: true,
  isActive: true,
  companyStatus: true,
  contractDate: true,
  taxRegime: true,
  statsType: true,
  activeServices: true,
  accountantId: true,
  supervisorId: true,
  chiefAccountantId: true,
} as const;

type CompanyRow = {
  id: string;
  isActive: boolean;
  companyStatus: string | null;
  contractDate: Date | null;
  taxRegime: string;
  statsType: string | null;
  activeServices: string[];
  accountantId: string | null;
  supervisorId: string | null;
  chiefAccountantId: string | null;
};

/**
 * Kompaniya ustunlari → applicability atributlari.
 *
 * `null` atribut QO'SHILMAYDI: engine e'lon qilinmagan kalitni "mos emas" deb
 * biladi, ya'ni `statsType = null` bo'lgan firma `stats_type` mezonli
 * template'ni hech qachon olmaydi — refaktoringdan oldingi semantika aynan shu.
 */
export function companyAttributes(c: CompanyRow): Record<string, string | string[]> {
  const attrs: Record<string, string | string[]> = {
    tax_regime: c.taxRegime,
    vat_payer: String(c.taxRegime === "vat"),
    company_status: c.companyStatus ?? "active",
    service_key: c.activeServices,
    // Faza A: Company'da bevosita xodim soni yo'q → "payroll" xizmati orqali
    // taxminiy. TODO Faza C/D: haqiqiy xodim biriktirilishiga bog'lash.
    has_employees: String(c.activeServices.includes("payroll")),
  };
  if (c.statsType !== null) attrs.stats_type = c.statsType;
  return attrs;
}

/** Bitta kompaniya qatorini engine tushunadigan subyektga aylantiradi. */
export function toSubject(c: CompanyRow): SubjectRow {
  return {
    id: c.id,
    isActive: c.isActive,
    status: c.companyStatus,
    startedAt: c.contractDate,
    attributes: companyAttributes(c),
    // Mas'ul rollarning firma ichidagi ma'nosi ham domen bilimi:
    // buxgalter bajaradi, nazoratchi (yoki bosh buxgalter) zaxira bo'ladi.
    responsibleUserId: c.accountantId,
    backupUserId: c.supervisorId ?? c.chiefAccountantId,
  };
}

/** Generator uchun subyekt yuklovchi — `generateObligations` ga uzatiladi. */
export async function loadCompanySubjects(db: Db): Promise<SubjectRow[]> {
  const rows = await db.company.findMany({ where: { isActive: true }, select: SELECT });
  return rows.map(toSubject);
}
