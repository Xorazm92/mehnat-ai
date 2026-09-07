"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { companyScopeWhere, companyRelations, assertCompanyPermission } from "@/lib/platform/access";
import { isCompanyReviewer } from "@/lib/reportPermissions";
import { notifyUsers } from "@/lib/notify";
import { evidenceStore, parseDataUrl } from "@/lib/evidenceStore";
import { serialize } from "@/lib/serialize";
import { FIELD_TO_DB_COLUMN } from "@/lib/operationTemplates";
import { proofScreensFor } from "@/lib/reportColumns";
import { normalizePeriodKey, isFuturePeriod, formatPeriodLabel } from "@/lib/periods";
import type { OperationFieldKey } from "@/types";
import { updateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { applyObligationStatus, type MatrixWriteOutcome } from "@/lib/domains/accounting/matrixWrite";
import { logger } from "@/lib/platform/logger";

/**
 * Majburiyat sinxronizatsiyasi dalil oqimini TO'XTATMAYDI — skrinshot
 * saqlangan bo'lsa u saqlangan bo'lib qolishi kerak. Lekin JIM ham qolmaydi:
 * eski `obligationBridge` har nosozlikda jimgina qaytardi va oylar davomida
 * deyarli hech narsa qilmaganini hech kim sezmadi (ADR-0009).
 */
/**
 * TOPSHIRISH URINISHI — dalil tarixi.
 *
 * Holat o'zgarishidan MUSTAQIL yoziladi: rad etilgandan keyingi qayta
 * topshirish ham, allaqachon "sent" turgan majburiyatga yangi skrinshot ham
 * alohida urinish. Bu yozuv birlashtirishda tushib qolgan edi — natijada
 * majburiyat "yuborilgan" bo'lib turardi-yu, ortida bitta ham urinish
 * bo'lmasdi va audit/KPI dalilni topa olmasdi.
 *
 * `storageRef` base64 saqlamaydi — u `ReportProof` yozuviga ishora qiladi.
 */
async function recordSubmissionAttempt(
  obligationId: string,
  colKey: string,
  proofId: string | null,
  actorId: string | null,
) {
  const attemptNo =
    (await prisma.obligationSubmission.count({ where: { obligationId } })) + 1;
  const submission = await prisma.obligationSubmission.create({
    data: {
      obligationId,
      attemptNo,
      status: "sent",
      sentAt: new Date(),
      sourceSystem: "asro",
      createdById: actorId,
    },
    select: { id: true },
  });
  if (proofId) {
    await prisma.submissionEvidence.create({
      data: {
        submissionId: submission.id,
        type: "screenshot",
        storageRef: `reportProof:${proofId}`,
        note: `Matritsa ustuni: ${colKey}`,
        createdById: actorId,
      },
    });
  }
}

/** Nazoratchi qarori oxirgi urinishga yoziladi (qabul qilindi / rad etildi). */
async function closeSubmissionAttempt(
  obligationId: string,
  decision: "accepted" | "rejected",
) {
  const latest = await prisma.obligationSubmission.findFirst({
    where: { obligationId },
    orderBy: { attemptNo: "desc" },
    select: { id: true },
  });
  if (!latest) return;
  const now = new Date();
  await prisma.obligationSubmission.update({
    where: { id: latest.id },
    data:
      decision === "accepted"
        ? { status: "accepted", acceptedAt: now }
        : { status: "rejected", rejectedAt: now },
  });
}

function reportSync(outcome: MatrixWriteOutcome, ctx: Record<string, unknown>) {
  if (outcome.ok) return;
  logger.warn({ event: "matrix.obligation_sync_failed", reason: outcome.reason, detail: outcome.detail, ...ctx },
    "matritsa yozuvi majburiyatga tushmadi");
}

// =====================================================
// REPORT PROOFS — Buxgalter topshirgan skrinshot dalili + nazoratchi tasdig'i
// =====================================================

/**
 * HISOBOT FAYLI CHEGARALARI.
 *
 * Fayl endi diskdagi omborda (`lib/evidenceStore.ts`), lekin chegara baribir
 * kod tomonda majburlanadi — busiz bitta 50 MB'lik skan omborni ham, uning
 * kunlik arxivini ham cho'ktirardi.
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
  /**
   * IKKINCHI SKRINSHOT — faqat ikki ekran talab qiladigan ustunlarda
   * (`lib/reportColumns.ts` `PROOF_SCREENS`). Boshqa ustunlarda berilsa
   * saqlanadi, lekin majburiy emas.
   */
  imageData2?: string;
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
  // IKKI EKRANLI USTUNLAR. Chegara SERVERDA: oyna ikkinchi slotni ko'rsatadi,
  // lekin server action to'g'ridan-to'g'ri ham chaqirilishi mumkin va yarim
  // dalil "topshirildi" holatini ochib yuborardi.
  const screens = proofScreensFor(input.colKey);
  if (input.imageData2 && !input.imageData2.startsWith("data:image/")) {
    throw new Error("Ikkinchi skrinshot rasm formatida bo'lishi kerak");
  }
  if (screens.length > 1 && !input.imageData2) {
    throw new Error(
      `"${input.colLabel || input.colKey}" uchun ${screens.length} ta skrinshot talab qilinadi`,
    );
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

  // 1) Fayllar OMBORGA, bazaga faqat havola.
  //
  // Bazada base64 saqlash `ReportProof` jadvalini 128 MB ga olib chiqqandi
  // (1 454 qator) va har `pg_dump` shuni ko'tarib yurardi. Ombor
  // mazmun-adresli, ya'ni bir xil skrinshotni ikki marta yuklash bepul.
  const image = parseDataUrl(input.imageData);
  const stored = await evidenceStore.put(image.bytes, image.mime);

  const image2 = input.imageData2 ? parseDataUrl(input.imageData2) : null;
  const stored2 = image2 ? await evidenceStore.put(image2.bytes, image2.mime) : null;

  const file = input.fileData ? parseDataUrl(input.fileData) : null;
  const storedFile = file ? await evidenceStore.put(file.bytes, file.mime) : null;

  // 1b) Dalilni saqlash (yangi topshiriq — holat "pending", eski tekshiruv tozalanadi)
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
      imageRef: stored.storageRef,
      imageRef2: stored2?.storageRef ?? null,
      fileRef: storedFile?.storageRef ?? null,
      // `null`, bo'sh satr EMAS: baytlar diskda, bazada esa "ma'lumot yo'q".
      // Ustun D1 da nullable qilindi aynan shuning uchun.
      imageData: null,
      fileData: null,
      fileName: input.fileName ?? null,
      fileType: input.fileType ?? null,
      note: input.note ?? null,
      status: "pending",
      submittedById: userId,
      submittedByName: myName,
    },
    update: {
      imageRef: stored.storageRef,
      // Qayta topshirishda ikkinchi rasm ham ALMASHADI (berilmasa — o'chadi):
      // aks holda yangi birinchi skrinshot eski ikkinchisiga yopishib qolardi.
      imageRef2: stored2?.storageRef ?? null,
      // Eski base64 qoldig'i qayta topshirishda tozalanadi — aks holda
      // ko'chirilmagan qator yangi rasm bilan eski baytlarni yonma-yon
      // saqlab qolardi va o'qish yo'li eskisini ko'rsatardi.
      imageData: null,
      // Qayta topshirishda fayl berilmasa ESKISI O'CHADI: aks holda yangi
      // skrinshot eski faylga yopishib qolib, nazoratchi mos kelmagan
      // hujjatni ko'rardi.
      fileRef: storedFile?.storageRef ?? null,
      fileData: null,
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

  // 2b) Majburiyat statusini "sent" ga o'tkazish + topshirish urinishini yozish
  const sentOutcome = await applyObligationStatus(prisma, {
    companyId: input.companyId,
    period: input.period,
    matrixKey: input.colKey,
    status: "sent",
    userId,
    note: `proof:${input.colKey}`,
  });
  reportSync(sentOutcome, { companyId: input.companyId, period: input.period, colKey: input.colKey });
  if (sentOutcome.ok && "obligationId" in sentOutcome) {
    await recordSubmissionAttempt(sentOutcome.obligationId, input.colKey, proof.id, userId);
  }

  // 3) Xabar — FAQAT SHU FIRMANING tekshiruvchilariga.
  //
  // Ilgari bu yerda `SENIOR_REVIEW_ROLES` dagi BARCHA faol foydalanuvchiga
  // ham yozilardi. Natijasi prodda o'lchandi: har dalilga o'rtacha 9.4 ta
  // xabar, 13 596 ta `approval_request` qatoridan 13 577 tasi o'qilmagan,
  // bitta xodimda 2 267 ta — ya'ni qo'ng'iroq belgisi butunlay foydasiz
  // bo'lib qolgandi. Firmaga biriktirilmagan senior rollar endi kunlik
  // yig'ma xabar oladi (bot/cron/scheduler.ts).
  const reviewerIds = new Set<string>();
  if (company.supervisorId) reviewerIds.add(company.supervisorId);
  if (company.chiefAccountantId) reviewerIds.add(company.chiefAccountantId);
  reviewerIds.delete(userId); // o'ziga o'zi xabar bermaymiz

  if (reviewerIds.size) {
    // `dedupKey` dalilga bog'langan: rad etilgandan keyingi QAYTA topshirish
    // yangi `proof.id` bermaydi (katak bo'yicha upsert), shuning uchun kalitga
    // topshirish vaqti ham kiradi — aks holda ikkinchi topshirish jimgina
    // xabarsiz qolardi.
    await notifyUsers(prisma, {
      userIds: [...reviewerIds],
      type: "approval_request",
      title: "Tasdiqlash kutilmoqda ⏳",
      message: `${myName} "${company.name}" firmasining "${colLabel}" hisobotini skrinshot bilan topshirdi. Iltimos, tekshirib tasdiqlang.`,
      link: deepLink,
      channel: "proof-approval",
      dedupKey: `${proof.id}:${proof.submittedAt.toISOString()}`,
      // Ilova ichida ham bir topshirish = bir xabar (poygaga chidamli).
      dedupeKey: `proof:${proof.id}:${proof.submittedAt.toISOString()}`,
      // Tasdiq kutayotgan ish boshqa odamning ishini to'sib turadi.
      priority: "high",
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
      // Kim topshirgani — buxgalter O'Z kutilayotgan topshirig'ini qaytarib
      // olishi mumkin (lib/reportPermissions.checkCellWrite → evidence.isMine).
      submittedById: true,
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

  // NA `fileData`, NA `imageData` tanlanmaydi. Ikkalasi ham alohida yo'ldan
  // olinadi (`/api/proofs/[id]/file`, `.../image`) — bu yerda faqat nomi va
  // turi kerak. Ilgari skrinshot base64 bo'lib javobga tushardi va oyna har
  // ochilganda ~90 KB tarmoqdan o'tardi.
  const proof = await prisma.reportProof.findUnique({
    where: { companyId_period_colKey: { companyId, period: normalizePeriodKey(period), colKey } },
    select: {
      id: true, companyId: true, period: true, colKey: true,
      // Baytlar emas, faqat BORLIGI: ikkinchi rasm ham `/api/proofs/[id]/image?n=2`
      // orqali olinadi.
      imageRef2: true,
      fileName: true, fileType: true, note: true, status: true,
      submittedById: true, submittedByName: true, submittedAt: true,
      reviewedById: true, reviewedByName: true, reviewedAt: true, rejectReason: true,
    },
  });

  if (!proof) return null;
  const { imageRef2, ...rest } = proof;
  return serialize({ ...rest, hasSecondImage: !!imageRef2 });
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
      // Mas'uliyat slotdan YOKI "Jamoa" biriktiruvidan kelishi mumkin.
      contractAssignments: { where: { isActive: true }, select: { userId: true, role: true } },
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

  // Majburiyat statusini "accepted" yoki "rejected" ga o'tkazish + nazoratchi
  // qarorini oxirgi topshirish urinishiga yozish (dalil tarixi yopiladi).
  const decision = input.decision === "approved" ? ("accepted" as const) : ("rejected" as const);
  const reviewOutcome = await applyObligationStatus(prisma, {
    companyId: input.companyId,
    period: input.period,
    matrixKey: input.colKey,
    status: decision,
    userId,
    note: `proof-review:${input.colKey}`,
  });
  reportSync(reviewOutcome, { companyId: input.companyId, period: input.period, colKey: input.colKey });
  if (reviewOutcome.ok && "obligationId" in reviewOutcome) {
    await closeSubmissionAttempt(reviewOutcome.obligationId, decision);
  }

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
      data: {
        userId: proof.submittedById,
        type: "status_change",
        title,
        message,
        link: deepLink,
        // Rad etilgan hisobot xodimning ishini to'sib turadi.
        priority: "high",
      },
    });
  }

  updateTag("operations");
  updateTag("notifications");
  return { ok: true, cellValue };
}
