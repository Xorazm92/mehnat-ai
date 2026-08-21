// =====================================================
// TRANZIT KASSA — xodim kartasi orqali o'tadigan pul
// =====================================================
//
// MUAMMO. Ba'zi to'lovlar o'zini-o'zi band qilgan xodimning kartasi orqali
// qilinadi: bank hisobidan kartaga pul o'tkaziladi, keyin o'sha kartadan
// ijara, aloqa, ovqat to'lanadi. Iyul vipiskasida bunday 77 ta o'tkazma bor
// (547 mln so'm) — ya'ni chiqimning eng katta qismi. Kartaga chiqqandan keyin
// pul qayerga ketgani tizimda umuman ko'rinmasdi.
//
// YECHIM — uch bosqichli zanjir:
//
//   bank hisobi ──(1: kirim)──► xodim kartasi ──(2: chiqim)──► ijara/aloqa/...
//
// XARAJAT QACHON YUZ BERADI. Kartaga tushgan pul HALI XARAJAT EMAS: u
// firmaning puli, faqat boshqa joyda turibdi. Xarajat kartadan sarflanganda
// yuz beradi. Shuning uchun:
//   kirim  → faqat `TransitEntry`. `KassaEntry` YOZILMAYDI — aks holda bitta
//            xarajat ikki marta sanalardi (kartaga chiqqanda va sarflanganda).
//   chiqim → `TransitEntry` + `KassaEntry(expense)` — mana shu haqiqiy xarajat.
//
// Natijada har bir karta bo'yicha "qancha berildi / qancha sarflandi / qancha
// qoldi" ko'rinadi, va tizimda "sarflanmagan" pul ham yo'qolmaydi.

import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { recordKassaMovement, type CashActor } from "@/lib/cashGate";
import { ACCOUNTS, postLedger, getCashByChannel } from "@/lib/ledger";
import { normalizeChannelType } from "@/lib/transitChannels";
import { periodKeyOf } from "@/lib/periods";

type Db = Prisma.TransactionClient;

// Kanal turlari/yorliqlari `lib/transitChannels.ts` da — mijoz komponenti ham
// ularni ishlatadi va bu fayl orqali import qilinsa Prisma brauzerga tushardi.
// Qayta eksport ATAYLAB: server tomondagi mavjud import yo'llari saqlanadi.
export { CHANNEL_TYPES, CHANNEL_TYPE_LABELS, type ChannelType } from "@/lib/transitChannels";

export interface ChannelBalance {
  id: string;
  type: string;
  label: string;
  cardMask: string | null;
  employeeId: string | null;
  employeeName: string | null;
  isActive: boolean;
  /** Kartaga tushgan jami. */
  totalIn: number;
  /** Kartadan sarflangan jami. */
  totalOut: number;
  /** Sarflanmay turgan qoldiq. */
  balance: number;
  entryCount: number;
  lastMovementAt: Date | null;
}

/**
 * Har bir kanal bo'yicha qoldiq.
 *
 * Qoldiq SAQLANMAYDI, har safar harakatlardan hisoblanadi — saqlangan qoldiq
 * vaqt o'tib haqiqatdan uzoqlashadi va uni tiklash imkoni bo'lmaydi
 * (loyihada `Payment.amount` ham xuddi shu sababdan taqsimotlardan qayta
 * hisoblanadi).
 */
export async function getChannelBalances(
  db: Db,
  opts: { includeInactive?: boolean } = {}
): Promise<ChannelBalance[]> {
  const channels = await db.disbursementChannel.findMany({
    where: opts.includeInactive ? {} : { isActive: true },
    select: {
      id: true,
      type: true,
      label: true,
      cardMask: true,
      isActive: true,
      employeeId: true,
      employee: { select: { fullName: true } },
    },
    orderBy: [{ isActive: "desc" }, { label: "asc" }],
  });
  if (channels.length === 0) return [];

  const sums = await db.transitEntry.groupBy({
    by: ["channelId", "direction"],
    _sum: { amount: true },
    _count: { _all: true },
    _max: { date: true },
  });

  const key = (channelId: string, direction: string) => `${channelId}:${direction}`;
  const byKey = new Map(sums.map((s) => [key(s.channelId, s.direction), s]));

  return channels.map((c) => {
    const inRow = byKey.get(key(c.id, "in"));
    const outRow = byKey.get(key(c.id, "out"));
    const totalIn = Number(inRow?._sum.amount ?? 0);
    const totalOut = Number(outRow?._sum.amount ?? 0);
    const dates = [inRow?._max.date, outRow?._max.date].filter(Boolean) as Date[];

    return {
      id: c.id,
      type: c.type,
      label: c.label,
      cardMask: c.cardMask,
      employeeId: c.employeeId,
      employeeName: c.employee?.fullName ?? null,
      isActive: c.isActive,
      totalIn,
      totalOut,
      balance: totalIn - totalOut,
      entryCount: (inRow?._count._all ?? 0) + (outRow?._count._all ?? 0),
      lastMovementAt: dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null,
    };
  });
}

/**
 * Bank vipiskasidagi karta o'tkazmasini kanalga bog'laydi (zanjirning 1-qadami).
 *
 * `KassaEntry` ATAYIN yozilmaydi — yuqoridagi izohga qarang.
 * Idempotent: bitta bank tranzaksiyasi bir marta.
 */
export async function recordTransitIn(
  db: Db,
  input: {
    channelId: string;
    bankTransactionId: string;
    amount: number;
    date: Date;
    description?: string | null;
    createdBy?: string | null;
  }
): Promise<{ entryId: string; alreadyLinked: boolean }> {
  const dedupKey = `bank:${input.bankTransactionId}`;

  const existing = await db.transitEntry.findUnique({
    where: { dedupKey },
    select: { id: true },
  });
  if (existing) return { entryId: existing.id, alreadyLinked: true };

  const entry = await db.transitEntry.create({
    data: {
      channelId: input.channelId,
      direction: "in",
      amount: new Prisma.Decimal(input.amount.toFixed(2)),
      date: input.date,
      description: input.description ?? null,
      bankTransactionId: input.bankTransactionId,
      dedupKey,
      createdBy: input.createdBy ?? null,
    },
    select: { id: true },
  });

  // Tranzaksiya endi hal qilingan — chiqim navbatida qolmasin.
  const bankTx = await db.bankTransaction.update({
    where: { id: input.bankTransactionId },
    data: {
      status: "posted",
      expenseCategory: "xodim_kartasi",
      postedAt: new Date(),
      postedBy: input.createdBy ?? null,
    },
    select: { accountId: true },
  });

  await postLedger(db, {
    legs: [
      { accountId: ACCOUNTS.CASH, debit: input.amount, channelId: input.channelId },
      { accountId: ACCOUNTS.CASH, credit: input.amount, channelId: bankTx.accountId },
    ],
    period: periodKeyOf(input.date),
    sourceTable: "TransitEntry",
    sourceId: entry.id,
    createdBy: input.createdBy ?? null,
    description: input.description ?? "Tranzit kartaga o'tkazildi",
  });

  return { entryId: entry.id, alreadyLinked: false };
}

export class InsufficientTransitFunds extends Error {
  constructor(
    readonly available: number,
    readonly requested: number,
    /** Kassaning nomi — xato qaysi hisob haqida ekani darhol ko'rinsin. */
    readonly channelLabel?: string
  ) {
    super(
      `${channelLabel ? `"${channelLabel}" kassasida` : "Kartada"} yetarli mablag' yo'q. ` +
        `Qoldiq: ${Math.round(available).toLocaleString("en-US")} so'm, ` +
        `so'ralgan: ${Math.round(requested).toLocaleString("en-US")} so'm.`
    );
    this.name = "InsufficientTransitFunds";
  }
}

/**
 * Kartadan qilingan xarajatni yozadi (zanjirning 2-qadami).
 *
 * `KassaEntry(expense)` MANA SHU YERDA yoziladi — haqiqiy xarajat shu.
 * Qoldiqdan ortiq sarflashga yo'l qo'yilmaydi: kartada bo'lmagan pulni
 * sarflash yozuvi daftarni ma'nosiz qilardi.
 *
 * DIQQAT — `db` SERIALIZABLE tranzaksiya klienti bo'lishi SHART
 * (`lib/tx.ts` `serializable()`). Bu funksiya qoldiqni o'qiydi, keyin yozadi;
 * tranzaksiyasiz ikki parallel chiqim bir xil qoldiqni ko'radi va overdraft
 * qo'riqchisi hech nimani kafolatlamaydi (`assertSufficientFunds` bilan bir xil
 * sabab).
 */
export async function recordTransitOut(
  db: Db,
  actor: CashActor,
  input: {
    channelId: string;
    amount: number;
    date: Date;
    category: string;
    description?: string | null;
    companyId?: string | null;
    /** Qoldiqdan ortiq sarflashga ruxsat (admin tuzatishi uchun). */
    allowOverdraft?: boolean;
  }
): Promise<{ entryId: string | null; kassaEntryId: string; balanceAfter: number }> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Summa musbat son bo'lishi kerak");
  }

  const channel = await db.disbursementChannel.findUnique({
    where: { id: input.channelId },
    select: { id: true, label: true, type: true },
  });
  if (!channel) throw new Error("Kanal topilmadi");

  // ── QOLDIQ QAYERDAN O'QILADI ──────────────────────────────────────────
  // XODIM KARTASI pulni `TransitEntry(in)` orqali oladi (bankdan kartaga
  // o'tkazma), shuning uchun uning qoldig'i tranzit daftarida.
  //
  // NAQD KASSA, PLASTIK TERMINAL va FIRMA SCHYOTI esa tranzit daftarini
  // umuman yuritmaydi — ularga pul JURNAL orqali keladi (kassa kirimi,
  // boshlang'ich qoldiq). Ularning tranzit qoldig'i har doim NOL.
  //
  // Ilgari bu yerda hamma kanal uchun tranzit qoldig'i o'qilardi, ya'ni
  // naqd/plastik/schyot kassasidan xarajat yozishga URINISH HAR SAFAR
  // "mablag' yetarli emas" bilan rad etilardi — garchi jurnalda pul turgan
  // bo'lsa ham (masalan Plastikda 11,85 mln). Bu kassalar qo'shilgandan
  // keyin paydo bo'lgan: funksiya faqat kartalar bor paytda yozilgan.
  const isCard = normalizeChannelType(channel.type) === "employee_card";

  let available: number;
  if (isCard) {
    const list = await getChannelBalances(db, { includeInactive: true });
    available = list.find((c) => c.id === input.channelId)?.balance ?? 0;
  } else {
    const cash = await getCashByChannel(db);
    available = cash.find((c) => c.channelId === input.channelId)?.balance ?? 0;
  }

  if (!input.allowOverdraft && input.amount > available) {
    throw new InsufficientTransitFunds(available, input.amount, channel.label);
  }

  // DARVOZA ORQALI (`lib/cashGate.ts`): ilgari bu yerda `kassaEntry.create`
  // to'g'ridan-to'g'ri chaqirilardi va JURNALGA HECH NARSA YOZILMASDI — ya'ni
  // kartadan qilingan har bir xarajat ikki tomonlama hisobdan tashqarida
  // qolardi. Endi manba qatori va jurnal bitta yo'ldan o'tadi.
  const kassaEntry = await recordKassaMovement(db, actor, {
    type: "expense",
    category: input.category,
    amount: input.amount,
    date: input.date,
    description: input.description ?? `${channel.label} kassasidan xarajat`,
    companyId: input.companyId ?? null,
    channelId: input.channelId,
  });

  // TRANZIT QATORI FAQAT KARTA UCHUN. Naqd kassa yoki schyot uchun ham
  // yozilsa, `getTotalTransitBalance` (u BUTUN jadvalni yig'adi) "kartalarda
  // qancha pul bor" raqamini kamaytirib yuborardi — hech qachon kartada
  // bo'lmagan pulni sarflandi deb hisoblab. Bu kassalar uchun jurnaldagi
  // `KassaEntry` yozuvi yagona va yetarli iz.
  const entry = isCard
    ? await db.transitEntry.create({
        data: {
          channelId: input.channelId,
          direction: "out",
          amount: new Prisma.Decimal(input.amount.toFixed(2)),
          date: input.date,
          category: input.category,
          description: input.description ?? null,
          kassaEntryId: kassaEntry.id,
          dedupKey: `out:${randomUUID()}`,
          createdBy: actor.kind === "user" ? actor.userId : (actor.userId ?? null),
        },
        select: { id: true },
      })
    : null;

  return {
    entryId: entry?.id ?? null,
    kassaEntryId: kassaEntry.id,
    balanceAfter: available - input.amount,
  };
}

/** Bitta kanalning harakatlar tarixi (eng yangisi birinchi). */
export async function getChannelLedger(db: Db, channelId: string, limit = 100) {
  return db.transitEntry.findMany({
    where: { channelId },
    select: {
      id: true,
      direction: true,
      amount: true,
      date: true,
      category: true,
      description: true,
      bankTransactionId: true,
      kassaEntryId: true,
      createdAt: true,
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
}

/** Umumiy tranzit qoldig'i — hali sarflanmay turgan pul. */
export async function getTotalTransitBalance(db: Db): Promise<number> {
  const sums = await db.transitEntry.groupBy({
    by: ["direction"],
    _sum: { amount: true },
  });
  const total = (dir: string) =>
    Number(sums.find((s) => s.direction === dir)?._sum.amount ?? 0);
  return total("in") - total("out");
}
