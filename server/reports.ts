"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/permissions";
import { serialize } from "@/lib/serialize";
import { REPORT_TYPES } from "@/lib/reportTypes";
import { Prisma } from "@prisma/client";

// =====================================================
// FINANCIAL REPORTS (Moliyaviy hisobotlar) — ASRO Hisobotlar moduli
// =====================================================

// Senior rollar barcha hisobotlarni ko'radi; buxgalter faqat o'ziga tegishli
// (asosiy accountantId yoki JAMOA orqali biriktirilgan) firmalar hisobotini.
function reportScopeWhere(userId: string, role: string): Prisma.FinancialReportWhereInput {
  if (isSeniorRole(role)) return {};
  return {
    company: {
      OR: [
        { accountantId: userId },
        { contractAssignments: { some: { userId, isActive: true, role: "accountant" } } },
      ],
    },
  };
}

export async function getFinancialReports(period?: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id as string;
  const role = session.user.role as string;

  const reports = await prisma.financialReport.findMany({
    where: {
      ...(period ? { period } : {}),
      ...reportScopeWhere(userId, role),
    },
    orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
    include: { company: { select: { name: true, inn: true } } },
  });

  // attach assignee names
  const ids = [...new Set(reports.map((r) => r.assignedTo).filter(Boolean) as string[])];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.fullName]));

  return serialize(
    reports.map((r) => ({
      ...r,
      companyName: r.company.name,
      companyInn: r.company.inn,
      assigneeName: r.assignedTo ? nameOf.get(r.assignedTo) ?? null : null,
      typeLabel: REPORT_TYPES[r.type]?.label ?? r.type,
    }))
  );
}

export async function getReportDeadlines() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id as string;
  const role = session.user.role as string;

  const now = new Date();
  const soon = await prisma.financialReport.findMany({
    where: {
      deadline: { not: null },
      status: { notIn: ["submitted"] },
      ...reportScopeWhere(userId, role),
    },
    orderBy: { deadline: "asc" },
    take: 6,
    include: { company: { select: { name: true } } },
  });

  return serialize(
    soon.map((r) => {
      const days = r.deadline ? Math.ceil((r.deadline.getTime() - now.getTime()) / 86400000) : null;
      return {
        id: r.id,
        typeLabel: REPORT_TYPES[r.type]?.label ?? r.type,
        companyName: r.company.name,
        deadline: r.deadline,
        daysLeft: days,
        status: r.status,
      };
    })
  );
}

export async function createFinancialReport(input: {
  companyId: string;
  type: string;
  period: string;
  deadline?: string | null;
  assignedTo?: string | null;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isSeniorRole(session.user.role as string)) throw new Error("Forbidden");

  // Auto-generate representative line items from the template
  const data = buildTemplateData(input.type);

  return serialize(
    await prisma.financialReport.create({
      data: {
        companyId: input.companyId,
        type: input.type,
        period: input.period,
        deadline: input.deadline ? new Date(input.deadline) : null,
        assignedTo: input.assignedTo ?? null,
        status: "preparing",
        fileFormat: REPORT_TYPES[input.type]?.format ?? "PDF",
        data: data as Prisma.InputJsonValue,
      },
    })
  );
}

export async function setReportStatus(id: string, status: string, extra?: { rejectedReason?: string }) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isSeniorRole(session.user.role as string)) throw new Error("Forbidden");

  const data: Prisma.FinancialReportUpdateInput = { status };
  if (status === "submitted") data.submittedAt = new Date();
  if (status === "signing") { data.signedBy = session.user.id; data.signedAt = new Date(); }
  if (status === "rejected") data.rejectedReason = extra?.rejectedReason ?? null;

  return serialize(await prisma.financialReport.update({ where: { id }, data }));
}

export async function deleteFinancialReport(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isSeniorRole(session.user.role as string)) throw new Error("Forbidden");
  await prisma.financialReport.delete({ where: { id } });
  return { ok: true };
}

// Yangi hisobot bo'sh satrlar bilan yaratiladi — raqamlar buxgalteriya
// tizimidan (1C integratsiyasi kelgach) yoki qo'lda kiritiladi. Ilgari bu yerda
// namunaviy (soxta) raqamlar bo'lgan; real firma hisobotiga to'qima summalarni
// yozish chalg'ituvchi bo'lgani uchun olib tashlandi.
function buildTemplateData(type: string) {
  const titles: Record<string, string> = {
    profit_loss: "Foyda va zarar hisoboti",
    balance: "Balans hisoboti (F-1)",
    qqs: "QQS deklaratsiyasi",
    cashflow: "Pul oqimi hisoboti",
  };
  return { title: titles[type] ?? "Hisobot", lines: [] };
}
