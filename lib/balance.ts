// lib/balance.ts
// Yagona balans manbai — barcha pul jadvallarini bitta "mavjud mablag'" ga bog'laydi.
//   Kirim  = to'langan shartnoma to'lovlari (Payment.paid) + kassa kirimlari (KassaEntry.income)
//   Chiqim = tasdiqlangan xarajatlar (Expense.approved) + kassa chiqimlari (KassaEntry.expense)
//            + tasdiqlangan oyliklar (PayrollAdjustment.payment|avans)
// Bu server-only modul (prisma ishlatadi) — faqat server komponent/actionlardan chaqiriladi.
import { prisma } from "@/lib/prisma";
import { isAdminRole, ROLE_LABELS, type UserRole } from "@/lib/permissions";
import type { BalanceBreakdown } from "@/types";

export type { BalanceBreakdown };

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/**
 * Butun tizim bo'yicha joriy mavjud mablag'ni hisoblaydi.
 * @param opts.excludeExpenseId — tahrir/qayta tasdiqda xarajat o'z summasini
 *   ikki marta sanamasligi uchun chiqim yig'indisidan chiqarib tashlanadi.
 */
export async function getAvailableBalance(opts?: {
  excludeExpenseId?: string;
}): Promise<BalanceBreakdown> {
  const [paidPayments, kassaIncome, kassaExpense, approvedExpenses, approvedPayroll] =
    await Promise.all([
      prisma.payment.aggregate({ where: { status: "paid" }, _sum: { amount: true } }),
      prisma.kassaEntry.aggregate({ where: { type: "income" }, _sum: { amount: true } }),
      prisma.kassaEntry.aggregate({ where: { type: "expense" }, _sum: { amount: true } }),
      prisma.expense.aggregate({
        where: {
          status: "approved",
          ...(opts?.excludeExpenseId ? { id: { not: opts.excludeExpenseId } } : {}),
        },
        _sum: { amount: true },
      }),
      prisma.payrollAdjustment.aggregate({
        where: { isApproved: true, adjustmentType: { in: ["payment", "avans"] } },
        _sum: { amount: true },
      }),
    ]);

  const incomePayments = n(paidPayments._sum.amount);
  const incomeKassa = n(kassaIncome._sum.amount);
  const outflowExpenses = n(approvedExpenses._sum.amount);
  const outflowKassa = n(kassaExpense._sum.amount);
  const outflowPayroll = n(approvedPayroll._sum.amount);

  const income = incomePayments + incomeKassa;
  const outflow = outflowExpenses + outflowKassa + outflowPayroll;

  return {
    income,
    outflow,
    balance: income - outflow,
    incomePayments,
    incomeKassa,
    outflowExpenses,
    outflowKassa,
    outflowPayroll,
  };
}

const som = (v: number) => Math.round(v).toLocaleString("ru-RU");

/**
 * Chiqim yoki oylik summasi mavjud balansdan oshib ketmasligini tekshiradi.
 * - Oddiy foydalanuvchi: balansdan oshsa xatolik (bloklanadi).
 * - Admin/Superadmin: o'tkaza oladi (minus balansga ruxsat), lekin audit logga yoziladi.
 */
export async function assertSufficientFunds(params: {
  amount: number;
  role: string;
  userId?: string;
  excludeExpenseId?: string;
  context: "expense" | "payroll";
}): Promise<void> {
  const { amount, role, userId, excludeExpenseId, context } = params;
  const { balance } = await getAvailableBalance({ excludeExpenseId });

  if (amount <= balance) return; // mablag' yetarli — ruxsat

  if (!isAdminRole(role)) {
    throw new Error(
      `Kassada yetarli mablag' yo'q. Mavjud balans: ${som(balance)} so'm, ` +
        `so'ralgan summa: ${som(amount)} so'm. ` +
        `Kirim yetarli bo'lmaguncha bu summani faqat Admin yoki Superadmin tasdiqlashi mumkin.`
    );
  }

  // Admin override — minus balansga ruxsat berildi, izi audit logga yoziladi
  await prisma.auditLog
    .create({
      data: {
        userId: userId ?? null,
        action: "update",
        tableName: context === "payroll" ? "PayrollAdjustment" : "Expense",
        newData: {
          reason: "negative_balance_override",
          context,
          availableBalance: Math.round(balance),
          requestedAmount: Math.round(amount),
          approvedByRole: ROLE_LABELS[role as UserRole] ?? role,
        },
      },
    })
    .catch(() => {});
}
