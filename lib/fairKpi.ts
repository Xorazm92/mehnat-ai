// =====================================================
// FIRMA MURAKKABLIGI OG'IRLIGI
// =====================================================
// Yagona qoldiq — "Adolatli KPI v2" (Faza E, shadow mode) moduli
// 2026-08 konsolidatsiyasida o'chirildi (20260810120000_drop_fair_kpi):
// hech qachon yoqilmagan, 0 qator. `complexityWeight` alohida omon qoldi,
// chunki uni `lib/domains/accounting/twinCompute.ts` (firma-xodim "egizak"
// hisobi) ishlatadi — u KPI moduliga aloqasiz, faqat shu og'irlik jadvalini
// meros oldi.
import type { CompanyComplexity } from "@prisma/client";

const COMPLEXITY_WEIGHT: Record<string, number> = { simple: 1, standard: 1.5, complex: 2.5, enterprise: 4 };

/** Firma murakkabligi bo'yicha og'irlik koeffitsiyenti. Noma'lum/bo'sh — "standard". */
export function complexityWeight(c: CompanyComplexity | string | null | undefined): number {
  return COMPLEXITY_WEIGHT[(c as string) ?? "standard"] ?? 1.5;
}
