// lib/balance.ts
// Yagona balans manbai — barcha pul jadvallarini bitta "mavjud mablag'" ga bog'laydi.
//   Kirim  = to'langan shartnoma to'lovlari (Payment.paid) + kassa kirimlari (KassaEntry.income)
//   Chiqim = tasdiqlangan xarajatlar (Expense.approved) + kassa chiqimlari (KassaEntry.expense)
//            + REAL berilgan oyliklar/avanslar (Payout)
// PayrollAdjustment endi faqat MAJBURIYAT (qancha to'lash kerak) — kassadan pul
// faqat Payout yozilganda chiqadi. Soft-delete qilingan yozuvlar hisobga kirmaydi.
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
  const [paidPayments, kassaIncome, kassaExpense, approvedExpenses, payouts] =
    await Promise.all([
      prisma.payment.aggregate({
        where: { status: { in: ["paid", "partial"] }, deletedAt: null },
        _sum: { amount: true },
      }),
      prisma.kassaEntry.aggregate({
        where: { type: "income", deletedAt: null },
        _sum: { amount: true },
      }),
      prisma.kassaEntry.aggregate({
        where: { type: "expense", deletedAt: null },
        _sum: { amount: true },
      }),
      prisma.expense.aggregate({
        where: {
          status: "approved",
          deletedAt: null,
          ...(opts?.excludeExpenseId ? { id: { not: opts.excludeExpenseId } } : {}),
        },
        _sum: { amount: true },
      }),
      // Payout.amount har doim musbat (server yozuvda kafolatlaydi) — SUM xavfsiz.
      prisma.payout.aggregate({
        where: { deletedAt: null },
        _sum: { amount: true },
      }),
    ]);

  const incomePayments = n(paidPayments._sum.amount);
  const incomeKassa = n(kassaIncome._sum.amount);
  const outflowExpenses = n(approvedExpenses._sum.amount);
  const outflowKassa = n(kassaExpense._sum.amount);
  const outflowPayroll = n(payouts._sum.amount);

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

type MovementDb = Pick<typeof prisma, "payment" | "kassaEntry" | "expense" | "payout">;

interface MovementRange {
  /** Payment.period ("YYYY-MM" string) uchun filtr */
  paymentPeriod: { startsWith?: string; lt?: string } | string;
  /** Sana maydonlari (kassa.date, expense.date, payout.paidAt) uchun oraliq */
  from?: Date;
  to: Date;
}

/** Kirim/chiqim harakati — bitta umumiy so'rov to'plami (soft-delete filtrlangan). */
async function movementInRange(
  db: MovementDb,
  range: MovementRange
): Promise<{ income: number; outflow: number }> {
  const dateWhere = { ...(range.from ? { gte: range.from } : {}), lt: range.to };
  const periodWhere =
    typeof range.paymentPeriod === "string" ? range.paymentPeriod : range.paymentPeriod;
  const [payments, kassaIn, kassaOut, expenses, payouts] = await Promise.all([
    db.payment.aggregate({
      where: { status: { in: ["paid", "partial"] }, deletedAt: null, period: periodWhere },
      _sum: { amount: true },
    }),
    db.kassaEntry.aggregate({
      where: { type: "income", deletedAt: null, date: dateWhere },
      _sum: { amount: true },
    }),
    db.kassaEntry.aggregate({
      where: { type: "expense", deletedAt: null, date: dateWhere },
      _sum: { amount: true },
    }),
    db.expense.aggregate({
      where: { status: "approved", deletedAt: null, date: dateWhere },
      _sum: { amount: true },
    }),
    db.payout.aggregate({
      where: { deletedAt: null, paidAt: dateWhere },
      _sum: { amount: true },
    }),
  ]);
  return {
    income: n(payments._sum.amount) + n(kassaIn._sum.amount),
    outflow: n(expenses._sum.amount) + n(kassaOut._sum.amount) + n(payouts._sum.amount),
  };
}

/** Bitta oyning kirim/chiqim harakati (oy yopilishi uchun). db — tx bo'lishi mumkin. */
export async function getMonthMovement(
  year: number,
  month: number,
  db: MovementDb = prisma
): Promise<{ income: number; outflow: number }> {
  const key = `${year}-${String(month).padStart(2, "0")}`;
  return movementInRange(db, {
    paymentPeriod: key,
    from: new Date(year, month - 1, 1),
    to: new Date(year, month, 1),
  });
}

/** Oy boshigacha bo'lgan butun tarix harakati (birinchi oy yopilishida ochilish qoldig'i). */
export async function getMovementBeforeMonth(
  year: number,
  month: number,
  db: MovementDb = prisma
): Promise<{ income: number; outflow: number }> {
  const key = `${year}-${String(month).padStart(2, "0")}`;
  return movementInRange(db, {
    paymentPeriod: { lt: key },
    to: new Date(year, month - 1, 1),
  });
}

/**
 * Bir yil ichidagi kirim/chiqim harakati (snapshot/yil yopilishi uchun).
 * Payment davri "YYYY-MM" string — yil prefiksi bilan filtrlaymiz; qolganlari sana bo'yicha.
 */
export async function getYearMovement(year: number): Promise<{ income: number; outflow: number }> {
  const from = new Date(year, 0, 1);
  const to = new Date(year + 1, 0, 1);
  const [payments, kassaIn, kassaOut, expenses, payouts] = await Promise.all([
    prisma.payment.aggregate({
      where: { status: { in: ["paid", "partial"] }, deletedAt: null, period: { startsWith: `${year}-` } },
      _sum: { amount: true },
    }),
    prisma.kassaEntry.aggregate({
      where: { type: "income", deletedAt: null, date: { gte: from, lt: to } },
      _sum: { amount: true },
    }),
    prisma.kassaEntry.aggregate({
      where: { type: "expense", deletedAt: null, date: { gte: from, lt: to } },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: { status: "approved", deletedAt: null, date: { gte: from, lt: to } },
      _sum: { amount: true },
    }),
    prisma.payout.aggregate({
      where: { deletedAt: null, paidAt: { gte: from, lt: to } },
      _sum: { amount: true },
    }),
  ]);
  return {
    income: n(payments._sum.amount) + n(kassaIn._sum.amount),
    outflow: n(expenses._sum.amount) + n(kassaOut._sum.amount) + n(payouts._sum.amount),
  };
}

/** Yil boshigacha bo'lgan butun tarix harakati (birinchi snapshot uchun ochilish qoldig'i). */
export async function getMovementBefore(year: number): Promise<{ income: number; outflow: number }> {
  const to = new Date(year, 0, 1);
  const [payments, kassaIn, kassaOut, expenses, payouts] = await Promise.all([
    prisma.payment.aggregate({
      where: { status: { in: ["paid", "partial"] }, deletedAt: null, period: { lt: `${year}-01` } },
      _sum: { amount: true },
    }),
    prisma.kassaEntry.aggregate({
      where: { type: "income", deletedAt: null, date: { lt: to } },
      _sum: { amount: true },
    }),
    prisma.kassaEntry.aggregate({
      where: { type: "expense", deletedAt: null, date: { lt: to } },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: { status: "approved", deletedAt: null, date: { lt: to } },
      _sum: { amount: true },
    }),
    prisma.payout.aggregate({
      where: { deletedAt: null, paidAt: { lt: to } },
      _sum: { amount: true },
    }),
  ]);
  return {
    income: n(payments._sum.amount) + n(kassaIn._sum.amount),
    outflow: n(expenses._sum.amount) + n(kassaOut._sum.amount) + n(payouts._sum.amount),
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
