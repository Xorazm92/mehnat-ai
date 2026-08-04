"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { companyScopeWhere, companyRelations, assertCompanyPermission } from "@/lib/access";
import { isCompanyReviewer } from "@/lib/reportPermissions";
import { serialize } from "@/lib/serialize";
import { FIELD_TO_DB_COLUMN } from "@/lib/operationTemplates";
import type { OperationFieldKey } from "@/types";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { syncProofToObligation } from "@/lib/obligationBridge";

// =====================================================
// REPORT PROOFS — Buxgalter topshirgan skrinshot dalili + nazoratchi tasdig'i
// =====================================================

const REVIEWER_ROLES = ["supervisor", "chief_accountant", "admin", "super_admin"];

function dbColumnFor(colKey: string): string {
  const dbCol = FIELD_TO_DB_COLUMN[colKey as OperationFieldKey];
  if (!dbCol) throw new Error("Noto'g'ri ustun kaliti");
  return dbCol;
}

/**
 * Buxgalter hisobotni topshiradi: skrinshot + izohni saqlaydi, katakni
 * "topshirildi" holatiga o'tkazadi va nazoratchilarga xabar yuboradi.
 */
export async function saveReportProof(input: {
  companyId: string;
  period: string;
  colKey: string;
  colLabel?: string;
  imageData: string;
  note?: string;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id as string;
  const role = session.user.role as string;

  const dbCol = dbColumnFor(input.colKey);

  if (!input.imageData || !input.imageData.startsWith("data:image/")) {
    throw new Error("Skrinshot (rasm) talab qilinadi");
  }

  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, name: true, accountantId: true, supervisorId: true, chiefAccountantId: true },
  });
  if (!company) throw new Error("Firma topilmadi");

  // Firma portfelda bo'lishi shart (IDOR himoyasi)
  await assertCompanyPermission(prisma, { id: userId, role }, input.companyId, "proof:submit");

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
  const myName = me?.fullName || session.user.name || "Buxgalter";
  const colLabel = input.colLabel || input.colKey;
  const deepLink = `/reports?company=${input.companyId}&col=${input.colKey}&period=${encodeURIComponent(input.period)}`;

  // 1) Dalilni saqlash (yangi topshiriq — holat "pending", eski tekshiruv tozalanadi)
  await prisma.reportProof.upsert({
    where: {
      companyId_period_colKey: {
        companyId: input.companyId,
        period: input.period,
        colKey: input.colKey,
      },
    },
    create: {
      companyId: input.companyId,
      period: input.period,
      colKey: input.colKey,
      imageData: input.imageData,
      note: input.note ?? null,
      status: "pending",
      submittedById: userId,
      submittedByName: myName,
    },
    update: {
      imageData: input.imageData,
      note: input.note ?? null,
      status: "pending",
      submittedById: userId,
      submittedByName: myName,
      submittedAt: new Date(),
      reviewedById: null,
      reviewedByName: null,
      reviewedAt: null,
      rejectReason: null,
    },
  });

  // 2) Matritsa katagini "topshirildi" holatiga o'tkazish
  await prisma.monthlyReport.upsert({
    where: { companyId_period: { companyId: input.companyId, period: input.period } },
    create: { companyId: input.companyId, period: input.period, [dbCol]: "topshirildi" } as Prisma.MonthlyReportUncheckedCreateInput,
    update: { [dbCol]: "topshirildi" },
  });

  // 2b) Majburiyat statusini "sent" ga o'tkazish (Obligation bridge)
  await syncProofToObligation({
    companyId: input.companyId,
    period: input.period,
    colKey: input.colKey,
    targetStatus: "sent",
  });

  // 3) Nazoratchilarga xabar (firma nazoratchisi + barcha tekshiruvchi rollar)
  const reviewerIds = new Set<string>();
  if (company.supervisorId) reviewerIds.add(company.supervisorId);
  if (company.chiefAccountantId) reviewerIds.add(company.chiefAccountantId);

  const reviewers = await prisma.user.findMany({
    where: { role: { in: REVIEWER_ROLES as never }, isActive: true },
    select: { id: true },
  });
  reviewers.forEach((u) => reviewerIds.add(u.id));
  reviewerIds.delete(userId); // o'ziga o'zi xabar bermaymiz

  if (reviewerIds.size) {
    await prisma.notification.createMany({
      data: [...reviewerIds].map((rid) => ({
        userId: rid,
        type: "approval_request",
        title: "Tasdiqlash kutilmoqda ⏳",
        message: `${myName} "${company.name}" firmasining "${colLabel}" hisobotini skrinshot bilan topshirdi. Iltimos, tekshirib tasdiqlang.`,
        link: deepLink,
      })),
    });
  }

  revalidateTag("operations", "max");
  revalidateTag("notifications", "max");
  return { ok: true };
}

/**
 * Berilgan davr uchun barcha dalillarning YENGIL metama'lumoti (rasm YO'Q).
 * Matritsada 📎 belgisi va holat rangini ko'rsatish uchun ishlatiladi.
 */
export async function getReportProofsMeta(period: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id as string;
  const role = session.user.role as string;

  const where: Prisma.ReportProofWhereInput = {
    period,
    company: companyScopeWhere({ id: userId, role }),
  };

  const proofs = await prisma.reportProof.findMany({
    where,
    select: {
      companyId: true,
      colKey: true,
      status: true,
      note: true,
      submittedByName: true,
      submittedAt: true,
      reviewedByName: true,
      rejectReason: true,
    },
  });

  return serialize(proofs);
}

/**
 * Bitta katak dalilini to'liq (skrinshot bilan) olish — ko'rish/tekshirish oynasi uchun.
 */
export async function getReportProof(companyId: string, period: string, colKey: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id as string;
  const role = session.user.role as string;

  await assertCompanyPermission(prisma, { id: userId, role }, companyId, "proof:read");

  const proof = await prisma.reportProof.findUnique({
    where: { companyId_period_colKey: { companyId, period, colKey } },
  });

  return proof ? serialize(proof) : null;
}

/**
 * Nazoratchi dalilni tasdiqlaydi yoki rad etadi: katakni "+" / "-" ga o'tkazadi
 * va buxgalterga natijani xabar qiladi.
 */
export async function reviewReportProof(input: {
  companyId: string;
  period: string;
  colKey: string;
  colLabel?: string;
  decision: "approved" | "rejected";
  rejectReason?: string;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id as string;
  const role = session.user.role as string;

  // Faqat AYNAN SHU firmaning nazoratchisi tasdiqlay/rad eta oladi. Nazoratchi
  // o'zi buxgalteriyasini yuritadigan firmada o'z dalilini tasdiqlay olmaydi.
  const reviewCompany = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: {
      accountantId: true,
      supervisorId: true,
      chiefAccountantId: true,
      bankClientId: true,
      departmentRef: { select: { chiefAccountantId: true } },
    },
  });
  if (!reviewCompany) throw new Error("Firma topilmadi");
  if (!isCompanyReviewer(role, companyRelations(reviewCompany, userId))) {
    throw new Error("Bu firmada tasdiqlash huquqingiz yo'q");
  }

  const dbCol = dbColumnFor(input.colKey);

  const proof = await prisma.reportProof.findUnique({
    where: {
      companyId_period_colKey: {
        companyId: input.companyId,
        period: input.period,
        colKey: input.colKey,
      },
    },
  });
  if (!proof) throw new Error("Dalil topilmadi");

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
  const myName = me?.fullName || session.user.name || "Nazoratchi";
  const cellValue = input.decision === "approved" ? "+" : "-";

  await prisma.reportProof.update({
    where: { id: proof.id },
    data: {
      status: input.decision,
      reviewedById: userId,
      reviewedByName: myName,
      reviewedAt: new Date(),
      rejectReason: input.decision === "rejected" ? input.rejectReason ?? null : null,
    },
  });

  await prisma.monthlyReport.upsert({
    where: { companyId_period: { companyId: input.companyId, period: input.period } },
    create: { companyId: input.companyId, period: input.period, [dbCol]: cellValue } as Prisma.MonthlyReportUncheckedCreateInput,
    update: { [dbCol]: cellValue },
  });

  // Majburiyat statusini "accepted" yoki "rejected" ga o'tkazish (Obligation bridge)
  await syncProofToObligation({
    companyId: input.companyId,
    period: input.period,
    colKey: input.colKey,
    targetStatus: input.decision === "approved" ? "accepted" : "rejected",
  });

  // Buxgalterga natijani xabar qilish
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { name: true },
  });
  const colLabel = input.colLabel || input.colKey;

  if (proof.submittedById && proof.submittedById !== userId) {
    const title = input.decision === "approved" ? "Hisobot tasdiqlandi ✅" : "Hisobot rad etildi ❌";
    const message =
      input.decision === "approved"
        ? `${myName} "${company?.name}" — "${colLabel}" hisobotingizni tasdiqladi.`
        : `${myName} "${company?.name}" — "${colLabel}" hisobotingizni rad etdi.${input.rejectReason ? ` Sabab: ${input.rejectReason}` : ""}`;

    const deepLink = `/reports?company=${input.companyId}&col=${input.colKey}&period=${encodeURIComponent(input.period)}`;
    await prisma.notification.create({
      data: { userId: proof.submittedById, type: "status_change", title, message, link: deepLink },
    });
  }

  revalidateTag("operations", "max");
  revalidateTag("notifications", "max");
  return { ok: true, cellValue };
}
