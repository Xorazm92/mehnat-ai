/**
 * Read-model projection of the KPI ledger. Pure so it is unit-testable and can
 * run wherever (dashboard query, report). Summing signed points reproduces the
 * net — the ledger's "recompute any time" property — without ever mutating the
 * live payroll `MonthlyPerformance`.
 */

export interface LedgerEvent {
  type: string;
  points: number;
}

export interface LedgerRollup {
  net: number;
  count: number;
  byType: Record<string, number>;
}

function round4(n: number): number {
  const v = Math.round((n + Number.EPSILON) * 10000) / 10000;
  return v === 0 ? 0 : v;
}

export function rollupLedger(events: LedgerEvent[]): LedgerRollup {
  const byType: Record<string, number> = {};
  let net = 0;
  for (const e of events) {
    net += e.points;
    byType[e.type] = round4((byType[e.type] ?? 0) + e.points);
  }
  return { net: round4(net), count: events.length, byType };
}
