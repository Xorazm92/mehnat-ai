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
//   - o'chirish faqat soft delete + ledger reversal.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import { staffScopeFilter } from "@/lib/access";
import { assertSufficientFunds } from "@/lib/balance";
import { serializable } from "@/lib/tx";
import { assertPeriodOpen } from "@/lib/periodLock";
import { ACCOUNTS, postLedger, reverseLedger } from "@/lib/ledger";
import { recordAuditLog } from "@/lib/auditTrail";
import { computeObligation, computeRemaining } from "@/lib/payrollObligation";
import { serialize } from "@/lib/serialize";

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
  const paymentMethod = data.paymentMethod ?? "naqd";
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
          note: data.note?.trim() || null,
          createdBy: userId,
        },
      });

      await postLedger(tx, {
        legs: [
          { accountId: ACCOUNTS.SALARY_EXPENSE, debit: data.amount },
          { accountId: ACCOUNTS.CASH, credit: data.amount },
        ],
        period: month,
        sourceTable: "Payout",
        sourceId: created.id,
        createdBy: userId,
        description: `Oylik to'lovi: ${employee.fullName} (${month})`,
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
      paidAt: existing.paidAt.toISOString(),
    },
    newData: { deleteReason: reason.trim() },
  });

  return serialize(deleted);
}
