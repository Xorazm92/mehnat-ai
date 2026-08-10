"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/permissions";
import { companyScopeWhere } from "@/lib/access";
import { serialize } from "@/lib/serialize";
import { REPORT_TYPES } from "@/lib/reportTypes";
import { Prisma } from "@prisma/client";

// =====================================================
// MOLIYAVIY HISOBOT HUJJATLARI
// =====================================================
// Bu modul HUJJATNI yuritadi (shakl, imzo, topshirish fakti). "Qachon
// topshirilishi kerak" va "kim mas'ul" bu yerda EMAS — ular majburiyatda
// (`Obligation`). Ilgari ikkalasi ham shu jadvalda edi va bitta hisobot
// matritsada bir muddat, muddatlar ro'yxatida boshqa muddat bilan yurardi.
// Hujjat majburiyatga `obligationId` orqali bog'lanadi.

// Har kim faqat o'z portfelidagi firmalarning hisobotini ko'radi (admin — hammasini).
function reportScopeWhere(userId: string, role: string): Prisma.FinancialReportWhereInput {
  return { company: companyScopeWhere({ id: userId, role }) };
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
    orderBy: [{ createdAt: "desc" }],
    include: {
      company: { select: { name: true, inn: true } },
      // Muddat va mas'ul MANBADAN o'qiladi, hujjat qatoridan emas.
      obligation: { select: { dueAt: true, responsibleUserId: true, status: true } },
    },
  });

  const ids = [
    ...new Set(reports.map((r) => r.obligation?.responsibleUserId).filter(Boolean) as string[]),
  ];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.fullName]));

  return serialize(
    reports.map((r) => ({
      ...r,
      companyName: r.company.name,
      companyInn: r.company.inn,
      deadline: r.obligation?.dueAt ?? null,
      assignedTo: r.obligation?.responsibleUserId ?? null,
      assigneeName: r.obligation?.responsibleUserId
        ? nameOf.get(r.obligation.responsibleUserId) ?? null
        : null,
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
  // Muddat majburiyatdan keladi — shuning uchun hujjatsiz turgan majburiyat ham
  // bu ro'yxatga tushmaydi, faqat hujjati boshlangan ish ko'rinadi. To'liq
  // muddatlar ro'yxati — `/deadlines`.
  const soon = await prisma.financialReport.findMany({
    where: {
      obligationId: { not: null },
      status: { notIn: ["submitted"] },
      ...reportScopeWhere(userId, role),
    },
    orderBy: { obligation: { dueAt: "asc" } },
    take: 6,
    include: {
      company: { select: { name: true } },
      obligation: { select: { dueAt: true } },
    },
  });

  return serialize(
    soon.map((r) => {
      const deadline = r.obligation?.dueAt ?? null;
      const days = deadline ? Math.ceil((deadline.getTime() - now.getTime()) / 86400000) : null;
      return {
        id: r.id,
        typeLabel: REPORT_TYPES[r.type]?.label ?? r.type,
        companyName: r.company.name,
        deadline,
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
  /** Qaysi majburiyatning hujjati — muddat va mas'ul shundan meros bo'ladi. */
  obligationId?: string | null;
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
        obligationId: input.obligationId ?? null,
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
