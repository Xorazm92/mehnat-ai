"use server";

// =====================================================
// OPERATSIYALAR JURNALI — barcha pul harakati BITTA JADVALDA
// =====================================================
//
// MUAMMO. Buxgalter Excel'da ishlagan: hammasi BIR varaqda, ustunlar
// filtrlanadi, kerak bo'lsa eksport qilinadi. Bu tizimda esa pul harakati
// 5 ekranga tarqalgandi (/kassa, /kassa/kirim, /kassa/chiqim, /expenses,
// /payroll) va har biri ichma-ich tabli — foydalanuvchi "pul qayerda?"
// savoliga javob izlab saytda yo'qolardi.
//
// BU MODUL bitta savolga javob beradi: "SHU ORALIQDA QAYSI PUL QAYDI
// O'TDI?" Uch manba, uch xil pul — lekin jadval bitta:
//   KassaEntry        — kassadan yozilgan kirim/chiqim (tasdiq oqimi bilan)
//   PaymentAllocation — MIJOZning shartnoma to'lovi (qarzni kamaytiradi)
//   Payout            — berilgan oylik (balans uni shu yerdan sanaydi)
//
// SANOQ INTIZOMI (`lib/balance.ts` bilan bir xil):
//   - `rejected` ko'rsatiladi lekin JAMLARDA YO'Q (pul chiqmagan)
//   - `pending` chiqim ko'rsatiladi lekin JAMLARDA YO'Q (hali tasdiqlanmagan,
//     balans ham uni sanamaydi) — aks holda ekran va balans ikki raqam aytardi

import { prisma } from "@/lib/prisma";
import { requireKassa } from "@/server/guards";
import { serialize } from "@/lib/serialize";
import { resolveRange, type RangePreset, type CustomRange } from "@/lib/dateRange";

export interface JournalRow {
  id: string;
  kind: "kirim" | "chiqim";
  /** kassa | shartnoma | oylik */
  sourceType: string;
  sourceLabel: string;
  date: string;
  channelLabel: string | null;
  category: string | null;
  /** Firma yoki xodim nomi. */
  who: string | null;
  description: string | null;
  amount: number;
  status: "approved" | "pending" | "rejected" | null;
  rejectedReason?: string | null;
  /** Faqat `KassaEntry` tahrirlanadi/o'chiriladi — qolganlari manba hisobi. */
  editable: boolean;
}

export interface JournalFilter {
  preset?: RangePreset;
  custom?: CustomRange;
  /** all | kirim | chiqim */
  kind?: string;
  channelId?: string | null;
  search?: string | null;
  limit?: number;
}

export interface JournalData {
  rows: JournalRow[];
  totals: { kirim: number; chiqim: number; netto: number; count: number };
  /** `limit` ga sig'magan qatorlar — UI "yana bor" deb ogohlantiradi. */
  truncated: number;
}

export async function getKassaJournal(filter: JournalFilter = {}): Promise<JournalData> {
  await requireKassa();

  const range = resolveRange(filter.preset ?? "month_to_date", filter.custom);
  const limit = Math.min(Math.max(filter.limit ?? 1000, 1), 5000);
  const kind = filter.kind === "kirim" || filter.kind === "chiqim" ? filter.kind : "all";
  const q = filter.search?.trim().toLowerCase() || null;

  const [entries, allocations, payouts, channels] = await Promise.all([
    prisma.kassaEntry.findMany({
      where: {
        deletedAt: null,
        date: { gte: range.from, lt: range.to },
        ...(kind !== "all" ? { type: kind === "kirim" ? "income" : "expense" } : {}),
        ...(filter.channelId ? { channelId: filter.channelId } : {}),
      },
      select: {
        id: true, type: true, category: true, amount: true, date: true,
        description: true, channelId: true, companyId: true,
        status: true, rejectedReason: true,
        user: { select: { fullName: true } },
      },
      orderBy: { date: "desc" },
      take: limit,
    }),
    kind === "chiqim"
      ? Promise.resolve([])
      : prisma.paymentAllocation.findMany({
          where: {
            receivedAt: { gte: range.from, lt: range.to },
            ...(filter.channelId ? { channelId: filter.channelId } : {}),
            payment: { deletedAt: null },
          },
          select: {
            id: true, source: true, amount: true, receivedAt: true,
            channelId: true, externalRef: true,
            contract: { select: { number: true } },
            payment: {
              select: {
                period: true, comment: true,
                company: { select: { name: true, inn: true } },
              },
            },
          },
          orderBy: { receivedAt: "desc" },
          take: limit,
        }),
    kind === "kirim"
      ? Promise.resolve([])
      : prisma.payout.findMany({
          where: {
            deletedAt: null,
            paidAt: { gte: range.from, lt: range.to },
          },
          select: {
            id: true, amount: true, paidAt: true, month: true, note: true,
            employee: { select: { fullName: true } },
          },
          orderBy: { paidAt: "desc" },
          take: limit,
        }),
    prisma.disbursementChannel.findMany({ select: { id: true, label: true } }),
  ]);

  // `KassaEntry.companyId` FK emas — firma nomini alohida xarita bilan olamiz.
  const companyIds = [...new Set(entries.map((e) => e.companyId).filter(Boolean))] as string[];
  const companies = companyIds.length
    ? await prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } })
    : [];
  const companyById = new Map(companies.map((c) => [c.id, c.name]));
  const channelById = new Map(channels.map((c) => [c.id, c.label]));
  const channelOf = (id: string | null) => (id ? channelById.get(id) ?? "O'chirilgan kassa" : null);

  const rows: JournalRow[] = [
    ...entries.map((e): JournalRow => ({
      id: e.id,
      kind: e.type === "income" ? "kirim" : "chiqim",
      sourceType: "kassa",
      sourceLabel: "Kassa operatsiyasi",
      date: e.date.toISOString(),
      channelLabel: channelOf(e.channelId),
      category: e.category,
      who: e.companyId ? companyById.get(e.companyId) ?? null : null,
      description: e.description ?? null,
      amount: Number(e.amount),
      status: (["approved", "pending", "rejected"] as const).includes(e.status as never)
        ? (e.status as JournalRow["status"])
        : "approved",
      rejectedReason: e.rejectedReason ?? null,
      editable: true,
    })),
    ...allocations.map((a): JournalRow => ({
      id: a.id,
      kind: "kirim",
      sourceType: "shartnoma",
      sourceLabel: "Shartnoma to'lovi",
      date: a.receivedAt ? a.receivedAt.toISOString() : "",
      channelLabel: channelOf(a.channelId),
      category: a.contract?.number ?? a.payment?.period ?? null,
      who: a.payment?.company?.name ?? null,
      description: a.payment?.comment ?? a.externalRef ?? null,
      amount: Number(a.amount),
      status: "approved",
      editable: false,
    })),
    ...payouts.map((p): JournalRow => ({
      id: p.id,
      kind: "chiqim",
      sourceType: "oylik",
      sourceLabel: "Oylik to'lovi",
      date: p.paidAt.toISOString(),
      channelLabel: null,
      category: p.month,
      who: p.employee.fullName,
      description: p.note ?? null,
      amount: Number(p.amount),
      status: "approved",
      editable: false,
    })),
  ]
    .filter((r) => {
      if (!q) return true;
      return (
        r.who?.toLowerCase().includes(q) ||
        r.category?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.channelLabel?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  // Jamlar faqat HAQIQIY pul bo'yicha: pending/rejected chiqim kirmaydi.
  let totalKirim = 0;
  let totalChiqim = 0;
  for (const r of rows) {
    if (r.status === "rejected" || r.status === "pending") continue;
    if (r.kind === "kirim") totalKirim += r.amount;
    else totalChiqim += r.amount;
  }

  // Kesilganlarni sanash — limitga sig'magan qatorlar haqida ogohlantirish.
  const returnedCount = rows.length;
  if (returnedCount >= limit * 2) {
    // Ikkala manba ham `take: limit` — kesilgan aniq sonni bilish qimmat;
    // chegarani bildirish kifoya.
    return serialize({
      rows,
      totals: { kirim: totalKirim, chiqim: totalChiqim, netto: totalKirim - totalChiqim, count: rows.length },
      truncated: -1,
    });
  }

  return serialize({
    rows,
    totals: { kirim: totalKirim, chiqim: totalChiqim, netto: totalKirim - totalChiqim, count: rows.length },
    truncated: 0,
  });
}
