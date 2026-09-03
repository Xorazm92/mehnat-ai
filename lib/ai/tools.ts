/**
 * AI read tools — bu funksiyalar Gemini ga tool sifatida beriladi.
 * Har biri Server Action ichida ishlaydi, auth tekshiradi.
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { staffScopeFilter } from "@/lib/platform/access";

export interface CompanyBalanceResult {
  companyId: string;
  companyName: string;
  balance: number; // net, so'm
  asOf: string;
}

export async function getCompanyBalance(
  companyId: string,
  asOf?: string
): Promise<CompanyBalanceResult | { error: string }> {
  const session = await auth();
  if (!session) return { error: "Avtorizatsiya kerak" };

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });
  if (!company) return { error: "Firma topilmadi" };

  const asOfDate = asOf ? new Date(asOf) : new Date();

  const [kassa, payments, payouts] = await Promise.all([
    prisma.kassaEntry.aggregate({
      where: {
        companyId,
        deletedAt: null,
        status: "approved",
        date: { lte: asOfDate },
      },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: {
        companyId,
        deletedAt: null,
        status: { in: ["paid", "partial"] },
        paymentDate: { lte: asOfDate },
      },
      _sum: { amount: true },
    }),
    prisma.payout.aggregate({
      where: {
        companyId,
        deletedAt: null,
        paidAt: { lte: asOfDate },
      },
      _sum: { amount: true },
    }),
  ]);

  const income = Number(kassa._sum.amount ?? 0);
  const paymentsTotal = Number(payments._sum.amount ?? 0);
  const payoutsTotal = Number(payouts._sum.amount ?? 0);
  const balance = income - payoutsTotal + paymentsTotal;

  return {
    companyId,
    companyName: company.name,
    balance,
    asOf: asOfDate.toISOString().slice(0, 10),
  };
}

export interface OverdueResult {
  companyId: string;
  companyName: string;
  overdueAmount: number;
  overdueCount: number;
  oldestDue: string | null;
}

export async function getCompanyOverdue(
  companyId: string
): Promise<OverdueResult | { error: string }> {
  const session = await auth();
  if (!session) return { error: "Avtorizatsiya kerak" };

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });
  if (!company) return { error: "Firma topilmadi" };

  const overdue = await prisma.payment.findMany({
    where: {
      companyId,
      deletedAt: null,
      status: "overdue",
    },
    select: { amount: true, paymentDate: true },
    orderBy: { paymentDate: "asc" },
  });

  const overdueAmount = overdue.reduce((s, p) => s + Number(p.amount), 0);

  return {
    companyId,
    companyName: company.name,
    overdueAmount,
    overdueCount: overdue.length,
    oldestDue: overdue[0]?.paymentDate?.toISOString().slice(0, 10) ?? null,
  };
}

export interface RecentPaymentResult {
  companyId: string;
  companyName: string;
  payments: Array<{
    amount: number;
    date: string;
    method: string;
  }>;
}

export async function getRecentPayments(
  companyId: string,
  days: number = 30
): Promise<RecentPaymentResult | { error: string }> {
  const session = await auth();
  if (!session) return { error: "Avtorizatsiya kerak" };

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });
  if (!company) return { error: "Firma topilmadi" };

  const since = new Date();
  since.setDate(since.getDate() - days);

  const payments = await prisma.payment.findMany({
    where: {
      companyId,
      deletedAt: null,
      status: { in: ["paid", "partial"] },
      paymentDate: { gte: since },
    },
    select: { amount: true, paymentDate: true, paymentMethod: true },
    orderBy: { paymentDate: "desc" },
    take: 20,
  });

  return {
    companyId,
    companyName: company.name,
    payments: payments.map((p) => ({
      amount: Number(p.amount),
      date: p.paymentDate?.toISOString().slice(0, 10) ?? "",
      method: p.paymentMethod,
    })),
  };
}

export interface KpiTrendResult {
  userId: string;
  userName: string;
  months: Array<{
    month: string;
    /** Avtomatik hodisalar sof SANOG'I (dona) — foiz emas. */
    score: number;
    bonus: number;
    penalty: number;
    /** Qo'lda kiritilgan tuzatishlar yig'indisi — FOIZDA, alohida birlik. */
    manualPercent: number;
  }>;
}

export async function getKpiTrend(
  userId: string,
  months: number = 3
): Promise<KpiTrendResult | { error: string }> {
  const session = await auth();
  if (!session) return { error: "Avtorizatsiya kerak" };

  // Begona xodimning KPI tarixini o'qish — portfelga cheklangan.
  await staffScopeFilter(prisma, { id: session.user.id as string, role: session.user.role as string }, userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true },
  });
  if (!user) return { error: "Xodim topilmadi" };

  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceMonth = since.toISOString().slice(0, 7);

  const events = await prisma.kpiEvent.findMany({
    where: {
      employeeId: userId,
      periodMonth: { gte: sinceMonth },
    },
    select: { periodMonth: true, points: true, type: true },
    orderBy: { periodMonth: "desc" },
  });

  // Group by month.
  //
  // BIRLIKLAR ARALASHMAYDI: avtomatik hodisada `points` — sanoq (+1/−1), qo'lda
  // tuzatishda esa foiz. Ilgari ikkalasi bitta `score` ga qo'shilardi.
  const monthMap = new Map<string, { bonus: number; penalty: number; manualPercent: number }>();
  for (const e of events) {
    const existing = monthMap.get(e.periodMonth) ?? { bonus: 0, penalty: 0, manualPercent: 0 };
    const pts = Number(e.points);
    if (e.type === "manual") existing.manualPercent += pts;
    else if (pts >= 0) existing.bonus += pts;
    else existing.penalty += Math.abs(pts);
    monthMap.set(e.periodMonth, existing);
  }

  const monthList = [...monthMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, months);

  return {
    userId,
    userName: user.fullName,
    months: monthList.map(([month, data]) => ({
      month,
      score: Math.round((data.bonus - data.penalty) * 100) / 100,
      bonus: data.bonus,
      penalty: data.penalty,
      manualPercent: Math.round(data.manualPercent * 100) / 100,
    })),
  };
}

export interface ObligationStatusResult {
  companyId: string;
  companyName: string;
  overdue: number;
  dueSoon: number; // 3 kun ichida
  upcoming: number;
}

export async function getObligationStatus(
  companyId: string
): Promise<ObligationStatusResult | { error: string }> {
  const session = await auth();
  if (!session) return { error: "Avtorizatsiya kerak" };

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });
  if (!company) return { error: "Firma topilmadi" };

  const now = new Date();
  const in3days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const [overdue, dueSoon, upcoming] = await Promise.all([
    prisma.obligation.count({
      where: {
        companyId,
        dueAt: { lt: now },
        status: { notIn: ["accepted", "cancelled", "rejected"] },
      },
    }),
    prisma.obligation.count({
      where: {
        companyId,
        dueAt: { gte: now, lte: in3days },
        status: { notIn: ["accepted", "cancelled", "rejected"] },
      },
    }),
    prisma.obligation.count({
      where: {
        companyId,
        dueAt: { gt: in3days },
        status: { notIn: ["accepted", "cancelled", "rejected"] },
      },
    }),
  ]);

  return {
    companyId,
    companyName: company.name,
    overdue,
    dueSoon,
    upcoming,
  };
}
