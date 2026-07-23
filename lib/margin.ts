// =====================================================
// CONTRIBUTION MARGIN — framework-free (Faza D)
// =====================================================
// Mijoz contribution margin = tushum − to'g'ridan-to'g'ri mehnat − qo'shimcha −
// jarima. Kirishlar server/profitability.ts'da yig'iladi (Payment tushum,
// getCompanyTimeCost mehnat). extraCost/penalties hozircha 0 (Faza D kelgusi).

export interface MarginInput {
  revenue: number;
  laborCost: number;
  extraCost?: number;
  penalties?: number;
}

export interface MarginResult {
  revenue: number;
  laborCost: number;
  extraCost: number;
  penalties: number;
  margin: number;
  /** Foizda; tushum 0 bo'lsa null. */
  marginPct: number | null;
}

export function computeMargin(i: MarginInput): MarginResult {
  const extraCost = i.extraCost ?? 0;
  const penalties = i.penalties ?? 0;
  const margin = i.revenue - i.laborCost - extraCost - penalties;
  const marginPct = i.revenue > 0 ? (margin / i.revenue) * 100 : null;
  return { revenue: i.revenue, laborCost: i.laborCost, extraCost, penalties, margin, marginPct };
}
