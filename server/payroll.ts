"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/permissions";
import { createAuditLog } from "@/server/audit";
import { serialize } from "@/lib/serialize";

// =====================================================
// PAYROLL ADJUSTMENTS
// =====================================================

export async function getPayrollAdjustments(month: string, employeeId?: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const role = session.user.role as string;

  const targetId = isSeniorRole(role) ? employeeId : userId;

  return serialize(
    await prisma.payrollAdjustment.findMany({
      where: {
        month,
        ...(targetId ? { employeeId: targetId } : {}),
      },
      include: {
        employee: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
    })
  );
}

export async function createPayrollAdjustment(data: {
  month: string;
  employeeId: string;
  adjustmentType: string;
  amount: number;
  reason: string;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isSeniorRole(role)) throw new Error("Forbidden");

  return serialize(
    await prisma.payrollAdjustment.create({
      data: {
        ...data,
        createdBy: session.user.id,
      },
    })
  );
}

export async function approvePayrollAdjustment(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!["super_admin", "admin"].includes(role)) throw new Error("Forbidden");

  return serialize(
    await prisma.payrollAdjustment.update({
      where: { id },
      data: {
        isApproved: true,
        approvedBy: session.user.id,
        approvedAt: new Date(),
      },
    })
  );
}

export async function deletePayrollAdjustment(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!["super_admin", "admin"].includes(role)) throw new Error("Forbidden");

  return serialize(await prisma.payrollAdjustment.delete({ where: { id } }));
}

// Oylik (baza + KPI bonus/jarima) hisoblangan summani tasdiqlash — natija
// PayrollAdjustment jadvaliga 'payment' turi bilan yoziladi.
export async function approveEmployeeSalary(data: {
  employeeId: string;
  month: string;
  baseSalary: number;
  kpiBonus: number;
  kpiPenalty: number;
  totalSalary: number;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isSeniorRole(role)) throw new Error("Forbidden");

  const existing = await prisma.payrollAdjustment.findFirst({
    where: {
      employeeId: data.employeeId,
      month: data.month,
      adjustmentType: "payment",
    },
  });
  if (existing) {
    throw new Error("Bu oy uchun oylik allaqachon tasdiqlangan");
  }

  const userId = session.user.id as string;

  const adjustment = await prisma.payrollAdjustment.create({
    data: {
      month: data.month,
      employeeId: data.employeeId,
      adjustmentType: "payment",
      amount: data.totalSalary,
      reason: `Oylik tasdiqlandi: baza ${data.baseSalary.toFixed(0)}, bonus ${data.kpiBonus.toFixed(0)}, jarima ${data.kpiPenalty.toFixed(0)}`,
      createdBy: userId,
      isApproved: true,
      approvedBy: userId,
      approvedAt: new Date(),
    },
  });

  await createAuditLog({
    action: "create",
    tableName: "PayrollAdjustment",
    recordId: adjustment.id,
    newData: data,
  });

  return serialize(adjustment);
}

// =====================================================
// PAYROLL SUMMARY (calculated)
// =====================================================

export async function getPayrollSummary(month: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isSeniorRole(role)) throw new Error("Forbidden");

  // Get all active users
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { notIn: ["super_admin", "admin"] } },
    select: { id: true, fullName: true, role: true },
  });

  // Get contract assignments for base salary
  const contracts = await prisma.contractAssignment.findMany({
    where: { isActive: true },
    include: { company: { select: { contractAmount: true } } },
  });

  // Get performance scores
  const performances = await prisma.monthlyPerformance.findMany({
    where: { month, status: { in: ["approved", "submitted"] } },
  });

  // Get adjustments
  const adjustments = await prisma.payrollAdjustment.findMany({
    where: { month },
  });

  // Calculate for each user
  return serialize(users.map((user) => {
    const userContracts = contracts.filter(
      (c) => c.userId === user.id && c.isActive
    );
    
    const baseSalary = userContracts.reduce((sum, c) => {
      const contractAmt = Number(c.company.contractAmount || 0);
      if (c.salaryType === "percent") {
        return sum + (contractAmt * Number(c.salaryValue)) / 100;
      }
      return sum + Number(c.salaryValue);
    }, 0);

    const userPerformances = performances.filter(
      (p) => p.employeeId === user.id
    );
    const kpiBonus = userPerformances
      .filter((p) => Number(p.calculatedScore) > 0)
      .reduce((sum, p) => sum + (baseSalary * Number(p.calculatedScore)) / 100, 0);
    const kpiPenalty = userPerformances
      .filter((p) => Number(p.calculatedScore) < 0)
      .reduce((sum, p) => sum + (baseSalary * Math.abs(Number(p.calculatedScore))) / 100, 0);

    const userAdjustments = adjustments.filter(
      (a) => a.employeeId === user.id && a.isApproved
    );
    const adjustmentTotal = userAdjustments.reduce(
      (sum, a) => sum + Number(a.amount),
      0
    );

    return {
      employeeId: user.id,
      employeeName: user.fullName,
      employeeRole: user.role,
      month,
      companyCount: userContracts.length,
      baseSalary,
      kpiBonus,
      kpiPenalty,
      adjustments: adjustmentTotal,
      totalSalary: baseSalary + kpiBonus - kpiPenalty + adjustmentTotal,
    };
  }));
}

// =====================================================
// CONTRACT ASSIGNMENTS
// =====================================================

export async function getContractAssignments(companyId?: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isSeniorRole(role)) throw new Error("Forbidden");

  return serialize(
    await prisma.contractAssignment.findMany({
      where: {
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      include: {
        user: { select: { id: true, fullName: true, role: true } },
        company: { select: { id: true, name: true, contractAmount: true } },
      },
      orderBy: { createdAt: "desc" },
    })
  );
}

export async function upsertContractAssignment(data: {
  companyId: string;
  userId: string;
  role: string;
  salaryType: string;
  salaryValue: number;
  startDate: Date;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userRole = session.user.role as string;
  if (!["super_admin", "admin"].includes(userRole)) throw new Error("Forbidden");

  // Deactivate existing same role assignment
  await prisma.contractAssignment.updateMany({
    where: {
      companyId: data.companyId,
      role: data.role,
      isActive: true,
    },
    data: { isActive: false, endDate: new Date() },
  });

  return serialize(await prisma.contractAssignment.create({ data }));
}
