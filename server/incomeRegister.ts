"use server";

// =====================================================
// KIRIM REYESTRI — BARCHA TUSHUM BITTA JADVALDA
// =====================================================
//
// MUAMMO: kirim ma'lumoti uch joyga tarqalgan edi — bank kartochkalari,
// "Plastik va naqd tushumlari" bloki va "moslashtirilmagan kirimlar" navbati.
// Hech qaysi ekranda "shu oraliqda KIM, QANCHA, QAYSI KANAL orqali to'ladi"
// degan yagona jadval yo'q edi va sana oralig'i filtri ham yo'q edi.
// Foydalanuvchining "to'liq kirim kassani ko'ra olmayapman" shikoyati aynan shu.
//
// IKKI MANBA, chunki ular ikki xil pul:
//   PaymentAllocation — MIJOZning to'lovi (bank / plastik / naqd), qarzini
//                       kamaytiradi. Kun aniqligi `receivedAt` da.
//   KassaEntry(income) — NOMSIZ tushum, hech kimning qarzini kamaytirmaydi.
//
// Ikkalasi ham balansda BIR MARTA sanaladi (biri Payment, ikkinchisi
// KassaEntry orqali — `lib/balance.ts`), shuning uchun bitta jadvalda
// qo'shib ko'rsatish to'g'ri va yig'indi ikki barobar chiqmaydi.
//
// `Payment` jadvalining O'ZI bu yerda ISHLATILMAYDI: u oylik yig'ma qator
// (`@@unique([companyId, period])`) va kun aniqligi yo'q. Kunlik oraliq
// so'ralganda undan foydalanish "1–19 avgust" ni butun avgustga aylantirardi.

import { prisma } from "@/lib/prisma";
import { requireStatementRole } from "@/server/guards";
import { serialize } from "@/lib/serialize";
import { resolveRange, type RangePreset, type CustomRange } from "@/lib/dateRange";
import { CHANNEL_TYPE_LABELS, normalizeChannelType } from "@/lib/transitChannels";

export interface IncomeRegisterFilter {
  preset?: RangePreset;
  custom?: CustomRange;
  companyId?: string | null;
  /** bank | plastik | naqd */
  source?: string | null;
  channelId?: string | null;
  search?: string | null;
  limit?: number;
}

export interface IncomeRegisterRow {
  id: string;
  receivedAt: string | null;
  companyId: string | null;
  companyName: string | null;
  companyInn: string | null;
  contractNumber: string | null;
  period: string | null;
  source: string;
  channelId: string | null;
  channelLabel: string | null;
  amount: number;
  docRef: string | null;
  note: string | null;
  /** Mijozga bog'lanmagan nomsiz tushum. */
  anonymous: boolean;
}

export interface IncomeRegisterTotals {
  total: number;
  naqd: number;
  plastik: number;
  bank: number;
  count: number;
  /** Mijozga bog'lanmagan tushum — bu raqam katta bo'lsa ma'lumot sifati past. */
  anonymousTotal: number;
  /**
   * `limit` ga siqib tashlangan qatorlar. Ekranda ko'rsatiladi: aks holda
   * ro'yxat JIM qisqardi va jami "hammasi shu" deb xato o'qilardi.
   */
  truncated: number;
}

const SOURCES = new Set(["bank", "plastik", "naqd"]);

/**
 * Tanlangan oraliqdagi BARCHA tushum + kesimlar bo'yicha yig'indi.
 *
 * Yig'indi jadval qatorlaridan hisoblanadi (alohida `aggregate` so'rovi emas) —
 * shu bilan ekrandagi jami har doim ko'rinib turgan qatorlarga TENG bo'ladi.
 * Ikki mustaqil so'rov bo'lsa filtr biriga tushib, ikkinchisiga tushmay
 * qolishi mumkin edi va "jami qatorlar yig'indisiga to'g'ri kelmayapti"
 * degan klassik xato chiqardi.
 */
export async function getIncomeRegister(filter: IncomeRegisterFilter = {}) {
  await requireStatementRole();

  const range = resolveRange(filter.preset ?? "month_to_date", filter.custom);
  const limit = filter.limit ?? 1000;
  const source = filter.source && SOURCES.has(filter.source) ? filter.source : null;
  const q = filter.search?.trim().toLowerCase() || null;

  // `KassaEntry(income)` — asosan nomsiz tushum, lekin ESKI qatorlarda
  // `companyId` to'ldirilgan bo'lishi mumkin (eski forma uni qabul qilardi).
  // Shuning uchun ularni `companyId: null` bo'yicha filtrlamaymiz — aks holda
  // o'sha pul reyestrdan JIM tushib qolardi va jami raqam kam chiqardi.
  // Firma filtri qo'yilganda esa faqat o'sha firmaniki qoldiriladi.

  const [allocations, manual, channels, allocCount, manualCount] = await Promise.all([
    prisma.paymentAllocation.findMany({
      where: {
        receivedAt: { gte: range.from, lt: range.to },
        ...(source ? { source } : {}),
        ...(filter.channelId ? { channelId: filter.channelId } : {}),
        payment: {
          deletedAt: null,
          ...(filter.companyId ? { companyId: filter.companyId } : {}),
        },
      },
      select: {
        id: true,
        source: true,
        amount: true,
        receivedAt: true,
        externalRef: true,
        channelId: true,
        contract: { select: { number: true } },
        payment: {
          select: {
            period: true,
            companyId: true,
            comment: true,
            company: { select: { name: true, inn: true } },
          },
        },
      },
      orderBy: [{ receivedAt: "desc" }, { amount: "desc" }],
      take: limit,
    }),
    source === "bank"
      ? Promise.resolve([])
      : prisma.kassaEntry.findMany({
          where: {
            type: "income",
            deletedAt: null,
            date: { gte: range.from, lt: range.to },
            ...(filter.companyId ? { companyId: filter.companyId } : {}),
            ...(filter.channelId ? { channelId: filter.channelId } : {}),
            ...(source === "naqd" ? { category: "Naqd tushum" } : {}),
            ...(source === "plastik" ? { category: "Plastik tushum" } : {}),
          },
          select: {
            id: true,
            category: true,
            amount: true,
            date: true,
            description: true,
            channelId: true,
            companyId: true,
          },
          orderBy: { date: "desc" },
          take: limit,
        }),
    prisma.disbursementChannel.findMany({ select: { id: true, label: true, type: true } }),
    // Kesilgan qatorlarni sanaymiz — ekranda "yana N ta" ko'rsatish uchun.
    prisma.paymentAllocation.count({
      where: {
        receivedAt: { gte: range.from, lt: range.to },
        ...(source ? { source } : {}),
        ...(filter.channelId ? { channelId: filter.channelId } : {}),
        payment: {
          deletedAt: null,
          ...(filter.companyId ? { companyId: filter.companyId } : {}),
        },
      },
    }),
    source === "bank"
      ? Promise.resolve(0)
      : prisma.kassaEntry.count({
          where: {
            type: "income",
            deletedAt: null,
            date: { gte: range.from, lt: range.to },
            ...(filter.companyId ? { companyId: filter.companyId } : {}),
            ...(filter.channelId ? { channelId: filter.channelId } : {}),
            ...(source === "naqd" ? { category: "Naqd tushum" } : {}),
            ...(source === "plastik" ? { category: "Plastik tushum" } : {}),
          },
        }),
  ]);

  // `KassaEntry.companyId` FK EMAS (kanal bilan bir xil qoida: firma
  // o'chirilsa tarixiy yozuv yo'qolmasin), shuning uchun nomni `include`
  // bilan olib bo'lmaydi — alohida bitta so'rov bilan xaritalaymiz.
  const manualCompanyIds = [...new Set(manual.map((k) => k.companyId).filter(Boolean))] as string[];
  const manualCompanies = manualCompanyIds.length
    ? await prisma.company.findMany({
        where: { id: { in: manualCompanyIds } },
        select: { id: true, name: true, inn: true },
      })
    : [];
  const companyById = new Map(manualCompanies.map((c) => [c.id, c]));

  const channelById = new Map(channels.map((c) => [c.id, c]));
  const labelOf = (id: string | null): string | null => {
    if (!id) return null;
    const ch = channelById.get(id);
    if (!ch) return "O'chirilgan kassa";
    const kind = normalizeChannelType(ch.type);
    return kind ? `${ch.label} (${CHANNEL_TYPE_LABELS[kind]})` : ch.label;
  };

  const rows: IncomeRegisterRow[] = [
    ...allocations.map((a) => ({
      id: a.id,
      receivedAt: a.receivedAt ? a.receivedAt.toISOString() : null,
      companyId: a.payment?.companyId ?? null,
      companyName: a.payment?.company.name ?? null,
      companyInn: a.payment?.company.inn ?? null,
      contractNumber: a.contract?.number ?? null,
      period: a.payment?.period ?? null,
      source: a.source,
      channelId: a.channelId,
      channelLabel: labelOf(a.channelId),
      amount: Number(a.amount),
      docRef: a.externalRef,
      note: a.payment?.comment ?? null,
      anonymous: false,
    })),
    ...manual.map((k) => ({
      id: k.id,
      receivedAt: k.date.toISOString(),
      companyId: k.companyId,
      companyName: k.companyId ? (companyById.get(k.companyId)?.name ?? null) : null,
      companyInn: k.companyId ? (companyById.get(k.companyId)?.inn ?? null) : null,
      contractNumber: null,
      period: null,
      source: k.category === "Naqd tushum" ? "naqd" : "plastik",
      channelId: k.channelId,
      channelLabel: labelOf(k.channelId),
      amount: Number(k.amount),
      docRef: null,
      note: k.description,
      anonymous: !k.companyId,
    })),
  ]
    .filter((r) => {
      if (!q) return true;
      return (
        (r.companyName ?? "").toLowerCase().includes(q) ||
        (r.companyInn ?? "").includes(q) ||
        (r.contractNumber ?? "").toLowerCase().includes(q) ||
        (r.docRef ?? "").toLowerCase().includes(q) ||
        (r.note ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => (b.receivedAt ?? "").localeCompare(a.receivedAt ?? ""));

  const totals: IncomeRegisterTotals = {
    total: 0,
    naqd: 0,
    plastik: 0,
    bank: 0,
    count: rows.length,
    anonymousTotal: 0,
    // Qidiruv (q) MIJOZDA ham kesadi — u hisobga kirgan kesilgan emas.
    truncated: Math.max(0, allocCount + manualCount - rows.length),
  };
  for (const r of rows) {
    totals.total += r.amount;
    if (r.source === "naqd") totals.naqd += r.amount;
    else if (r.source === "plastik") totals.plastik += r.amount;
    else if (r.source === "bank") totals.bank += r.amount;
    if (r.anonymous) totals.anonymousTotal += r.amount;
  }

  return serialize({
    rows,
    totals,
    range: { from: range.from.toISOString(), to: range.to.toISOString(), preset: range.preset },
  });
}
