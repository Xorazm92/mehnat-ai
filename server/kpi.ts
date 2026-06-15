"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole, isAdminRole } from "@/lib/permissions";

// =====================================================
// KPI RULES
// =====================================================

export async function getKpiRules() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  return prisma.kpiRule.findMany({
    where: { isActive: true },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });
}

export async function createKpiRule(data: {
  name: string;
  nameUz: string;
  role: string;
  rewardPercent: number;
  penaltyPercent: number;
  inputType: string;
  category: string;
  description?: string;
  sortOrder?: number;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = (session.user as any).role as string;
  if (!isAdminRole(role)) throw new Error("Forbidden");

  return prisma.kpiRule.create({ data });
}

export async function updateKpiRule(id: string, data: Partial<{
  nameUz: string;
  rewardPercent: number;
  penaltyPercent: number;
  isActive: boolean;
  sortOrder: number;
  description: string;
}>) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = (session.user as any).role as string;
  if (!isAdminRole(role)) throw new Error("Forbidden");

  return prisma.kpiRule.update({ where: { id }, data });
}

export async function deleteKpiRule(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = (session.user as any).role as string;
  if (!isAdminRole(role)) throw new Error("Forbidden");

  return prisma.kpiRule.delete({ where: { id } });
}

// =====================================================
// MONTHLY PERFORMANCE (KPI entries)
// =====================================================

export async function getMonthlyPerformance(month: string, employeeId?: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = (session.user as any).id;
  const role = (session.user as any).role as string;

  // Non-senior users can only see their own
  const targetEmployeeId = isSeniorRole(role) ? employeeId : userId;

  return prisma.monthlyPerformance.findMany({
    where: {
      month,
      ...(targetEmployeeId ? { employeeId: targetEmployeeId } : {}),
    },
    include: {
      rule: true,
      employee: { select: { id: true, fullName: true, role: true } },
    },
    orderBy: { recordedAt: "desc" },
  });
}

export async function upsertPerformance(data: {
  month: string;
  companyId: string;
  employeeId: string;
  ruleId: string;
  value: number;
  calculatedScore: number;
  source?: string;
  notes?: string;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const submittedBy = (session.user as any).id;

  return prisma.monthlyPerformance.create({
    data: {
      ...data,
      submittedBy,
      submittedAt: new Date(),
      status: "submitted",
    },
  });
}

export async function approvePerformance(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = (session.user as any).role as string;
  if (!["super_admin", "admin", "chief_accountant"].includes(role)) {
    throw new Error("Forbidden");
  }

  return prisma.monthlyPerformance.update({
    where: { id },
    data: {
      status: "approved",
      approvedBy: (session.user as any).id,
      approvedAt: new Date(),
    },
  });
}

// =====================================================
// KPI SUMMARY (per employee per month)
// =====================================================

export async function getEmployeeKpiSummary(month: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = (session.user as any).role as string;
  if (!isSeniorRole(role)) throw new Error("Forbidden");

  const performances = await prisma.monthlyPerformance.findMany({
    where: { month, status: { in: ["submitted", "approved"] } },
    include: {
      employee: { select: { id: true, fullName: true, role: true } },
      rule: { select: { nameUz: true, category: true } },
    },
  });

  // Group by employee
  const byEmployee: Record<string, any> = {};
  for (const p of performances) {
    const eid = p.employeeId;
    if (!byEmployee[eid]) {
      byEmployee[eid] = {
        employeeId: eid,
        employeeName: p.employee.fullName,
        employeeRole: p.employee.role,
        totalScore: 0,
        entries: [],
      };
    }
    byEmployee[eid].totalScore += Number(p.calculatedScore);
    byEmployee[eid].entries.push(p);
  }

  return Object.values(byEmployee);
}

export async function getCompanyKpiRules(companyId: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  return prisma.companyKpiRule.findMany({
    where: { companyId, isActive: true },
    include: { rule: true },
  });
}

export async function upsertCompanyKpiRule(data: {
  id?: string;
  companyId: string;
  ruleId: string;
  rewardPercent?: number | null;
  penaltyPercent?: number | null;
  isActive: boolean;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  
  const role = (session.user as any).role as string;
  if (!["super_admin", "admin", "supervisor"].includes(role)) {
    throw new Error("Forbidden");
  }

  return prisma.companyKpiRule.upsert({
    where: { companyId_ruleId: { companyId: data.companyId, ruleId: data.ruleId } },
    update: { 
      isActive: data.isActive, 
      rewardPercent: data.rewardPercent ?? null,
      penaltyPercent: data.penaltyPercent ?? null
    },
    create: { 
      companyId: data.companyId, 
      ruleId: data.ruleId, 
      isActive: data.isActive,
      rewardPercent: data.rewardPercent ?? null,
      penaltyPercent: data.penaltyPercent ?? null
    }
  });
}
