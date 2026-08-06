// =====================================================
// APPLICABILITY ENGINE — framework-free (Faza A / compliance engine)
// =====================================================
// Generator uchun gate: (1) subyekt umuman yaroqlimi, (2) template shu
// subyektga tegishlimi (TemplateApplicability qoidalari), (3) subyekt
// override bilan o'chirilganmi. Sof funksiyalar — DB-siz unit-testlanadi.
//
// DOMEN-NEYTRAL (Konstitutsiya 4b). Bu fayl hech qanday soha atamasini
// bilmaydi — u faqat `attributes` lug'atini taqqoslaydi. Subyekt ustunlarini
// shu lug'atga proyeksiya qilish domen qatlamining ishi:
// lib/domains/accounting/subjects.ts.
//
// Reviewer #15: faqat `isActive` yetarli emas — status + xizmat boshlanishi
// ham tekshiriladi. #5: applicability bitta mezonga bog'lanmaydi;
// #16: template.lifecycle=active bo'lishi generator gate'ida.

/** Majburiyat yuklanadigan subyekt (bugun — mijoz kompaniyasi). */
export interface SubjectFacts {
  id: string;
  isActive: boolean;
  /** Hayot sikli holati; null → "active" deb qaraladi. */
  status: string | null;
  /** Xizmat boshlangan sana; yo'q yoki kelajakda → yaroqsiz. */
  startedAt: Date | null;
  /**
   * Applicability mezonlari taqqoslanadigan lug'at. Kalit — `criteriaType`,
   * qiymat — satr yoki satrlar ro'yxati (ro'yxatda `includes` bo'yicha).
   * Tip qasddan tor: `criteriaValue` sxemada `String`, shuning uchun
   * taqqoslash har doim satr bilan. Kengaytirish orqaga mos, torayish yo'q.
   */
  attributes: Record<string, string | string[]>;
}

export interface ApplicabilityCriterion {
  criteriaType: string;
  criteriaValue: string;
}

export interface OverrideFacts {
  action: string; // disable | custom_due | reassign
  customDueDay: number | null;
  customOffsetDays: number | null;
  responsibleUserId: string | null;
}

/** Subyekt generatsiyaga umuman yaroqlimi (template'dan qat'i nazar). */
export function isSubjectEligible(s: SubjectFacts, ref: Date): boolean {
  if (!s.isActive) return false;
  if ((s.status ?? "active") !== "active") return false;
  // Xizmat boshlanmagan bo'lsa (sana yo'q yoki kelajakda) — yo'q.
  if (!s.startedAt || s.startedAt.getTime() > ref.getTime()) return false;
  return true;
}

/**
 * Template subyektga tegishlimi. Bo'sh applicability → UNIVERSAL (hamma
 * yaroqli subyektga). Bu xavfsiz, chunki template DRAFT→APPROVED→ACTIVE
 * lifecycle'idan o'tadi (inson tasdiqlaydi) va override(disable) istisno beradi.
 * criteriaType ichida OR, typelar aro AND.
 */
export function templateApplies(criteria: ApplicabilityCriterion[], s: SubjectFacts): boolean {
  if (criteria.length === 0) return true;
  const byType = new Map<string, string[]>();
  for (const cr of criteria) {
    const arr = byType.get(cr.criteriaType) ?? [];
    arr.push(cr.criteriaValue);
    byType.set(cr.criteriaType, arr);
  }
  for (const [type, values] of byType) {
    if (!values.some((v) => matchesCriterion(type, v, s))) return false;
  }
  return true;
}

function matchesCriterion(type: string, value: string, s: SubjectFacts): boolean {
  const attr = s.attributes[type];
  // Noma'lum mezon yoki e'lon qilinmagan atribut → mos emas (xavfsiz taraf).
  // Oq ro'yxat shu yerda: subyekt e'lon qilmagan narsa hech qachon mos kelmaydi.
  if (attr === undefined) return false;
  return Array.isArray(attr) ? attr.includes(value) : attr === value;
}

/** Override majburiyatni butunlay o'chiradimi. */
export function isDisabledByOverride(o: OverrideFacts | undefined | null): boolean {
  return o?.action === "disable";
}
