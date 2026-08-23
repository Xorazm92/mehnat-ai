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
   * FAQAT XODIM KARTALARI uchun TRANZIT qoldig'i — mustaqil ikkinchi o'lchov.
   * Jurnal bilan mos kelmasa, demak karta xarajati kassaga bog'lanmagan.
   *
   * Boshqa turlarda ATAYIN `null`: bank schyoti, naqd seyf va plastik
   * terminalda tranzit daftari umuman yuritilmaydi, ya'ni u yerda qiymat
   * har doim 0 bo'ladi. UI esa "0 ≠ qoldiq" ni nomuvofiqlik deb ko'rsatib,
   * har bir harakatdagi oddiy kassa yonida qizil "farq" yozuvini chiqarardi
   * — hech qanday muammo bo'lmasa ham.
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
    getCashByChannel(prisma, key),
    getCashByChannel(prisma, prevKey),
    getChannelBalances(prisma, { includeInactive: true }),
  ]);

  const byId = new Map(channels.map((c) => [c.id, c]));
  const beforeBy = new Map(before.map((r) => [r.channelId ?? "", r]));
  const transitBy = new Map(transit.map((t) => [t.id, t.balance]));

  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  /** Tranzit o'lchovi faqat kartada ma'noli — qolganida solishtiruv yo'q. */
  const transitOf = (id: string | null, kind: ChannelType | null) =>
    id && kind === "employee_card" ? (transitBy.get(id) ?? null) : null;

  // Davr harakati = shu davr oxirigacha (debit/credit) − oldingi davr oxirigacha.
  const rows: CashDeskRow[] = through.map((r) => {
    const id = r.channelId;
    const ch = id ? byId.get(id) : undefined;
    const kind = ch ? normalizeChannelType(ch.type) : null;
    const beforeRow = beforeBy.get(id ?? "");
    const opening = beforeRow ? r2(beforeRow.debit - beforeRow.credit) : 0;
    const income = r2(Math.max(0, r.debit - (beforeRow?.debit ?? 0)));
    const outflow = r2(Math.max(0, r.credit - (beforeRow?.credit ?? 0)));
    const closing = r.balance;

    return {
      channelId: id,
      label: ch?.label ?? (id ? "(o'chirilgan kanal)" : "Kanali ko'rsatilmagan"),
      type: kind,
      typeLabel: kind ? CHANNEL_TYPE_LABELS[kind] : "—",
      detail: ch ? (kind === "own_firm_account" ? ch.transitAccount : ch.cardMask) : null,
      opening,
      income,
      outflow,
      closing,
      isActive: ch?.isActive ?? false,
      transitBalance: transitOf(id, kind),
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
      transitBalance: transitOf(c.id, kind),
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

// =====================================================
// MODDALAR KESIMI — Excel "DASHBOARD" varag'ining o'rnini bosadi
// =====================================================
//
// Buxgalter Excelda har oy bitta savolga javob izlaydi: "shu oyda qaysi
// MODDA bo'yicha qancha kirdi va chiqdi". Kassalar jadvali (yuqorida) "pul
// qayerda" ga javob beradi, bu esa "pul nimaga" ga.
//
// MANBA — `KassaEntry`, jurnal EMAS. Sabab: modda (`category`) jurnal
// oyoqlarida saqlanmaydi, u faqat kassa yozuvida turadi. Ikkalasining
// summasi bir xil bo'lishi kerak, chunki har kassa yozuvi jurnalga aynan
// o'z summasi bilan tushadi (`server/kassa.ts` postExpenseLegs).
//
// MIJOZ TO'LOVLARI ATAYIN QO'SHILMAGAN va alohida qator bo'lib ko'rsatiladi.
// Ular `Payment` jadvalida yashaydi (`/kassa/kirim`), kassa moddasi emas —
// bittasiga qo'shib yuborilsa, "Firma to'lovi" moddasi bir xil pulni ikki
// manbadan sanab, oylik tushum ikki barobar ko'rinardi.

export interface CategoryRow {
  category: string;
  type: "income" | "expense";
  count: number;
  amount: number;
}

export interface CategoryBreakdown {
  period: string;
  income: CategoryRow[];
  expense: CategoryRow[];
  incomeTotal: number;
  expenseTotal: number;
  /** Shu davrdagi shartnoma to'lovlari — kassa moddasi emas, ma'lumot uchun. */
  contractPayments: { count: number; amount: number };
  /** Tasdiq kutayotgan chiqim — jamiga KIRMAYDI, alohida ko'rsatiladi. */
  pending: { count: number; amount: number };
}

export async function getCategoryBreakdown(period?: string): Promise<CategoryBreakdown> {
  await requireKassa();
  const key = period ?? periodKeyOf(new Date());
  const [y, m] = key.split("-").map(Number);
  // Yarim ochiq chegara [from, to) — oyning oxirgi kunidagi yozuv tushib
  // qolmasin (`lib/dateRange.ts` bilan bir xil qoida).
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 1);

  const [grouped, payments, pendingRows] = await Promise.all([
    // FAQAT TASDIQLANGAN. Ilgari `status: { not: "rejected" }` edi, ya'ni
    // tasdiq kutayotgan xarajat ham qo'shilardi — balans bloki esa faqat
    // tasdiqlanganini sanaydi (`lib/balance.ts`). Natijada BITTA ekranda
    // "Chiqim, avgust" ikki xil raqam bilan turardi: 195,826,320 va
    // 132,778,320 (farq — 3 ta kutayotgan xarajat, 63 048 000).
    prisma.kassaEntry.groupBy({
      by: ["type", "category"],
      where: { deletedAt: null, status: "approved", date: { gte: from, lt: to } },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { period: key, deletedAt: null, status: { in: ["paid", "partial"] } },
      _count: true,
      _sum: { amount: true },
    }),
    // Tasdiq kutayotganlar ALOHIDA — jamiga qo'shilmaydi, lekin ekranda
    // ko'rinib turishi kerak: aks holda "3 ta xarajat kutmoqda" faqat
    // /expenses da ko'rinardi va kassada pul yo'qolganday tuyulardi.
    prisma.kassaEntry.aggregate({
      where: { deletedAt: null, status: "pending", type: "expense", date: { gte: from, lt: to } },
      _count: true,
      _sum: { amount: true },
    }),
  ]);

  const rows: CategoryRow[] = grouped.map((g) => ({
    category: g.category,
    type: g.type === "income" ? "income" : "expense",
    count: g._count,
    amount: Number(g._sum.amount ?? 0),
  }));

  const pick = (t: "income" | "expense") =>
    rows.filter((r) => r.type === t).sort((a, b) => b.amount - a.amount);

  const income = pick("income");
  const expense = pick("expense");

  return serialize({
    period: key,
    income,
    expense,
    incomeTotal: income.reduce((s, r) => s + r.amount, 0),
    expenseTotal: expense.reduce((s, r) => s + r.amount, 0),
    contractPayments: {
      count: payments._count,
      amount: Number(payments._sum.amount ?? 0),
    },
    pending: {
      count: pendingRows._count,
      amount: Number(pendingRows._sum.amount ?? 0),
    },
  });
}
