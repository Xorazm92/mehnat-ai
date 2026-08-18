"use server";

// =====================================================
// TRANZIT KASSA — server amallari
// =====================================================
//
// RUXSAT QOIDASI (2026-08-18 da o'zgardi).
//
// Ilgari bu fayldagi HAR BIR amal `isAdminRole` talab qilardi — talab shunday
// edi: "rasxod kassadan faqat admin qiladi". Endi kassani kundalik yurituvchi
// xodim ham bor, va u chiqim tomonini yozadi.
//
// MUHIM AJRATMA. Bu yerdagi amallar PUL CHIQARMAYDI — ular allaqachon sodir
// bo'lgan harakatni QAYD qiladi: bank pulni kartaga o'tkazib bo'lgan, karta
// bilan ijara to'langan. Ya'ni bu buxgalteriya yozuvi, ruxsat emas.
//
// Shu sababdan ikki daraja:
//   `requireKassa` — kundalik qayd (kanal ochish, o'tkazmani bog'lash,
//                    kartadan xarajat yozish). Moliya rollari.
//   `requireAdmin` — QAYTARIB BO'LMAYDIGAN amal: kanalni muzlatish. Faqat admin.

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole, isFinanceRole } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { serialize } from "@/lib/serialize";
import { recordAuditLog } from "@/lib/auditTrail";
import { assertPeriodOpen } from "@/lib/periodLock";
import { serializable } from "@/lib/tx";
import { periodOf } from "@/lib/bank/importStatement";
import { extractCardTransfer } from "@/lib/bank/classifyExpense";
import {
  getChannelBalances,
  getChannelLedger,
  getTotalTransitBalance,
  recordTransitIn,
  recordTransitOut,
  InsufficientTransitFunds,
  CHANNEL_TYPES,
  type ChannelType,
} from "@/lib/transit";

/** Kundalik kassa qaydi — moliya rollari (admin, superadmin, bosh buxgalter, bank-klient). */
async function requireKassa() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const role = session.user.role as string;
  if (!isFinanceRole(role)) throw new Error("Forbidden");
  return { userId: session.user.id, role };
}

/** Qaytarib bo'lmaydigan amal (kanalni muzlatish) — faqat admin. */
async function requireAdmin() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const role = session.user.role as string;
  if (!isAdminRole(role)) throw new Error("Forbidden");
  return { userId: session.user.id, role };
}

/** Kutilgan xatolar otilmaydi — prod'da matn brauzerga yetmaydi. */
export type Outcome<T> = { ok: true; data: T } | { ok: false; error: string };

// ─────────────────────────────────────────────────────────
// O'QISH
// ─────────────────────────────────────────────────────────

export async function getTransitOverview() {
  await requireKassa();
  const [channels, totalBalance, unlinkedCount] = await Promise.all([
    getChannelBalances(prisma, { includeInactive: true }),
    getTotalTransitBalance(prisma),
    prisma.bankTransaction.count({
      where: { direction: "expense", expenseCategory: "xodim_kartasi", status: "unmatched" },
    }),
  ]);
  return serialize({ channels, totalBalance, unlinkedCount });
}

export async function getTransitLedger(channelId: string) {
  await requireKassa();
  return serialize(await getChannelLedger(prisma, channelId));
}

/**
 * Kanalga hali bog'lanmagan karta o'tkazmalari.
 * Vipiskadan `xodim_kartasi` deb tanilgan, lekin qaysi kartaga tushgani
 * tasdiqlanmagan tranzaksiyalar.
 */
export async function getUnlinkedCardTransfers(limit = 100) {
  await requireKassa();
  const rows = await prisma.bankTransaction.findMany({
    where: { direction: "expense", expenseCategory: "xodim_kartasi", status: "unmatched" },
    select: {
      id: true,
      valueDate: true,
      amount: true,
      purpose: true,
      account: { select: { label: true } },
    },
    orderBy: [{ valueDate: "desc" }, { amount: "desc" }],
    take: limit,
  });

  // Karta niqobi va egasining ismi to'lov maqsadidan ajratiladi — admin
  // qaysi kartaga tegishli ekanini qidirmasin.
  return serialize(
    rows.map((r) => {
      const card = extractCardTransfer(r.purpose);
      return {
        id: r.id,
        valueDate: r.valueDate,
        amount: r.amount,
        accountLabel: r.account.label,
        cardMask: card?.cardMask ?? null,
        holderName: card?.holderName ?? null,
      };
    })
  );
}

// ─────────────────────────────────────────────────────────
// KANALLARNI BOSHQARISH
// ─────────────────────────────────────────────────────────

/**
 * Kundalik xo'jalik xarajatlari (ovqat, taksi, non…) — oy bo'yicha yig'ma.
 *
 * Bular `KassaEntry(category='ovqat_xojalik')` da; 15 oylik tarix Excel'dan
 * import qilingan. Chiqim kassasida ko'rinishi kerak, aks holda 32 mln
 * xarajat faqat bazada qolib ketardi.
 */
export async function getHouseholdExpenses(months = 12) {
  await requireKassa();
  const rows = await prisma.kassaEntry.findMany({
    where: { type: "expense", category: "ovqat_xojalik", deletedAt: null },
    select: { amount: true, date: true },
    orderBy: { date: "desc" },
  });

  const byMonth = new Map<string, { total: number; count: number }>();
  for (const r of rows) {
    const key = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, "0")}`;
    const cur = byMonth.get(key) ?? { total: 0, count: 0 };
    cur.total += Number(r.amount);
    cur.count += 1;
    byMonth.set(key, cur);
  }

  const periods = [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, months)
    .map(([period, v]) => ({ period, ...v }));

  return serialize({
    periods,
    total: rows.reduce((sum, r) => sum + Number(r.amount), 0),
    count: rows.length,
  });
}

export async function upsertChannel(input: {
  id?: string;
  type: ChannelType;
  label: string;
  employeeId?: string | null;
  cardMask?: string | null;
  notes?: string | null;
  isActive?: boolean;
}): Promise<Outcome<{ id: string }>> {
  const { userId } = await requireKassa();

  if (!CHANNEL_TYPES.includes(input.type)) return { ok: false, error: "Kanal turi noto'g'ri" };
  const label = input.label.trim();
  if (!label) return { ok: false, error: "Nom kiritilishi kerak" };

  // To'liq karta raqami hech qachon saqlanmaydi — faqat niqob.
  const mask = input.cardMask?.trim() || null;
  if (mask && /^\d{16}$/.test(mask.replace(/\s/g, ""))) {
    return {
      ok: false,
      error: "To'liq karta raqami saqlanmaydi. Niqob kiriting: 8600****4957",
    };
  }

  try {
    const row = input.id
      ? await prisma.disbursementChannel.update({
          where: { id: input.id },
          data: {
            type: input.type,
            label,
            employeeId: input.employeeId ?? null,
            cardMask: mask,
            notes: input.notes ?? null,
            ...(input.isActive != null ? { isActive: input.isActive } : {}),
          },
          select: { id: true },
        })
      : await prisma.disbursementChannel.create({
          data: {
            type: input.type,
            label,
            employeeId: input.employeeId ?? null,
            cardMask: mask,
            notes: input.notes ?? null,
          },
          select: { id: true },
        });

    await recordAuditLog({
      userId,
      action: input.id ? "update" : "create",
      tableName: "DisbursementChannel",
      recordId: row.id,
      newData: { type: input.type, label, cardMask: mask, isActive: input.isActive ?? true },
    });

    revalidatePath("/kassa/chiqim");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("Unique constraint")) {
      return { ok: false, error: "Bu karta allaqachon ro'yxatga olingan" };
    }
    return { ok: false, error: msg };
  }
}

/**
 * Kanalni muzlatish/qayta yoqish.
 *
 * O'CHIRILMAYDI: xodim ishdan ketsa ham uning kartasidan o'tgan pul tarixi
 * qolishi kerak (foydalanuvchi: "xodimlar ro'yxati o'zgarish mumkin").
 */
export async function setChannelActive(id: string, isActive: boolean): Promise<Outcome<null>> {
  const { userId } = await requireAdmin();

  if (!isActive) {
    const [balance] = (await getChannelBalances(prisma, { includeInactive: true })).filter(
      (c) => c.id === id
    );
    if (balance && Math.abs(balance.balance) > 0.5) {
      return {
        ok: false,
        error:
          `Kartada ${Math.round(balance.balance).toLocaleString("en-US")} so'm qoldiq bor. ` +
          `Avval qoldiqni sarflang yoki tuzatish yozuvi kiriting, keyin muzlating.`,
      };
    }
  }

  await prisma.disbursementChannel.update({ where: { id }, data: { isActive } });
  await recordAuditLog({
    userId,
    action: "update",
    tableName: "DisbursementChannel",
    recordId: id,
    newData: { isActive },
  });
  revalidatePath("/kassa/chiqim");
  return { ok: true, data: null };
}

/**
 * Vipiskadan tanilgan karta o'tkazmalari uchun kanallarni AVTOMATIK yaratadi.
 * Har bir yangi karta uchun bitta kanal; mavjudi qayta yaratilmaydi.
 */
export async function autoCreateChannelsFromStatements(): Promise<
  Outcome<{ created: number; existing: number; withoutCard: number }>
> {
  const { userId } = await requireKassa();

  const transfers = await prisma.bankTransaction.findMany({
    where: { direction: "expense", expenseCategory: "xodim_kartasi" },
    select: { purpose: true },
  });

  const cards = new Map<string, string | null>();
  let withoutCard = 0;
  for (const t of transfers) {
    const card = extractCardTransfer(t.purpose);
    if (!card) {
      withoutCard++;
      continue;
    }
    if (!cards.has(card.cardMask)) cards.set(card.cardMask, card.holderName);
  }

  let created = 0;
  let existing = 0;
  for (const [cardMask, holderName] of cards) {
    const found = await prisma.disbursementChannel.findFirst({
      where: { type: "employee_card", cardMask },
      select: { id: true },
    });
    if (found) {
      existing++;
      continue;
    }
    await prisma.disbursementChannel.create({
      data: {
        type: "employee_card",
        label: holderName ?? `Karta ${cardMask}`,
        cardMask,
        notes: "Vipiskadan avtomatik aniqlangan",
      },
    });
    created++;
  }

  await recordAuditLog({
    userId,
    action: "create",
    tableName: "DisbursementChannel",
    newData: { auto: true, created, existing, withoutCard },
  });

  revalidatePath("/kassa/chiqim");
  return { ok: true, data: { created, existing, withoutCard } };
}

// ─────────────────────────────────────────────────────────
// PUL OQIMI
// ─────────────────────────────────────────────────────────

/** 1-qadam: bankdan kartaga tushgan pulni kanalga bog'laydi. */
export async function linkCardTransfer(input: {
  transactionId: string;
  channelId: string;
}): Promise<Outcome<{ alreadyLinked: boolean }>> {
  const { userId } = await requireKassa();

  const tx = await prisma.bankTransaction.findUnique({
    where: { id: input.transactionId },
    select: { id: true, direction: true, amount: true, valueDate: true, purpose: true },
  });
  if (!tx) return { ok: false, error: "Tranzaksiya topilmadi" };
  if (tx.direction !== "expense") return { ok: false, error: "Bu chiqim tranzaksiyasi emas" };

  try {
    // Davr tekshiruvi ham yozuv ham bitta tranzaksiyada: `recordTransitIn`
    // ikkita jadvalga yozadi (TransitEntry + BankTransaction.status), ular
    // yarim holatda qolmasin.
    const res = await serializable(async (db) => {
      await assertPeriodOpen(db, periodOf(tx.valueDate), "karta o'tkazmasi");
      return recordTransitIn(db, {
        channelId: input.channelId,
        bankTransactionId: tx.id,
        amount: Number(tx.amount),
        date: tx.valueDate,
        description: tx.purpose?.slice(0, 300) ?? null,
        createdBy: userId,
      });
    });
    revalidatePath("/kassa/chiqim");
    return { ok: true, data: { alreadyLinked: res.alreadyLinked } };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** 2-qadam: kartadan qilingan xarajatni yozadi (haqiqiy xarajat shu). */
export async function spendFromChannel(input: {
  channelId: string;
  amount: number;
  date: string;
  category: string;
  description?: string;
  companyId?: string | null;
  allowOverdraft?: boolean;
}): Promise<Outcome<{ balanceAfter: number }>> {
  const { userId, role } = await requireKassa();

  const date = new Date(input.date);
  if (Number.isNaN(date.getTime())) return { ok: false, error: "Sana noto'g'ri" };
  if (!input.category?.trim()) return { ok: false, error: "Toifa tanlanishi kerak" };

  try {
    // SERIALIZABLE SHART. `recordTransitOut` avval kanal qoldig'ini O'QIYDI,
    // keyin YOZADI — tranzaksiyasiz ikki parallel chiqim bir xil qoldiqni
    // ko'radi va ikkalasi ham overdraft qo'riqchisidan o'tib ketadi. Bu aynan
    // `lib/tx.ts` da tasvirlangan TOCTOU poygasi; loyihaning boshqa hamma pul
    // yo'li allaqachon yopgan, bu bittasi qolib ketgan edi.
    const res = await serializable(async (db) =>
      // Davr qulfi endi darvoza ichida (`lib/cashGate.ts` commit) — tranzaksiya
      // ICHIDA, chunki `assertPeriodOpen` READY_TO_CLOSE → OPEN yozuvini ham
      // qiladi va amal yiqilsa u qaytishi kerak.
      recordTransitOut(db, { kind: "user", userId: userId as string, role }, {
        channelId: input.channelId,
        amount: Number(input.amount),
        date,
        category: input.category.trim(),
        description: input.description?.trim() || null,
        companyId: input.companyId ?? null,
        allowOverdraft: input.allowOverdraft,
      })
    );

    await recordAuditLog({
      userId,
      action: "create",
      tableName: "TransitEntry",
      recordId: res.entryId,
      newData: { channelId: input.channelId, amount: input.amount, category: input.category },
    });

    revalidatePath("/kassa/chiqim");
    revalidatePath("/expenses");
    return { ok: true, data: { balanceAfter: res.balanceAfter } };
  } catch (e) {
    if (e instanceof InsufficientTransitFunds) return { ok: false, error: e.message };
    return { ok: false, error: (e as Error).message };
  }
}
