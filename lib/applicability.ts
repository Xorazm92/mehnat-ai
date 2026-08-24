// =====================================================
// APPLICABILITY ENGINE — framework-free (Faza A / compliance engine)
// =====================================================
// Generator uchun gate: (1) kompaniya umuman yaroqlimi, (2) template shu
// kompaniyaga tegishlimi (TemplateApplicability qoidalari), (3) kompaniya
// Sof funksiyalar — DB-siz unit-testlanadi.
//
// Reviewer #15: faqat `isActive` yetarli emas — companyStatus + xizmat
// boshlanishi (contractDate) ham tekshiriladi. #5: applicability faqat
// taxRegime emas; #16: template.lifecycle=active bo'lishi generator gate'ida.

import { normalizeTaxRegime, taxRegimeEngineBucket } from "./taxRegimes";

export interface CompanyFacts {
  id: string;
  isActive: boolean;
  companyStatus: string | null; // default 'active'
  contractDate: Date | null;
  taxRegime: string; // enum qiymati
  statsType: string | null;
  activeServices: string[];
  hasLandTax: boolean;
  hasWaterTax: boolean;
  hasPropertyTax: boolean;
  hasExciseTax: boolean;
}

export interface ApplicabilityCriterion {
  criteriaType: string; // tax_regime|vat_payer|has_employees|stats_type|service_key|company_status
  criteriaValue: string;
}


/** Kompaniya generatsiyaga umuman yaroqlimi (template'dan qat'i nazar). */
export function isCompanyEligible(c: CompanyFacts, ref: Date): boolean {
  if (!c.isActive) return false;
  if ((c.companyStatus ?? "active") !== "active") return false;
  // Xizmat boshlanmagan bo'lsa (shartnoma sanasi yo'q yoki kelajakda) — yo'q.
  if (!c.contractDate || c.contractDate.getTime() > ref.getTime()) return false;
  return true;
}

/**
 * Template kompaniyaga tegishlimi. Bo'sh applicability → UNIVERSAL (hamma
 * yaroqli kompaniyaga). Bu xavfsiz, chunki template DRAFT→APPROVED→ACTIVE
 * lifecycle'idan o'tadi (inson tasdiqlaydi) va override(disable) istisno beradi.
 * criteriaType ichida OR, typelar aro AND.
 */
export function templateApplies(criteria: ApplicabilityCriterion[], c: CompanyFacts): boolean {
  if (criteria.length === 0) return true;
  const byType = new Map<string, string[]>();
  for (const cr of criteria) {
    const arr = byType.get(cr.criteriaType) ?? [];
    arr.push(cr.criteriaValue);
    byType.set(cr.criteriaType, arr);
  }
  for (const [type, values] of byType) {
    if (!values.some((v) => matchesCriterion(type, v, c))) return false;
  }
  return true;
}

function matchesCriterion(type: string, value: string, c: CompanyFacts): boolean {
  switch (type) {
    case "tax_regime": {
      // To'g'ridan-to'g'ri mos kelsa ham, yoki yangi sub-rejim (masalan
      // `yatt_vat`) shu majburiyat-dvigatel bucket'iga tushsa ham — mos.
      if (c.taxRegime === value) return true;
      const bucket = taxRegimeEngineBucket(normalizeTaxRegime(c.taxRegime));
      return (value === "vat" || value === "turnover") && bucket === value;
    }
    case "vat_payer": {
      const isVat = taxRegimeEngineBucket(normalizeTaxRegime(c.taxRegime)) === "vat";
      return value === "true" ? isVat : !isVat;
    }
    case "stats_type":
      return c.statsType === value;
    case "company_status":
      return (c.companyStatus ?? "active") === value;
    case "service_key":
      return c.activeServices.includes(value);
    case "has_employees":
      // Faza A: Company'da bevosita xodim soni yo'q → "payroll" xizmati orqali
      // taxminiy. TODO Faza C/D: haqiqiy xodim biriktirilishiga bog'lash.
      return c.activeServices.includes("payroll") === (value === "true");
    case "company_flag": {
      // "hasLandTax:true" kabi — Company'dagi bitta boolean ustunga to'g'ridan-to'g'ri.
      const [field, expected] = value.split(":");
      const flags: Record<string, boolean> = {
        hasLandTax: c.hasLandTax,
        hasWaterTax: c.hasWaterTax,
        hasPropertyTax: c.hasPropertyTax,
        hasExciseTax: c.hasExciseTax,
      };
      if (!(field in flags)) return false; // noma'lum maydon → xavfsiz taraf
      return String(flags[field]) === expected;
    }
    default:
      return false; // noma'lum kriteriya → mos emas (xavfsiz taraf)
  }
}

