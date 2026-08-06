// =====================================================
// FAIR KPI v2 — framework-free (Faza E / shadow mode)
// =====================================================
// Weighted composite (SLA 35 / Quality 25 / Client 15 / Volume 15 / Discipline
// 10). Volume complexity bilan normallashadi; SLA delay-reason exclusion bilan
// (Faza A tasdiqlangan, buxgalter aybi bo'lmagan kechikish hisobga olinmaydi).
// Barcha komponent 0-100. Sof funksiyalar — to'liq unit-testlanadi.
import type { CompanyComplexity } from "@prisma/client";

export const KPI_WEIGHTS = { sla: 0.35, quality: 0.25, client: 0.15, volume: 0.15, discipline: 0.1 } as const;
/** Shu complexity-og'irlikdagi hajm → 100% volume. Sozlanadi (shadow'da kuzatiladi). */
export const VOLUME_TARGET_POINTS = 20;

const COMPLEXITY_WEIGHT: Record<string, number> = { simple: 1, standard: 1.5, complex: 2.5, enterprise: 4 };
export function complexityWeight(c: CompanyComplexity | string | null | undefined): number {
  return COMPLEXITY_WEIGHT[(c as string) ?? "standard"] ?? 1.5;
}

const clamp100 = (n: number) => Math.max(0, Math.min(100, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Muddatga rioya — eligible 0 bo'lsa neytral 100 (jazolamaslik). */
export function slaScore(onTime: number, eligible: number): number {
  return round2(eligible > 0 ? clamp100((onTime / eligible) * 100) : 100);
}
/** Sifat — nuqson/jami. Jami 0 bo'lsa neytral 100. */
export function qualityScore(defects: number, total: number): number {
  return round2(total > 0 ? clamp100((1 - defects / total) * 100) : 100);
}
/** Hajm — complexity-og'irlikdagi ballni targetga nisbatan. */
export function volumeScore(weightedPoints: number, target = VOLUME_TARGET_POINTS): number {
  return round2(target > 0 ? clamp100((weightedPoints / target) * 100) : 0);
}
/** Intizom — davomat (present=1, late=0.5, absent=0; excused hisobga kirmaydi). */
export function disciplineScore(a: { present: number; late: number; absent: number }): number {
  const denom = a.present + a.late + a.absent;
  return round2(denom > 0 ? clamp100(((a.present + 0.5 * a.late) / denom) * 100) : 100);
}

export interface KpiComponents {
  sla: number;
  quality: number;
  client: number;
  volume: number;
  discipline: number;
}

/** Weighted composite (0-100). */
export function computeComposite(c: KpiComponents, w: typeof KPI_WEIGHTS = KPI_WEIGHTS): number {
  return round2(clamp100(c.sla * w.sla + c.quality * w.quality + c.client * w.client + c.volume * w.volume + c.discipline * w.discipline));
}
