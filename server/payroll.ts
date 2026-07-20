"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/permissions";
import { assertSufficientFunds } from "@/lib/balance";
import { assertPeriodOpen } from "@/lib/periodLock";
import { ACCOUNTS, postLedger } from "@/lib/ledger";
import { recordAuditLog } from "@/lib/auditTrail";
import { adjustmentMagnitude } from "@/lib/adjustments";
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
        deletedAt: null,
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

  // Ishora UI konventsiyasiga ko'ra erkin (jarima/avans manfiy yuboriladi),
  // lekin nol/NaN summa va noma'lum tur bazaga kirmasligi kerak.
  if (!["bonus", "avans", "jarima", "manual", "other"].includes(data.adjustmentType)) {
    // 'payment' (majburiyat) faqat approveEmployeeSalary orqali yoziladi;
    // REAL pul berish esa Payout jadvalida (server/payouts.ts createPayout).
    if (data.adjustmentType === "payment") {
      throw new Error("Oylik to'lovi endi Payout orqali yoziladi — bu tur qo'lda kiritilmaydi");
    }
    throw new Error("Tuzatish turi noto'g'ri");
  }
  if (!Number.isFinite(data.amount) || data.amount === 0) {
    throw new Error("Summa noldan farqli son bo'lishi kerak");
  }
  if (!data.reason?.trim()) throw new Error("Sabab kiritilishi shart");
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(data.month)) {
    throw new Error("Oy formati noto'g'ri (YYYY-MM kutiladi)");
  }
  await assertPeriodOpen(prisma, data.month, "oylik tuzatmasi");

  const created = await prisma.payrollAdjustment.create({
    data: {
      ...data,
      createdBy: session.user.id,
    },
  });

  await recordAuditLog({
    userId: session.user.id,
    action: "create",
    tableName: "PayrollAdjustment",
    recordId: created.id,
    newData: {
      adjustmentType: data.adjustmentType,
      amount: data.amount,
      month: data.month,
      employeeId: data.employeeId,
      reason: data.reason,
    },
  });

  return serialize(created);
}

export async function approvePayrollAdjustment(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!["super_admin", "admin"].includes(role)) throw new Error("Forbidden");

  const existing = await prisma.payrollAdjustment.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw new Error("Tuzatish topilmadi");
  if (existing.isApproved) throw new Error("Bu tuzatish allaqachon tasdiqlangan");
  if (existing.adjustmentType === "payment") {
    throw new Error("Oylik to'lovi Payout orqali amalga oshiriladi (server/payouts.ts)");
  }

  await assertPeriodOpen(prisma, existing.month, "oylik tuzatmasi");

  const amountAbs = adjustmentMagnitude(existing.amount);

  // Avans tasdig'i = REAL pul berish. Balans tekshiriladi (admin o'tkaza oladi,
  // minus balans holati audit logga tushadi).
  if (existing.adjustmentType === "avans") {
    await assertSufficientFunds({
      amount: amountAbs,
      role,
      userId: session.user.id,
      context: "payroll",
    });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.payrollAdjustment.update({
      where: { id },
      data: {
        isApproved: true,
        approvedBy: session.user.id,
        approvedAt: new Date(),
      },
    });

    // Avans — pul shu zahoti qo'lga beriladi: Payout + double-entry bir tranzaksiyada.
    if (existing.adjustmentType === "avans") {
      const payout = await tx.payout.create({
        data: {
          employeeId: existing.employeeId,
          adjustmentId: id,
          month: existing.month.slice(0, 7),
          amount: new Prisma.Decimal(amountAbs),
          paymentMethod: "naqd",
          note: `Avans tasdig'i: ${existing.reason}`,
          createdBy: session.user.id,
        },
      });
      await postLedger(tx, {
        legs: [
          { accountId: ACCOUNTS.SALARY_EXPENSE, debit: amountAbs },
          { accountId: ACCOUNTS.CASH, credit: amountAbs },
        ],
        period: existing.month.slice(0, 7),
        sourceTable: "Payout",
        sourceId: payout.id,
        createdBy: session.user.id,
        description: `Avans: ${existing.reason}`,
      });
    }

    return row;
  });

  await recordAuditLog({
    userId: session.user.id,
    action: "update",
    tableName: "PayrollAdjustment",
    recordId: id,
    oldData: { isApproved: false },
    newData: {
      isApproved: true,
      adjustmentType: existing.adjustmentType,
      amount: Number(existing.amount),
      month: existing.month,
      employeeId: existing.employeeId,
    },
  });

  return serialize(updated);
}

export async function deletePayrollAdjustment(id: string, reason?: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!["super_admin", "admin"].includes(role)) throw new Error("Forbidden");

  const existing = await prisma.payrollAdjustment.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw new Error("Tuzatish topilmadi");

  await assertPeriodOpen(prisma, existing.month, "oylik tuzatmasi");

  // Majburiyatga bog'langan REAL to'lovlar bor ekan, majburiyat o'chirilmaydi —
  // aks holda berilgan pul "majburiyatsiz" osilib qoladi. Avval payout bekor qilinsin.
  const linkedPayouts = await prisma.payout.count({
    where: { adjustmentId: id, deletedAt: null },
  });
  if (linkedPayouts > 0) {
    throw new Error(
      "Bu majburiyat bo'yicha real to'lov (Payout) mavjud — avval to'lov bekor qilinishi kerak"
    );
  }

  const deleted = await prisma.payrollAdjustment.update({
    where: { id },
    data: { deletedAt: new Date(), deletedBy: session.user.id, deleteReason: reason?.trim() || null },
  });

  await recordAuditLog({
    userId: session.user.id,
    action: "delete",
    tableName: "PayrollAdjustment",
    recordId: id,
    oldData: {
      adjustmentType: existing.adjustmentType,
      amount: Number(existing.amount),
      month: existing.month,
      employeeId: existing.employeeId,
      isApproved: existing.isApproved,
      reason: existing.reason,
    },
    newData: { deleteReason: reason?.trim() || null },
  });

  return serialize(deleted);
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

  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(data.month)) {
    throw new Error("Oy formati noto'g'ri (YYYY-MM kutiladi)");
  }
  await assertPeriodOpen(prisma, data.month, "oylik tasdig'i");

  const existing = await prisma.payrollAdjustment.findFirst({
    where: {
      employeeId: data.employeeId,
      month: data.month,
      adjustmentType: "payment",
      deletedAt: null,
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

  // Takror-tekshiruv + yozuv bitta Serializable tranzaksiyada: ikki parallel
  // tasdiqlash (double-click / ikki brauzer) bir oy uchun ikkita 'payment'
  // yozib qo'ymasin — dublikat to'g'ridan-to'g'ri oylikni ikkilantiradi.
  const adjustment = await prisma.$transaction(
    async (tx) => {
      const dupe = await tx.payrollAdjustment.findFirst({
        where: {
          employeeId: data.employeeId,
          month: data.month,
          adjustmentType: "payment",
          deletedAt: null,
        },
        select: { id: true },
      });
      if (dupe) throw new Error("Bu oy uchun oylik allaqachon tasdiqlangan");

      return tx.payrollAdjustment.create({
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
    },
    { isolationLevel: "Serializable" }
  );

  await recordAuditLog({
    userId,
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

  const created = await prisma.contractAssignment.create({ data });

  await recordAuditLog({
    userId: session.user.id,
    action: "create",
    tableName: "ContractAssignment",
    recordId: created.id,
    newData: {
      companyId: data.companyId,
      userId: data.userId,
      role: data.role,
      salaryType: data.salaryType,
      salaryValue: data.salaryValue,
    },
  });

  return serialize(created);
}
