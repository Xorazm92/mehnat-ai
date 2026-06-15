"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole, isSeniorRole } from "@/lib/permissions";

export async function getKassaEntries(filters?: {
  type?: string;
  category?: string;
  from?: Date;
  to?: Date;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = (session.user as any).role as string;
  if (!["super_admin", "admin", "chief_accountant", "bank_manager"].includes(role)) {
    throw new Error("Forbidden");
  }

  return prisma.kassaEntry.findMany({
    where: {
      ...(filters?.type ? { type: filters.type } : {}),
      ...(filters?.category ? { category: filters.category } : {}),
      ...(filters?.from || filters?.to
        ? {
            date: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    },
    include: {
      user: { select: { id: true, fullName: true } },
    },
    orderBy: { date: "desc" },
  });
}

export async function createKassaEntry(data: {
  type: string;
  category: string;
  amount: number;
  description?: string;
  date: Date;
  companyId?: string;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = (session.user as any).role as string;
  if (!isSeniorRole(role) && role !== "bank_manager") throw new Error("Forbidden");

  return prisma.kassaEntry.create({
    data: {
      ...data,
      createdBy: (session.user as any).id,
    },
  });
}

export async function deleteKassaEntry(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = (session.user as any).role as string;
  if (!isAdminRole(role)) throw new Error("Forbidden");

  return prisma.kassaEntry.delete({ where: { id } });
}

export async function getKassaSummary(from?: Date, to?: Date) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const dateFilter = from || to
    ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
    : {};

  const [income, expense] = await Promise.all([
    prisma.kassaEntry.aggregate({
      where: { type: "income", ...dateFilter },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.kassaEntry.aggregate({
      where: { type: "expense", ...dateFilter },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  return {
    totalIncome: Number(income._sum.amount || 0),
    totalExpense: Number(expense._sum.amount || 0),
    balance: Number(income._sum.amount || 0) - Number(expense._sum.amount || 0),
    incomeCount: income._count,
    expenseCount: expense._count,
  };
}

// =====================================================
// EXPENSES
// =====================================================

export async function getExpenses(filters?: {
  category?: string;
  from?: Date;
  to?: Date;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = (session.user as any).role as string;
  if (!isSeniorRole(role)) throw new Error("Forbidden");

  return prisma.expense.findMany({
    where: {
      ...(filters?.category ? { category: filters.category } : {}),
      ...(filters?.from || filters?.to
        ? {
            date: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    },
    include: {
      user: { select: { id: true, fullName: true } },
    },
    orderBy: { date: "desc" },
  });
}

export async function createExpense(data: {
  amount: number;
  date: Date;
  category: string;
  description?: string;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  return prisma.expense.create({
    data: {
      ...data,
      createdBy: (session.user as any).id,
    },
  });
}

export async function deleteExpense(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = (session.user as any).role as string;
  if (!isAdminRole(role)) throw new Error("Forbidden");

  return prisma.expense.delete({ where: { id } });
}
