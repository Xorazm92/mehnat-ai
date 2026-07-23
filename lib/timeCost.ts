// =====================================================
// TIME COST — framework-free (Faza C2)
// =====================================================
// Sof: berilgan sana uchun amaldagi stavkani topish va mehnat tannarxini
// hisoblash. Faza D contribution margin shu ustiga quriladi.

export interface RatePeriod {
  hourlyRate: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

/** `date` uchun amaldagi stavka (effectiveFrom <= date <= effectiveTo|ochiq); eng so'nggisi. */
export function resolveRate(rates: RatePeriod[], date: Date): number | null {
  const t = date.getTime();
  const applicable = rates.filter(
    (r) => r.effectiveFrom.getTime() <= t && (r.effectiveTo == null || r.effectiveTo.getTime() >= t),
  );
  if (applicable.length === 0) return null;
  applicable.sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
  return applicable[0].hourlyRate;
}

/** Mehnat tannarxi = (daqiqa / 60) × soatlik stavka. */
export function computeCost(minutes: number, hourlyRate: number | null): number {
  if (hourlyRate == null || minutes <= 0) return 0;
  return (minutes / 60) * hourlyRate;
}
