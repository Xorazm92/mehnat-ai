"use server";

// =====================================================
// PAYOUT — real pul berish (majburiyatdan ajratilgan)
// =====================================================
// PayrollAdjustment "qancha to'lash kerak"ni aytadi (majburiyat qatlami);
// bu modul "qancha haqiqatan berildi"ni yozadi. Balans/cashflow faqat shu
// yerdagi yozuvlarni chiqim deb sanaydi.
//
// Invariantlar:
//   - Payout.amount har doim musbat;
//   - (xodim, oy) bo'yicha jami payout tasdiqlangan majburiyatdan oshmaydi —
//     qisman to'lash mumkin, ikki marta/ortiqcha to'lash Serializable
//     tranzaksiyada bloklanadi. Majburiyat formulasi `lib/payrollObligation.ts`
//     da (avans MAJBURIYAT emas, TO'LOV — u yerdagi izohga qarang);
//   - yopiq davrga payout yozilmaydi/o'chirilmaydi;
//   - har payout double-entry ledger (SALARY_EXPENSE / CASH) bilan atomar;
//   - o'chirish faqat soft delete + ledger reversal;
//   - MANBA MAJBURIY: har payout qaysi kassadan (`channelId`) chiqqanini
//     yozadi va jurnal CASH oyog'i shu kanal bilan tushadi. Aks holda pul
//     umumiy balansdan yo'qolardi, lekin kassalar jadvalida qaysi hisob
//     kamayganini ko'rsatib bo'lmasdi ("Kanali ko'rsatilmagan" qatori).
//     Xodim tomoni esa SALARY_EXPENSE oyog'ining `subjectId` sida —
//     shu ikkisi birga "qaysi manbadan qaysi xodimga" ni jurnalning o'zidan
//     javob beradigan qiladi.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/platform/permissions";
import { staffScopeFilter } from "@/lib/platform/access";
import { assertSufficientFunds } from "@/lib/balance";
import { serializable } from "@/lib/tx";
import { assertPeriodOpen } from "@/lib/periodLock";
import { ACCOUNTS, postLedger, reverseLedger } from "@/lib/ledger";
import { recordAuditLog } from "@/lib/platform/auditTrail";
import { computeObligation, computeRemaining } from "@/lib/payrollObligation";
import { serialize } from "@/lib/serialize";
import { assertFundingSource } from "@/server/fundingSources";
import {
  CHANNEL_TYPE_LABELS,
  PAYOUT_METHOD_BY_CHANNEL,
  normalizeChannelType,
} from "@/lib/transitChannels";
import { requireKassa } from "@/server/guards";

const PAYMENT_METHODS = ["naqd", "plastik", "schyot", "terminal", "boshqa"];

// Pul berishga ruxsat: kassa egalari (admin, superadmin, bosh buxgalter).
const canDisburse = (role: string) =>
  ["super_admin", "admin", "chief_accountant"].includes(role);

/**
 * (xodim, oy) bo'yicha tasdiqlangan majburiyat va berilgan pul yig'indisi.
 *
 * TURLAR BO'YICHA FILTR YO'Q — `computeObligation` har bir turga o'z og'irligini
 * beradi (`payment` +, `bonus` +, `jarima` −, `avans` 0). Ilgari bu yerda
 * `adjustmentType: { in: ["payment", "avans"] }` turardi va ikkita nuqson
 * bergan edi: avans majburiyatga qo'shilib hech qachon ayirilmasdi, qo'lda
 * bonus esa umuman to'lanmasdi.
 */
async function obligationAndPaid(db: Prisma.TransactionClient, employeeId: string, month: string) {
  const monthKeys = [month, `${month}-01`]; // PayrollAdjustment.month ikkala formatda uchraydi
  const [adjustments, payouts] = await Promise.all([
    db.payrollAdjustment.findMany({
      where: { employeeId, month: { in: monthKeys }, deletedAt: null },
      select: { adjustmentType: true, amount: true, isApproved: true },
    }),
    db.payout.aggregate({
      where: { employeeId, month, deletedAt: null },
      _sum: { amount: true },
    }),
  ]);
  // Avans tasdiqlanganda Payout yozilgan (server/payroll.ts) — ya'ni u shu
  // yerdagi `paid` ichida, `obligation` da emas.
  const obligation = computeObligation(adjustments);
  const paid = Number(payouts._sum.amount ?? 0);
  return { obligation, paid };
}

/** Kassa reyestrining bitta qatori (`getPayoutRegister`). */
export interface PayoutRegisterRow {
  id: string;
  paidAt: string;
  month: string;
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  channelId: string | null;
  channelLabel: string | null;
  channelTypeLabel: string | null;
  amount: number;
  paymentMethod: string;
  /** Avans tuzatmasidan kelib chiqqan to'lov — oddiy oylikdan ajratiladi. */
  isAvans: boolean;
  note: string | null;
}

export interface PayoutRegister {
  rows: PayoutRegisterRow[];
  total: number;
  /** Manbasi ko'rsatilmagan (eski) to'lovlar — nolga intilishi kerak. */
  unassignedCount: number;
  unassignedTotal: number;
}

/**
 * KASSA REYESTRI — "shu oralig'da qaysi manbadan qaysi xodimga qancha berildi".
 *
 * NEGA ALOHIDA O'QUVCHI. `getPayouts` xodim kesimidagi ekran (`/payroll`)
 * uchun: u portfel bo'yicha cheklanadi va oy bo'yicha filtrlanadi. Kassa
 * ekranida esa savol boshqa — pul KASSADAN chiqdi, ya'ni hamma to'lov
 * ko'rinishi va manba ustuni bo'lishi kerak. Shuning uchun darvoza ham
 * boshqa: `requireKassa` (moliya rollari), portfel filtri yo'q.
 *
 * Oylik BALANSDA allaqachon chiqim edi (`lib/balance.ts` `outflowPayroll`),
 * lekin chiqim EKRANLARIDA ko'rinmasdi — foydalanuvchi "kassadan pul
 * kamaydi, xarajatlar ro'yxatida esa yo'q" holatini ko'rardi. Bu funksiya
 * shu bo'shliqni yopadi. `KassaEntry` YARATILMAYDI: oylikni kassa chiqimi
 * qilib ham yozish bitta to'lovni ikki marta sanardi.
 */
export async function getPayoutRegister(filters?: {
  /** "YYYY-MM" — berilmasa oxirgi to'lovlar (limit bo'yicha). */
  month?: string;
  limit?: number;
}): Promise<PayoutRegister> {
  await requireKassa();
  const limit = Math.min(Math.max(filters?.limit ?? 500, 1), 2000);

  const payouts = await prisma.payout.findMany({
    where: {
      deletedAt: null,
      ...(filters?.month ? { month: filters.month } : {}),
    },
    select: {
      id: true, month: true, amount: true, paidAt: true, note: true,
      paymentMethod: true, channelId: true, employeeId: true,
      employee: { select: { fullName: true, role: true } },
      adjustment: { select: { adjustmentType: true } },
    },
    orderBy: { paidAt: "desc" },
    take: limit,
  });

  // Kanal nomi alohida o'qiladi — `channelId` FK emas (o'chirilgan kanalli
  // tarixiy to'lov yo'qolmasin degan qoida, `KassaEntry.channelId` bilan bir xil).
  const channels = await prisma.disbursementChannel.findMany({
    select: { id: true, label: true, type: true },
  });
  const channelById = new Map(channels.map((c) => [c.id, c]));

  const rows: PayoutRegisterRow[] = payouts.map((p) => {
    const ch = p.channelId ? channelById.get(p.channelId) : undefined;
    const kind = ch ? normalizeChannelType(ch.type) : null;
    return {
      id: p.id,
      paidAt: p.paidAt.toISOString(),
      month: p.month,
      employeeId: p.employeeId,
      employeeName: p.employee.fullName,
      employeeRole: p.employee.role,
      channelId: p.channelId,
      channelLabel: p.channelId ? (ch?.label ?? "O'chirilgan kassa") : null,
      channelTypeLabel: kind ? CHANNEL_TYPE_LABELS[kind] : null,
      amount: Number(p.amount),
      paymentMethod: p.paymentMethod,
      isAvans: p.adjustment?.adjustmentType === "avans",
      note: p.note,
    };
  });

  const unassigned = rows.filter((r) => !r.channelId);
  return serialize({
    rows,
    total: rows.reduce((s, r) => s + r.amount, 0),
    unassignedCount: unassigned.length,
    unassignedTotal: unassigned.reduce((s, r) => s + r.amount, 0),
  });
}

export async function getPayouts(filters?: { month?: string; employeeId?: string }) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  // Oddiy xodim faqat o'z payoutlarini, senior — portfelidagi xodimlarnikini.
  const employeeId = await staffScopeFilter(
    prisma,
    { id: session.user.id as string, role },
    filters?.employeeId,
  );

  return serialize(
    await prisma.payout.findMany({
      where: {
        deletedAt: null,
        ...(filters?.month ? { month: filters.month } : {}),
        ...(employeeId ? { employeeId } : {}),
      },
      include: {
        employee: { select: { id: true, fullName: true, role: true } },
        // UI avans-payoutni (avans tuzatmasi allaqachon hisoblagan) alohida ajrata olishi uchun.
        adjustment: { select: { adjustmentType: true } },
      },
      orderBy: { paidAt: "desc" },
    })
  );
}

export async function createPayout(data: {
  employeeId: string;
  month: string; // "YYYY-MM" yoki "YYYY-MM-DD"
  amount: number;
  /** Pul QAYSI kassadan chiqadi — majburiy (`DisbursementChannel.id`). */
  channelId: string;
  paymentMethod?: string;
  note?: string;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!canDisburse(role)) throw new Error("Pul berishga ruxsat yo'q");

  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(data.month)) {
    throw new Error("Oy formati noto'g'ri (YYYY-MM kutiladi)");
  }
  const month = data.month.slice(0, 7);
  if (!Number.isFinite(data.amount) || data.amount <= 0) {
    throw new Error("To'lov summasi musbat son bo'lishi kerak");
  }
  // MANBA. Server tomonda TALAB QILINADI — forma majburiy qilgani yetarli
  // emas: bitta so'rov bilan manbasiz to'lov yozilsa, pul balansdan chiqib
  // ketardi-yu, qaysi kassa kamayganini aytib bo'lmasdi.
  const channelId = data.channelId?.trim();
  if (!channelId) {
    throw new Error("Pul manbaini tanlang — oylik qaysi kassadan berilmoqda");
  }
  await assertFundingSource(channelId);
  const channel = await prisma.disbursementChannel.findUnique({
    where: { id: channelId },
    select: { type: true, label: true },
  });
  const channelKind = channel ? normalizeChannelType(channel.type) : null;

  const paymentMethod = data.paymentMethod ?? (channelKind ? PAYOUT_METHOD_BY_CHANNEL[channelKind] : "naqd");
  if (!PAYMENT_METHODS.includes(paymentMethod)) throw new Error("To'lov usuli noto'g'ri");

  await assertPeriodOpen(prisma, month, "payout");

  const employee = await prisma.user.findUnique({
    where: { id: data.employeeId },
    select: { id: true, fullName: true },
  });
  if (!employee) throw new Error("Xodim topilmadi");

  const userId = session.user.id as string;

  // Balans + majburiyat tekshiruvi + yozuv + ledger — hammasi bitta
  // Serializable tranzaksiyada: parallel ikki "To'lash" bosishi na majburiyatdan,
  // na kassa balansidan oshib keta oladi.
  const payout = await serializable(
    async (tx) => {
      // Kassadan pul chiqadi — balans yetarliligi (admin override audit bilan).
      await assertSufficientFunds({ amount: data.amount, role, userId, context: "payroll", db: tx });

      const { obligation, paid } = await obligationAndPaid(tx, data.employeeId, month);
      if (obligation <= 0) {
        // Faqat avans tasdiqlangan holat ham shu yerga tushadi — va tushishi
        // KERAK: avansning o'z Payout'i allaqachon yozilgan, oylik esa hali
        // tasdiqlanmagan, ya'ni to'lanadigan qoldiq yo'q.
        throw new Error(
          `${month} oyi uchun tasdiqlangan oylik majburiyati yo'q — avval oylik tasdiqlansin`
        );
      }
      const remaining = computeRemaining(obligation, paid);
      if (data.amount > remaining) {
        throw new Error(
          `Ortiqcha to'lov bloklandi: ${month} uchun qolgan majburiyat ` +
            `${Math.round(remaining).toLocaleString("ru-RU")} so'm, so'ralgan ` +
            `${Math.round(data.amount).toLocaleString("ru-RU")} so'm`
        );
      }

      // Majburiyat havolasi — shu oyning tasdiqlangan 'payment' qatori (bo'lsa).
      const obligationRow = await tx.payrollAdjustment.findFirst({
        where: {
          employeeId: data.employeeId,
          month: { in: [month, `${month}-01`] },
          adjustmentType: "payment",
          isApproved: true,
          deletedAt: null,
        },
        select: { id: true },
      });

      const created = await tx.payout.create({
        data: {
          employeeId: data.employeeId,
          adjustmentId: obligationRow?.id ?? null,
          month,
          amount: new Prisma.Decimal(data.amount),
          paymentMethod,
          channelId,
          note: data.note?.trim() || null,
          createdBy: userId,
        },
      });

      // Ikki o'lchov birga yoziladi: CASH oyog'ida MANBA (`channelId`),
      // SALARY_EXPENSE oyog'ida XODIM (`subjectId`, ACCOUNT_SPEC
      // "user_optional"). Shundan keyin kassalar jadvali ham
      // (`getCashDeskReport`), xodim kesimi ham to'g'ridan-to'g'ri jurnaldan
      // o'qiladi — ikkinchi hisob-kitob qatlami kerak emas.
      await postLedger(tx, {
        legs: [
          { accountId: ACCOUNTS.SALARY_EXPENSE, debit: data.amount, subjectId: data.employeeId },
          { accountId: ACCOUNTS.CASH, credit: data.amount, channelId },
        ],
        period: month,
        sourceTable: "Payout",
        sourceId: created.id,
        createdBy: userId,
        description: `Oylik to'lovi: ${employee.fullName} (${month})`
          + (channel ? ` — ${channel.label}` : ""),
      });

      return created;
  });

  await recordAuditLog({
    userId,
    action: "create",
    tableName: "Payout",
    recordId: payout.id,
    newData: {
      employeeId: data.employeeId,
      month,
      amount: data.amount,
      paymentMethod,
      channelId,
      note: data.note ?? null,
    },
  });

  return serialize(payout);
}

export async function softDeletePayout(id: string, reason: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isAdminRole(role)) throw new Error("Forbidden");
  if (!reason?.trim()) throw new Error("O'chirish sababi kiritilishi shart");

  const existing = await prisma.payout.findUnique({ where: { id } });
  if (!existing) throw new Error("To'lov topilmadi");
  if (existing.deletedAt) throw new Error("To'lov allaqachon o'chirilgan");

  await assertPeriodOpen(prisma, existing.month, "payout");

  const userId = session.user.id as string;

  const deleted = await prisma.$transaction(async (tx) => {
    const row = await tx.payout.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId, deleteReason: reason.trim() },
    });
    await reverseLedger(tx, {
      sourceTable: "Payout",
      sourceId: id,
      createdBy: userId,
      reason: reason.trim(),
    });
    return row;
  });

  await recordAuditLog({
    userId,
    action: "delete",
    tableName: "Payout",
    recordId: id,
    oldData: {
      employeeId: existing.employeeId,
      month: existing.month,
      amount: Number(existing.amount),
      paymentMethod: existing.paymentMethod,
      channelId: existing.channelId,
      paidAt: existing.paidAt.toISOString(),
    },
    newData: { deleteReason: reason.trim() },
  });

  return serialize(deleted);
}
