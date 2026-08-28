// SVERKANI YIG'ISH — sof hisob, bazasiz.
//
// Ikki tomon KUN bo'yicha jamlanadi va solishtiriladi:
//   kassa tomoni — fiskal apparatning "тўлов терминали" ustuni;
//   bank tomoni  — ekvayring tushumining YALPI summasi (komissiyagacha).
//
// NEGA yalpi bilan. Bankka komissiya ushlanib tushadi, kassa apparati esa
// mijoz to'lagan to'liq summani ko'radi. Ularni to'g'ridan-to'g'ri
// solishtirish har kuni komissiya hajmida "kamomad" ko'rsatardi.

export interface DeviceDay {
  deviceId: string;
  date: string; // YYYY-MM-DD
  cardAmount: number;
  cashAmount: number;
}

export interface SettlementDay {
  terminalId: string;
  date: string; // YYYY-MM-DD — savdo sanasi
  factAmount: number;
  grossAmount: number;
  commissionAmount: number;
  /** Tafsilotda sana yo'q edi — hujjat sanasidan olingan. */
  fromDocumentDate: boolean;
}

export interface SverkaDay {
  date: string;
  byDevice: Record<string, number>;
  kassaCard: number;
  kassaCash: number;
  byTerminal: Record<string, { fact: number; gross: number; commission: number }>;
  bankFact: number;
  bankGross: number;
  commission: number;
  /** Kassa − bank yalpi. Musbat = bankka yetib bormagan. */
  diff: number;
  /** Kassa − bank fakt. Buxgalter "qancha pul kelmadi" deb shuni so'raydi. */
  diffFact: number;
  /** Shu kunda sanasi hujjatdan olingan tushum bor — kunlik farq shartli. */
  approximateDate: boolean;
}

export interface SverkaTotals {
  kassaCard: number;
  kassaCash: number;
  bankFact: number;
  bankGross: number;
  commission: number;
  diff: number;
  diffFact: number;
  /** Sanasi tafsilotdan emas, hujjatdan olingan tushum ulushi. */
  approximateAmount: number;
}

export interface SverkaResult {
  days: SverkaDay[];
  totals: SverkaTotals;
  months: { month: string; totals: SverkaTotals }[];
}

const zero = (): SverkaTotals => ({
  kassaCard: 0, kassaCash: 0, bankFact: 0, bankGross: 0,
  commission: 0, diff: 0, diffFact: 0, approximateAmount: 0,
});

function addDay(t: SverkaTotals, d: SverkaDay, approx: number): void {
  t.kassaCard += d.kassaCard;
  t.kassaCash += d.kassaCash;
  t.bankFact += d.bankFact;
  t.bankGross += d.bankGross;
  t.commission += d.commission;
  t.diff += d.diff;
  t.diffFact += d.diffFact;
  t.approximateAmount += approx;
}

/**
 * Kunlik sverkani yig'adi.
 *
 * `from`/`to` berilsa, natija AYNAN shu oraliqdagi kunlardan iborat bo'ladi —
 * bank tomonida davrdan tashqarida qolgan hisob-kitoblar (masalan oldingi oy
 * savdosi) yig'indini shishirmasligi uchun.
 */
export function reconcile(
  deviceDays: DeviceDay[],
  settlements: SettlementDay[],
  range?: { from: string; to: string },
): SverkaResult {
  const inRange = (d: string) => !range || (d >= range.from && d <= range.to);
  const map = new Map<string, SverkaDay>();

  const ensure = (date: string): SverkaDay => {
    let d = map.get(date);
    if (!d) {
      d = {
        date, byDevice: {}, kassaCard: 0, kassaCash: 0, byTerminal: {},
        bankFact: 0, bankGross: 0, commission: 0, diff: 0, diffFact: 0, approximateDate: false,
      };
      map.set(date, d);
    }
    return d;
  };

  for (const r of deviceDays) {
    if (!inRange(r.date)) continue;
    const d = ensure(r.date);
    d.byDevice[r.deviceId] = (d.byDevice[r.deviceId] ?? 0) + r.cardAmount;
    d.kassaCard += r.cardAmount;
    d.kassaCash += r.cashAmount;
  }

  const approxByDay = new Map<string, number>();
  for (const s of settlements) {
    if (!inRange(s.date)) continue;
    const d = ensure(s.date);
    const t = (d.byTerminal[s.terminalId] ??= { fact: 0, gross: 0, commission: 0 });
    t.fact += s.factAmount;
    t.gross += s.grossAmount;
    t.commission += s.commissionAmount;
    d.bankFact += s.factAmount;
    d.bankGross += s.grossAmount;
    d.commission += s.commissionAmount;
    if (s.fromDocumentDate) {
      d.approximateDate = true;
      approxByDay.set(s.date, (approxByDay.get(s.date) ?? 0) + s.grossAmount);
    }
  }

  const days = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const d of days) {
    d.diff = d.kassaCard - d.bankGross;
    d.diffFact = d.kassaCard - d.bankFact;
  }

  const totals = zero();
  const byMonth = new Map<string, SverkaTotals>();
  for (const d of days) {
    const approx = approxByDay.get(d.date) ?? 0;
    addDay(totals, d, approx);
    const m = d.date.slice(0, 7);
    let mt = byMonth.get(m);
    if (!mt) byMonth.set(m, (mt = zero()));
    addDay(mt, d, approx);
  }

  return {
    days,
    totals,
    months: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, t]) => ({ month, totals: t })),
  };
}

/** `Date` → "YYYY-MM-DD" (UTC). Sana kaliti hamma joyda shu ko'rinishda. */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
