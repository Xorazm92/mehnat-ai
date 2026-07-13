"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/permissions";
import { revalidateTag } from "next/cache";
import { Prisma, type ReportStatus } from "@prisma/client";
import { serialize } from "@/lib/serialize";
import { FIELD_TO_DB_COLUMN } from "@/lib/operationTemplates";
import type { OperationFieldKey } from "@/types";

// =====================================================
// MONTHLY REPORTS
// =====================================================

export async function getMonthlyReports(companyId: string, period?: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const role = session.user.role as string;

  // Access check
  if (!isSeniorRole(role)) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (company?.accountantId !== userId) throw new Error("Forbidden");
  }

  return serialize(
    await prisma.monthlyReport.findMany({
      where: {
        companyId,
        ...(period ? { period } : {}),
      },
      orderBy: { period: "desc" },
    })
  );
}

export async function upsertMonthlyReport(data: Prisma.MonthlyReportUncheckedCreateInput) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const role = session.user.role as string;

  if (!isSeniorRole(role)) {
    const company = await prisma.company.findUnique({ where: { id: data.companyId } });
    if (company?.accountantId !== userId) throw new Error("Forbidden");
  }

  const { companyId, period, ...rawFields } = data;

  // Matritsa ustun kalitlari snake_case (masalan "my_mehnat", "one_c") keladi,
  // Prisma MonthlyReport ustunlari esa camelCase ("myMehnat", "oneC"). Prisma
  // noto'g'ri nomlarda "Unknown field" xatosi beradi, shuning uchun bu yerda
  // kalitlarni haqiqiy ustun nomlariga o'giramiz.
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawFields)) {
    const mapped = FIELD_TO_DB_COLUMN[k as OperationFieldKey] ?? k;
    fields[mapped] = v;
  }

  const result = await prisma.monthlyReport.upsert({
    where: { companyId_period: { companyId, period } },
    create: { companyId, period, ...fields } as Prisma.MonthlyReportUncheckedCreateInput,
    update: fields as Prisma.MonthlyReportUncheckedUpdateInput,
  });
  revalidateTag("operations", "max");
  return serialize(result);
}

export async function clearColumnForPeriod(period: string, colKey: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const role = session.user.role as string;
  if (!isSeniorRole(role)) throw new Error("Forbidden");

  // In Prisma, we can't dynamically set a column to null easily in updateMany. 
  // We can do an executeRaw or just fetch and update. Since records might be large, executeRaw is safer.
  // Actually, wait, Prisma allows dynamic update if we cast it, but updateMany is strict.
  // Let's use Prisma's updateMany but we can't use dynamic keys directly in type-safe updateMany.
  // Workaround: 
  const reports = await prisma.monthlyReport.findMany({ where: { period } });
  
  // Update sequentially or in parallel
  const updates = reports.map(r => 
    prisma.monthlyReport.update({
      where: { id: r.id },
      data: { [colKey]: null }
    })
  );
  
  await prisma.$transaction(updates);
  revalidateTag("operations", "max");
  return { success: true };
}

// =====================================================
// OPERATIONS (Annual / Quarterly)
// =====================================================

export async function getOperations(filters?: {
  companyId?: string;
  period?: string;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const role = session.user.role as string;

  let companyFilter = {};
  if (!isSeniorRole(role)) {
    companyFilter = { company: { accountantId: userId } };
  }

  return serialize(
    await prisma.operation.findMany({
      where: {
        ...companyFilter,
        ...(filters?.companyId ? { companyId: filters.companyId } : {}),
        ...(filters?.period ? { period: filters.period } : {}),
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            inn: true,
            taxRegime: true,
            accountantId: true,
            accountant: { select: { id: true, fullName: true } },
          },
        },
      },
      orderBy: [{ period: "desc" }, { company: { name: "asc" } }],
    })
  );
}

export async function upsertOperation(data: {
  companyId: string;
  period: string;
  profitTaxStatus?: ReportStatus;
  form1Status?: ReportStatus;
  form2Status?: ReportStatus;
  statsStatus?: ReportStatus;
  comment?: string;
  deadlineProfitTax?: Date;
  deadlineStats?: Date;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const role = session.user.role as string;

  if (!isSeniorRole(role)) {
    const company = await prisma.company.findUnique({ where: { id: data.companyId } });
    if (company?.accountantId !== userId) throw new Error("Forbidden");
  }

  const { companyId, period, ...fields } = data;

  const result = await prisma.operation.upsert({
    where: { companyId_period: { companyId, period } },
    create: { companyId, period, ...fields },
    update: fields,
  });
  revalidateTag("operations", "max");
  return serialize(result);
}

export async function getOperationSummary(period?: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const role = session.user.role as string;

  const companyFilter = isSeniorRole(role)
    ? {}
    : { company: { accountantId: userId } };

  const periodFilter = period ? { period } : {};

  const [total, accepted, rejected, blocked, inProgress] = await Promise.all([
    prisma.operation.count({ where: { ...companyFilter, ...periodFilter } }),
    prisma.operation.count({
      where: {
        ...companyFilter,
        ...periodFilter,
        profitTaxStatus: "accepted",
      },
    }),
    prisma.operation.count({
      where: {
        ...companyFilter,
        ...periodFilter,
        profitTaxStatus: "rejected",
      },
    }),
    prisma.operation.count({
      where: {
        ...companyFilter,
        ...periodFilter,
        profitTaxStatus: "blocked",
      },
    }),
    prisma.operation.count({
      where: {
        ...companyFilter,
        ...periodFilter,
        profitTaxStatus: "in_progress",
      },
    }),
  ]);

  return {
    total,
    accepted,
    rejected,
    blocked,
    inProgress,
    pending: total - accepted - rejected - blocked - inProgress,
  };
}

export async function getDeadlines() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const role = session.user.role as string;

  const today = new Date();
  const soon = new Date();
  soon.setDate(today.getDate() + 7);

  const companyFilter = isSeniorRole(role)
    ? {}
    : { company: { accountantId: userId } };

  return serialize(
    await prisma.operation.findMany({
      where: {
        ...companyFilter,
        OR: [
          {
            deadlineProfitTax: { gte: today, lte: soon },
            profitTaxStatus: { notIn: ["accepted", "not_required"] },
          },
          {
            deadlineStats: { gte: today, lte: soon },
            statsStatus: { notIn: ["accepted", "not_required"] },
          },
        ],
      },
      include: {
        company: { select: { id: true, name: true, accountantId: true } },
      },
      orderBy: { deadlineProfitTax: "asc" },
    })
  );
}
