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

export async function getFinancialReports(period?: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const reports = await prisma.financialReport.findMany({
    where: period ? { period } : undefined,
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

  const now = new Date();
  const soon = await prisma.financialReport.findMany({
    where: { deadline: { not: null }, status: { notIn: ["submitted"] } },
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

// Representative line items per report type (for the viewer)
function buildTemplateData(type: string) {
  if (type === "profit_loss") {
    return {
      title: "Foyda va zarar hisoboti",
      lines: [
        { label: "Sof tushum", cur: 486_200_000, prev: 412_800_000 },
        { label: "Sotilgan mahsulot tannarxi", cur: -298_400_000, prev: -260_100_000 },
        { label: "Yalpi foyda", cur: 187_800_000, prev: 152_700_000, bold: true },
        { label: "Operatsion xarajatlar", cur: -96_300_000, prev: -88_900_000 },
        { label: "Soliqlar", cur: -21_400_000, prev: -17_200_000 },
        { label: "Sof foyda", cur: 70_100_000, prev: 46_600_000, bold: true, positive: true },
      ],
    };
  }
  if (type === "balance") {
    return {
      title: "Balans hisoboti (F-1)",
      lines: [
        { label: "Aylanma aktivlar", cur: 320_000_000, prev: 280_000_000 },
        { label: "Uzoq muddatli aktivlar", cur: 180_000_000, prev: 175_000_000 },
        { label: "Jami aktivlar", cur: 500_000_000, prev: 455_000_000, bold: true },
        { label: "Majburiyatlar", cur: 210_000_000, prev: 205_000_000 },
        { label: "Kapital", cur: 290_000_000, prev: 250_000_000, bold: true, positive: true },
      ],
    };
  }
  if (type === "qqs") {
    return {
      title: "QQS deklaratsiyasi",
      lines: [
        { label: "Soliqqa tortiladigan aylanma", cur: 486_200_000, prev: 0 },
        { label: "Hisoblangan QQS (12%)", cur: 58_344_000, prev: 0 },
        { label: "Hisobga olinadigan QQS", cur: -41_200_000, prev: 0 },
        { label: "To'lanadigan QQS", cur: 17_144_000, prev: 0, bold: true, positive: true },
      ],
    };
  }
  return {
    title: "Pul oqimi hisoboti",
    lines: [
      { label: "Operatsion faoliyatdan", cur: 88_400_000, prev: 71_200_000 },
      { label: "Investitsion faoliyatdan", cur: -24_000_000, prev: -12_000_000 },
      { label: "Sof pul oqimi", cur: 64_400_000, prev: 59_200_000, bold: true, positive: true },
    ],
  };
}
