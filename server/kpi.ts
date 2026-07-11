"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole, isAdminRole } from "@/lib/permissions";
import { serialize } from "@/lib/serialize";
import { computeRuleScore, type KpiEntryInput } from "@/lib/kpiScoring";
import { Prisma } from "@prisma/client";

// =====================================================
// KPI RULES
// =====================================================

export async function getKpiRules() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  return serialize(
    await prisma.kpiRule.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    })
  );
}

// Percent columns are Decimal(5,2): value must fit -999.99..999.99, otherwise
// Prisma throws P2020 (ValueOutOfRange) -> unhandled 500. Validate up front so
// bad input surfaces as a clear, catchable error instead.
function assertPercent(label: string, v: number | undefined) {
  if (v === undefined || v === null) return;
  if (typeof v !== "number" || Number.isNaN(v)) {
    throw new Error(`${label} raqam bo'lishi kerak`);
  }
  if (v < 0 || v > 999.99) {
    throw new Error(`${label} 0 va 999.99 oralig'ida bo'lishi kerak`);
  }
}

// KPI v2 rule fields (three-state options-based)
export interface KpiRuleV2Input {
  descriptionUz?: string;
  inputTypeV2?: string; // 'select' | 'counter' | 'checkbox_bonus' | 'checkbox_penalty' | 'amount_penalty'
  scope?: string; // 'global' | 'per_company' | 'per_group'
  maxBonus?: number | null;
  maxPenalty?: number | null;
  options?: unknown; // KpiOption[]
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
} & KpiRuleV2Input) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isAdminRole(role)) throw new Error("Forbidden");

  assertPercent("Mukofot foizi", data.rewardPercent);
  assertPercent("Jarima foizi", data.penaltyPercent);

  const { options, maxBonus, maxPenalty, ...rest } = data;
  return serialize(
    await prisma.kpiRule.create({
      data: {
        ...rest,
        ...(options !== undefined ? { options: options as Prisma.InputJsonValue } : {}),
        ...(maxBonus !== undefined ? { maxBonus: maxBonus === null ? null : new Prisma.Decimal(maxBonus) } : {}),
        ...(maxPenalty !== undefined ? { maxPenalty: maxPenalty === null ? null : new Prisma.Decimal(maxPenalty) } : {}),
      },
    })
  );
}

export async function updateKpiRule(id: string, data: Partial<{
  nameUz: string;
  rewardPercent: number;
  penaltyPercent: number;
  isActive: boolean;
  sortOrder: number;
  description: string;
  category: string;
}> & KpiRuleV2Input) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isAdminRole(role)) throw new Error("Forbidden");

  assertPercent("Mukofot foizi", data.rewardPercent);
  assertPercent("Jarima foizi", data.penaltyPercent);

  const { options, maxBonus, maxPenalty, ...rest } = data;
  return serialize(
    await prisma.kpiRule.update({
      where: { id },
      data: {
        ...rest,
        ...(options !== undefined ? { options: options as Prisma.InputJsonValue } : {}),
        ...(maxBonus !== undefined ? { maxBonus: maxBonus === null ? null : new Prisma.Decimal(maxBonus) } : {}),
        ...(maxPenalty !== undefined ? { maxPenalty: maxPenalty === null ? null : new Prisma.Decimal(maxPenalty) } : {}),
      },
    })
  );
}

export async function deleteKpiRule(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isAdminRole(role)) throw new Error("Forbidden");

  return serialize(await prisma.kpiRule.delete({ where: { id } }));
}

// =====================================================
// MONTHLY PERFORMANCE (KPI entries)
// =====================================================

export async function getMonthlyPerformance(month: string, employeeId?: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const role = session.user.role as string;

  // Non-senior users can only see their own
  const targetEmployeeId = isSeniorRole(role) ? employeeId : userId;

  return serialize(
    await prisma.monthlyPerformance.findMany({
      where: {
        month,
        ...(targetEmployeeId ? { employeeId: targetEmployeeId } : {}),
      },
      include: {
        rule: true,
        employee: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { recordedAt: "desc" },
    })
  );
}

export async function upsertPerformance(data: {
  month: string;
  companyId: string;
  employeeId: string;
  ruleId: string;
  // KPI v2 inputs (score is computed server-side from these)
  selectedOption?: string | null;
  earlyDays?: number;
  lateMinutes?: number;
  absentDays?: number;
  penaltyAmount?: number;
  source?: string;
  notes?: string;
  status?: string; // 'submitted' (default) | 'approved' — supervisor entries are authoritative
  // Legacy fallbacks (used only if the rule has no v2 options)
  value?: number;
  calculatedScore?: number;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const submittedBy = session.user.id;

  const rule = await prisma.kpiRule.findUnique({ where: { id: data.ruleId } });
  if (!rule) throw new Error("KPI qoidasi topilmadi");

  // Compute the score from the v2 rule options when available.
  const opts = Array.isArray(rule.options) ? rule.options : [];
  const useV2 = opts.length > 0;

  const input: KpiEntryInput = {
    selectedOption: data.selectedOption ?? null,
    counters: {
      early_days: data.earlyDays ?? 0,
      late_5min: Math.floor((data.lateMinutes ?? 0) / 5),
      absent_days: data.absentDays ?? 0,
    },
    penaltyAmount: data.penaltyAmount ?? 0,
  };
  const score = useV2 ? computeRuleScore(rule as never, input) : null;

  const calculatedScore = score ? score.percent : data.calculatedScore ?? 0;
  const value =
    data.value ??
    (score ? (score.color === "green" ? 1 : score.color === "red" ? -1 : 0) : 0);

  const payload = {
    month: data.month,
    companyId: data.companyId,
    employeeId: data.employeeId,
    ruleId: data.ruleId,
    selectedOption: data.selectedOption ?? null,
    earlyDays: data.earlyDays ?? 0,
    lateMinutes: data.lateMinutes ?? 0,
    absentDays: data.absentDays ?? 0,
    penaltyAmount: new Prisma.Decimal(data.penaltyAmount ?? 0),
    value: new Prisma.Decimal(value),
    calculatedScore: new Prisma.Decimal(calculatedScore),
    source: data.source ?? "supervisor",
    notes: data.notes,
    submittedBy,
    submittedAt: new Date(),
    status: data.status ?? "submitted",
    ...(data.status === "approved"
      ? { approvedBy: session.user.id, approvedAt: new Date() }
      : {}),
  };

  // Natural-key upsert (no DB unique constraint): avoid duplicate rows per
  // month+company+employee+rule by updating an existing non-approved record.
  const existing = await prisma.monthlyPerformance.findFirst({
    where: {
      month: data.month,
      companyId: data.companyId,
      employeeId: data.employeeId,
      ruleId: data.ruleId,
      status: { not: "approved" },
    },
    select: { id: true },
  });

  const saved = existing
    ? await prisma.monthlyPerformance.update({ where: { id: existing.id }, data: payload })
    : await prisma.monthlyPerformance.create({ data: payload });

  return serialize(saved);
}

export async function approvePerformance(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!["super_admin", "admin", "chief_accountant"].includes(role)) {
    throw new Error("Forbidden");
  }

  return serialize(
    await prisma.monthlyPerformance.update({
      where: { id },
      data: {
        status: "approved",
        approvedBy: session.user.id,
        approvedAt: new Date(),
      },
    })
  );
}

export async function rejectPerformance(id: string, reason: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!["super_admin", "admin", "chief_accountant", "supervisor"].includes(role)) {
    throw new Error("Forbidden");
  }

  return serialize(
    await prisma.monthlyPerformance.update({
      where: { id },
      data: {
        status: "rejected",
        approvedBy: session.user.id,
        approvedAt: new Date(),
        rejectedReason: reason,
      },
    })
  );
}

// =====================================================
// KPI SUMMARY (per employee per month)
// =====================================================

export async function getEmployeeKpiSummary(month: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isSeniorRole(role)) throw new Error("Forbidden");

  const performances = await prisma.monthlyPerformance.findMany({
    where: { month, status: { in: ["submitted", "approved"] } },
    include: {
      employee: { select: { id: true, fullName: true, role: true } },
      rule: { select: { nameUz: true, category: true } },
    },
  });

  // Group by employee
  interface EmpKpiSummary {
    employeeId: string;
    employeeName: string;
    employeeRole: (typeof performances)[number]["employee"]["role"];
    totalScore: number;
    entries: typeof performances;
  }
  const byEmployee: Record<string, EmpKpiSummary> = {};
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

  return serialize(Object.values(byEmployee));
}

export async function getCompanyKpiRules(companyId: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  return serialize(
    await prisma.companyKpiRule.findMany({
      where: { companyId, isActive: true },
      include: { rule: true },
    })
  );
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
  
  const role = session.user.role as string;
  if (!["super_admin", "admin", "supervisor"].includes(role)) {
    throw new Error("Forbidden");
  }

  return serialize(
    await prisma.companyKpiRule.upsert({
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
    })
  );
}
