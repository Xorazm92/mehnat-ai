"use server";

// =====================================================
// KASSALAR HISOBOTI — "pul qaysi kassada turibdi"
// =====================================================
//
// Auditning markaziy jadvali: har kassa bo'yicha ochilish → kirim → chiqim →
// yopilish. Ilgari u qo'lda Excel'da yig'ilardi.
//
// MANBA — JURNAL (`LedgerEntry` CASH oyoqlari), jadval agregatlari emas.
// Sabab: jurnalda har harakat kanal o'lchovi bilan yozilgan, ya'ni "pul qaysi
// hisobdan chiqdi" savoliga faqat u javob bera oladi. Backfilldan keyin
// jurnal to'liq (`recovery:status` → journal.gaps = 0), shuning uchun bu
// raqamlar balans bilan mos tushadi.
//
// KANALSIZ QATOR ATAYIN KO'RSATILADI. Tarixiy yozuvlarda `channelId` yo'q va
// ularni yashirish jadvalni "chiroyli, lekin yolg'on" qilardi — jami balansga
// to'g'ri kelmasdi. U alohida qator bo'lib turadi va nolga intilishi kerak.

import { prisma } from "@/lib/prisma";
import { requireKassa } from "@/server/guards";
import { serialize } from "@/lib/serialize";
import { getCashByChannel } from "@/lib/ledger";
import { getChannelBalances } from "@/lib/transit";
import { periodKeyOf } from "@/lib/periods";
import {
  CHANNEL_TYPE_LABELS,
  CHANNEL_TYPE_ORDER,
  normalizeChannelType,
  type ChannelType,
} from "@/lib/transitChannels";

export interface CashDeskRow {
  channelId: string | null;
  label: string;
  type: ChannelType | null;
  typeLabel: string;
  detail: string | null;
  /** Davr boshigacha bo'lgan qoldiq. */
  opening: number;
  /** Shu davrdagi kirim va chiqim. */
  income: number;
  outflow: number;
  /** Davr oxiridagi qoldiq (opening + income − outflow). */
  closing: number;
  isActive: boolean;
  /**
   * Xodim kartalari uchun TRANZIT qoldig'i — mustaqil ikkinchi o'lchov.
   * Jurnal bilan mos kelmasa, demak karta xarajati kassaga bog'lanmagan.
   */
  transitBalance: number | null;
}

export interface CashDeskReport {
  period: string;
  rows: CashDeskRow[];
  totals: { opening: number; income: number; outflow: number; closing: number };
  /** Kanali ko'rsatilmagan pul — nolga intilishi kerak. */
  unassigned: number;
}

/**
 * @param period "YYYY-MM". Berilmasa joriy oy.
 */
export async function getCashDeskReport(period?: string): Promise<CashDeskReport> {
  await requireKassa();
  const key = period ?? periodKeyOf(new Date());
  const prevKey = (() => {
    const [y, m] = key.split("-").map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  })();

  const [channels, through, before, transit] = await Promise.all([
    prisma.disbursementChannel.findMany({
      select: { id: true, type: true, label: true, cardMask: true, transitAccount: true, isActive: true },
    }),
    getCashByChannel(prisma as never, key),
    getCashByChannel(prisma as never, prevKey),
    getChannelBalances(prisma as never, { includeInactive: true }),
  ]);

  const byId = new Map(channels.map((c) => [c.id, c]));
  const openingBy = new Map(before.map((r) => [r.channelId ?? "", r.balance]));
  const transitBy = new Map(transit.map((t) => [t.id, t.balance]));

  // Davr harakati = shu davr oxirigacha − oldingi davr oxirigacha.
  const rows: CashDeskRow[] = through.map((r) => {
    const id = r.channelId;
    const ch = id ? byId.get(id) : undefined;
    const kind = ch ? normalizeChannelType(ch.type) : null;
    const opening = openingBy.get(id ?? "") ?? 0;
    const closing = r.balance;

    return {
      channelId: id,
      label: ch?.label ?? (id ? "(o'chirilgan kanal)" : "Kanali ko'rsatilmagan"),
      type: kind,
      typeLabel: kind ? CHANNEL_TYPE_LABELS[kind] : "—",
      detail: ch ? (kind === "own_firm_account" ? ch.transitAccount : ch.cardMask) : null,
      opening,
      // Kirim/chiqim davr ichidagi xom debit/credit emas: ular butun tarixni
      // qamraydi. Shuning uchun farq olinadi va faqat SHU davr harakati chiqadi.
      income: Math.max(0, closing - opening),
      outflow: Math.max(0, opening - closing),
      closing,
      isActive: ch?.isActive ?? false,
      transitBalance: id ? (transitBy.get(id) ?? null) : null,
    };
  });

  // Hali harakat bo'lmagan kanallar ham ko'rinsin — aks holda yangi ochilgan
  // naqd kassa jadvalda umuman paydo bo'lmasdi va "ochdimmi?" degan savol
  // javobsiz qolardi.
  for (const c of channels) {
    if (rows.some((r) => r.channelId === c.id)) continue;
    const kind = normalizeChannelType(c.type);
    rows.push({
      channelId: c.id,
      label: c.label,
      type: kind,
      typeLabel: kind ? CHANNEL_TYPE_LABELS[kind] : "—",
      detail: kind === "own_firm_account" ? c.transitAccount : c.cardMask,
      opening: 0, income: 0, outflow: 0, closing: 0,
      isActive: c.isActive,
      transitBalance: transitBy.get(c.id) ?? null,
    });
  }

  const order = (r: CashDeskRow) =>
    r.type ? CHANNEL_TYPE_ORDER.indexOf(r.type) : CHANNEL_TYPE_ORDER.length;
  rows.sort((a, b) => order(a) - order(b) || b.closing - a.closing);

  const totals = rows.reduce(
    (t, r) => ({
      opening: t.opening + r.opening,
      income: t.income + r.income,
      outflow: t.outflow + r.outflow,
      closing: t.closing + r.closing,
    }),
    { opening: 0, income: 0, outflow: 0, closing: 0 }
  );

  return serialize({
    period: key,
    rows,
    totals,
    unassigned: rows.find((r) => r.channelId === null)?.closing ?? 0,
  });
}
