// SVERKANI YIG'ISH — sof hisob, bazasiz.
//
// Ikki tomon KUN bo'yicha jamlanadi va solishtiriladi:
//   kassa tomoni — fiskal apparatning "тўлов терминали" ustuni;
//   bank tomoni  — ekvayring tushumining YALPI summasi (komissiyagacha).
//
// NEGA yalpi bilan. Bankka komissiya ushlanib tushadi, kassa apparati esa
// mijoz to'lagan to'liq summani ko'radi. Ularni to'g'ridan-to'g'ri
// solishtirish har kuni komissiya hajmida "kamomad" ko'rsatardi.

import type { PosChannel } from "./types";

/**
 * BITTA KANAL bo'yicha ikki tomon.
 *
 * Kassa tomoni — apparatning to'lov turi kesimi (`FiscalDailyReport.channels`),
 * bank tomoni — o'sha kanalning ekvayring hisob-kitobi. Ikkisi bir-biriga
 * bog'liq emas: kesim yuklanmagan kanal `kassa: 0` bo'lib turadi, bankda
 * ko'rinmagan kanal esa `bankGross: 0`. Aynan shu ikki holat "pul qayerda?"
 * savolini beradi, shuning uchun ular yashirilmaydi.
 */
export interface ChannelTotals {
  kassa: number;
  bankFact: number;
  bankGross: number;
  commission: number;
  /**
   * `kassa − bankGross`. Musbat = bankka yetib bormagan.
   *
   * ISHORA asosiy jadval bilan AYNI (`SverkaDay.diff`). Kanal kesimida uni
   * teskari qilish bitta ekranda ikki xil "farq" ma'nosini yaratardi.
   */
  diff: number;
}

export type ChannelMap = Partial<Record<PosChannel, ChannelTotals>>;

/** Kassa apparatining bir kunlik, bir kanallik kesimi. */
export interface KassaChannelDay {
  date: string; // YYYY-MM-DD
  channel: PosChannel;
  amount: number;
}

export interface DeviceDay {
  deviceId: string;
  date: string; // YYYY-MM-DD
  cardAmount: number;
  cashAmount: number;
}

export interface SettlementDay {
  terminalId: string;
  /** Terminalning kanali — oy × kanal kesimi shu bo'yicha yig'iladi. */
  channel: PosChannel;
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
  /** Kanal kesimi. Faqat shu kunda uchragan kanallar bo'ladi. */
  byChannel: ChannelMap;
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
  /**
   * Kanal kesimi.
   *
   * DIQQAT: kanal qatorlari `kassaCard` ga QO'SHILMAYDI — ular karta
   * tushumining ichki bo'lagi va faqat kesim yuklangan kanallar uchun
   * to'ladi. Yig'indi sifatida emas, solishtiruv sifatida o'qiladi.
   */
  byChannel: ChannelMap;
}

export interface SverkaResult {
  days: SverkaDay[];
  totals: SverkaTotals;
  months: { month: string; totals: SverkaTotals }[];
}

const zero = (): SverkaTotals => ({
  kassaCard: 0, kassaCash: 0, bankFact: 0, bankGross: 0,
  commission: 0, diff: 0, diffFact: 0, approximateAmount: 0,
  byChannel: {},
});

const zeroChannel = (): ChannelTotals => ({ kassa: 0, bankFact: 0, bankGross: 0, commission: 0, diff: 0 });

/** Kesimdagi kanal katagini oladi (yo'q bo'lsa ochadi). */
function channelCell(map: ChannelMap, channel: PosChannel): ChannelTotals {
  return (map[channel] ??= zeroChannel());
}

function addDay(t: SverkaTotals, d: SverkaDay, approx: number): void {
  t.kassaCard += d.kassaCard;
  t.kassaCash += d.kassaCash;
  t.bankFact += d.bankFact;
  t.bankGross += d.bankGross;
  t.commission += d.commission;
  t.diff += d.diff;
  t.diffFact += d.diffFact;
  t.approximateAmount += approx;
  for (const [ch, src] of Object.entries(d.byChannel) as [PosChannel, ChannelTotals][]) {
    const c = channelCell(t.byChannel, ch);
    c.kassa += src.kassa;
    c.bankFact += src.bankFact;
    c.bankGross += src.bankGross;
    c.commission += src.commission;
    c.diff = c.kassa - c.bankGross;
  }
}

/**
 * Kunlik sverkani yig'adi.
 *
 * `from`/`to` berilsa, natija AYNAN shu oraliqdagi kunlardan iborat bo'ladi —
 * bank tomonida davrdan tashqarida qolgan hisob-kitoblar (masalan oldingi oy
 * savdosi) yig'indini shishirmasligi uchun.
 *
 * @param kassaChannels Kassa apparatining to'lov turi kesimlari. ALOHIDA
 *   kirish: ular `cardAmount` ning ICHKI bo'lagi, shuning uchun `deviceDays`
 *   ga qo'shilsa savdo ikki marta sanalardi.
 */
export function reconcile(
  deviceDays: DeviceDay[],
  settlements: SettlementDay[],
  range?: { from: string; to: string },
  kassaChannels: KassaChannelDay[] = [],
): SverkaResult {
  const inRange = (d: string) => !range || (d >= range.from && d <= range.to);
  const map = new Map<string, SverkaDay>();

  const ensure = (date: string): SverkaDay => {
    let d = map.get(date);
    if (!d) {
      d = {
        date, byDevice: {}, kassaCard: 0, kassaCash: 0, byTerminal: {},
        bankFact: 0, bankGross: 0, commission: 0, diff: 0, diffFact: 0, approximateDate: false,
        byChannel: {},
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

  for (const k of kassaChannels) {
    if (!inRange(k.date)) continue;
    channelCell(ensure(k.date).byChannel, k.channel).kassa += k.amount;
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
    const c = channelCell(d.byChannel, s.channel);
    c.bankFact += s.factAmount;
    c.bankGross += s.grossAmount;
    c.commission += s.commissionAmount;
    if (s.fromDocumentDate) {
      d.approximateDate = true;
      approxByDay.set(s.date, (approxByDay.get(s.date) ?? 0) + s.grossAmount);
    }
  }

  const days = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const d of days) {
    d.diff = d.kassaCard - d.bankGross;
    d.diffFact = d.kassaCard - d.bankFact;
    for (const c of Object.values(d.byChannel)) c.diff = c.kassa - c.bankGross;
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
