"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/permissions";
import { assertSufficientFunds } from "@/lib/balance";
import { createAuditLog } from "@/server/audit";
import { serialize } from "@/lib/serialize";
import { calculateEmployeeSalary } from "@/lib/kpiLogic";
import { mapMonthlyReportToOperationEntry } from "@/lib/operationTemplates";
import type { Company, CompanyKPIRule, KPIRule, MonthlyPerformance, Staff } from "@/types";

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

/**
 * Load what the salary calculation needs and run it. Deliberately assembles the
 * same inputs the payroll screen renders from, and calls the same pure function,
 * so the figure a Supervisor approves is the figure that gets written.
 */
async function computeEmployeeSalary(employeeId: string, month: string) {
  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { id: true, fullName: true, role: true },
  });
  if (!employee) throw new Error("Xodim topilmadi");

  const [companies, reports, performances, rules, overrides] = await Promise.all([
    prisma.company.findMany({
      where: {
        OR: [
          { accountantId: employeeId },
          { bankClientId: employeeId },
          { supervisorId: employeeId },
          { chiefAccountantId: employeeId },
        ],
      },
    }),
    prisma.monthlyReport.findMany({ where: { period: month.slice(0, 7) } }),
    prisma.monthlyPerformance.findMany({
      where: { month, employeeId, status: "approved" },
    }),
    prisma.kpiRule.findMany({ where: { isActive: true } }),
    prisma.companyKpiRule.findMany({ where: { isActive: true } }),
  ]);

  const draft = calculateEmployeeSalary({
    employee: { id: employee.id, name: employee.fullName, role: employee.role } as Staff,
    companies: serialize(companies) as unknown as Company[],
    operations: reports.map(mapMonthlyReportToOperationEntry),
    performances: serialize(performances) as unknown as MonthlyPerformance[],
    rules: serialize(rules) as unknown as KPIRule[],
    overrides: serialize(overrides) as unknown as CompanyKPIRule[],
    month: month.slice(0, 7),
  });

  return { ...draft, employeeName: employee.fullName };
}

// Oylik (baza + KPI bonus/jarima) hisoblangan summani tasdiqlash — natija
// PayrollAdjustment jadvaliga 'payment' turi bilan yoziladi.
/**
 * Approve one employee's salary for one month.
 *
 * Takes only who and when: the amount is computed here, from approved Monthly
 * Performance, and the caller's opinion of the total is not accepted. It used to
 * take baseSalary/kpiBonus/kpiPenalty/totalSalary and write them verbatim, which
 * meant a React component in the Supervisor's browser decided what people were
 * paid — that is the path ADR-0004's defect took to reach real salary.
 *
 * Throws rather than paying zero when penalties exceed base pay: silently clamping
 * to zero is the harshest possible docking, and ADR-0001 says an unreviewed error
 * must never reach someone's salary.
 */
export async function approveEmployeeSalary(data: { employeeId: string; month: string }) {
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
  const draft = await computeEmployeeSalary(data.employeeId, data.month);

  if (draft.rawTotal < 0) {
    throw new Error(
      `${draft.employeeName} uchun ${data.month} oyida jarimalar asosiy oylikdan oshib ketdi ` +
        `(${Math.round(draft.rawTotal).toLocaleString()} so'm). Oylik nolga tushirilmadi — ` +
        `KPI yozuvlarini tekshiring.`
    );
  }

  // Oylik ham chiqim — mavjud balansdan oshsa oddiy foydalanuvchi bloklanadi,
  // Admin/Superadmin o'tkaza oladi (audit logga yozilib).
  await assertSufficientFunds({ amount: draft.totalSalary, role, userId, context: "payroll" });

  const adjustment = await prisma.payrollAdjustment.create({
    data: {
      month: data.month,
      employeeId: data.employeeId,
      adjustmentType: "payment",
      amount: draft.totalSalary,
      reason: `Oylik tasdiqlandi: baza ${draft.baseSalary.toFixed(0)}, bonus ${draft.kpiBonus.toFixed(0)}, jarima ${draft.kpiPenalty.toFixed(0)}`,
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
