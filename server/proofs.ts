"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { companyScopeWhere, companyRelations, assertCompanyPermission } from "@/lib/access";
import { isCompanyReviewer } from "@/lib/reportPermissions";
import { serialize } from "@/lib/serialize";
import { FIELD_TO_DB_COLUMN } from "@/lib/operationTemplates";
import { normalizePeriodKey, isFuturePeriod, formatPeriodLabel } from "@/lib/periods";
import type { OperationFieldKey } from "@/types";
import { updateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { syncProofToObligation } from "@/lib/obligationBridge";

// =====================================================
// REPORT PROOFS — Buxgalter topshirgan skrinshot dalili + nazoratchi tasdig'i
// =====================================================

const REVIEWER_ROLES = ["supervisor", "chief_accountant", "admin", "super_admin"];

/**
 * HISOBOT FAYLI CHEGARALARI.
 *
 * Fayl `imageData` kabi base64 bo'lib BAZADA yotadi, shuning uchun chegara
 * kod tomonda majburlanishi shart — busiz bitta 50 MB'lik skan bazani ham,
 * har kunlik `pg_dump` ni ham cho'ktirardi.
 *
 * base64 xom hajmdan ~33% katta bo'ladi, shu sabab tekshiruv SATR uzunligi
 * bo'yicha, ya'ni haqiqiy saqlanadigan hajm bo'yicha.
 */
const FILE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const FILE_ALLOWED = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
  "application/vnd.ms-excel", // xls
];

function assertProofFile(fileData?: string, fileType?: string): void {
  if (!fileData) return; // fayl ixtiyoriy
  if (!fileData.startsWith("data:")) throw new Error("Fayl formati noto'g'ri");
  if (!fileType || !FILE_ALLOWED.includes(fileType)) {
    throw new Error("Faqat PDF, Excel yoki rasm biriktirish mumkin");
  }
  if (fileData.length > FILE_MAX_BYTES) {
    const mb = (fileData.length / 1024 / 1024).toFixed(1);
    throw new Error(`Fayl juda katta (${mb} MB). Chegara — 2 MB.`);
  }
}

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
  /** Hisobotning o'zi — ixtiyoriy, skrinshotga qo'shimcha. */
  fileData?: string;
  fileName?: string;
  fileType?: string;
  note?: string;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id as string;
  const role = session.user.role as string;

  const dbCol = dbColumnFor(input.colKey);

  // Davr KANONIK kalitga keltiriladi ("2026 Sentyabr" → "2026-09"). Busiz
  // matnli davr bilan saqlangan dalil ISO davr bilan ochilgan ekranda
  // qat'iy tenglik tufayli JIMGINA ko'rinmay qolardi.
  const period = normalizePeriodKey(input.period);

  if (!input.imageData || !input.imageData.startsWith("data:image/")) {
    throw new Error("Skrinshot (rasm) talab qilinadi");
  }
  assertProofFile(input.fileData, input.fileType);
  // KELAJAK DAVR — hisobot oldindan "topshirilishi" mumkin emas. Chegara
  // SERVERDA: kalendarni to'sish faqat qulaylik, haqiqiy to'siq shu yerda.
  if (isFuturePeriod(period)) {
    throw new Error(
      `${formatPeriodLabel(period)} — kelajak davr. Hisobotni oldindan topshirib bo'lmaydi.`,
    );
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
  const deepLink = `/reports?company=${input.companyId}&col=${input.colKey}&period=${encodeURIComponent(period)}`;

  // 1) Dalilni saqlash (yangi topshiriq — holat "pending", eski tekshiruv tozalanadi)
  const proof = await prisma.reportProof.upsert({
    where: {
      companyId_period_colKey: {
        companyId: input.companyId,
        period: period,
        colKey: input.colKey,
      },
    },
    create: {
      companyId: input.companyId,
      period: period,
      colKey: input.colKey,
      imageData: input.imageData,
      fileData: input.fileData ?? null,
      fileName: input.fileName ?? null,
      fileType: input.fileType ?? null,
      note: input.note ?? null,
      status: "pending",
      submittedById: userId,
      submittedByName: myName,
    },
    update: {
      imageData: input.imageData,
      // Qayta topshirishda fayl berilmasa ESKISI O'CHADI: aks holda yangi
      // skrinshot eski faylga yopishib qolib, nazoratchi mos kelmagan
      // hujjatni ko'rardi.
      fileData: input.fileData ?? null,
      fileName: input.fileName ?? null,
      fileType: input.fileType ?? null,
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
    where: { companyId_period: { companyId: input.companyId, period: period } },
    create: { companyId: input.companyId, period: period, [dbCol]: "topshirildi" } as Prisma.MonthlyReportUncheckedCreateInput,
    update: { [dbCol]: "topshirildi" },
  });

  // 2b) Majburiyat statusini "sent" ga o'tkazish + yuborish urinishini dalil
  // bilan yozish (Obligation bridge — manba shu yerda yangilanadi)
  await syncProofToObligation({
    companyId: input.companyId,
    period: period,
    colKey: input.colKey,
    targetStatus: "sent",
    proofId: proof.id,
    actorId: userId,
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

  updateTag("operations");
  updateTag("notifications");
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
    period: normalizePeriodKey(period),
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

  // `fileData` ATAYLAB tanlanmaydi: u 2 MB gacha base64 va oyna har ochilganda
  // tarmoqdan o'tardi. Faylning O'ZI alohida yo'ldan olinadi
  // (`/api/proofs/[id]/file`), bu yerda faqat nomi va turi kerak — havolani
  // ko'rsatish uchun shuning o'zi yetadi.
  const proof = await prisma.reportProof.findUnique({
    where: { companyId_period_colKey: { companyId, period: normalizePeriodKey(period), colKey } },
    select: {
      id: true, companyId: true, period: true, colKey: true,
      imageData: true, fileName: true, fileType: true, note: true, status: true,
      submittedById: true, submittedByName: true, submittedAt: true,
      reviewedById: true, reviewedByName: true, reviewedAt: true, rejectReason: true,
    },
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
  const period = normalizePeriodKey(input.period);

  const proof = await prisma.reportProof.findUnique({
    where: {
      companyId_period_colKey: {
        companyId: input.companyId,
        period: period,
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
    where: { companyId_period: { companyId: input.companyId, period: period } },
    create: { companyId: input.companyId, period: period, [dbCol]: cellValue } as Prisma.MonthlyReportUncheckedCreateInput,
    update: { [dbCol]: cellValue },
  });

  // Majburiyat statusini "accepted" yoki "rejected" ga o'tkazish + oxirgi
  // yuborish urinishining natijasini yopish (Obligation bridge)
  await syncProofToObligation({
    companyId: input.companyId,
    period: period,
    colKey: input.colKey,
    targetStatus: input.decision === "approved" ? "accepted" : "rejected",
    proofId: proof.id,
    actorId: userId,
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

    const deepLink = `/reports?company=${input.companyId}&col=${input.colKey}&period=${encodeURIComponent(period)}`;
    await prisma.notification.create({
      data: { userId: proof.submittedById, type: "status_change", title, message, link: deepLink },
    });
  }

  updateTag("operations");
  updateTag("notifications");
  return { ok: true, cellValue };
}
