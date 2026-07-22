"use server";

// =====================================================
// OBLIGATION server actions (Faza A / compliance engine)
// =====================================================
// Har amal: auth → actor → OBYEKT-scope + rol gate (assertCompanyPermission) →
// workflow qoidasi → yozuv + event + audit. IDOR himoyasi lib/access.ts'da
// (payload companyId almashtirilsa ham scope'dan o'tmaydi).
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { recordAuditLog } from "@/lib/auditTrail";
import { companyScopeWhere, assertCompanyPermission, type Actor } from "@/lib/access";
import { canTransition, permissionForTransition, timingPatch } from "@/lib/obligationWorkflow";
import { revalidateTag } from "next/cache";
import type { ObligationStatus, SubmissionStatus, EvidenceType, DelayReason } from "@prisma/client";

async function requireActor(): Promise<Actor> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  return { id: session.user.id, role: session.user.role as string };
}

const NOT_DONE: ObligationStatus[] = ["planned", "in_progress", "ready", "sent", "rejected"];

export interface ObligationFilter {
  status?: ObligationStatus;
  periodKey?: string;
  mine?: boolean; // faqat mas'ul men bo'lgan
  overdue?: boolean;
}

export async function getObligations(filter: ObligationFilter = {}) {
  const actor = await requireActor();
  const now = new Date();

  const rows = await prisma.obligation.findMany({
    where: {
      company: companyScopeWhere(actor),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.periodKey ? { periodKey: filter.periodKey } : {}),
      ...(filter.mine ? { responsibleUserId: actor.id } : {}),
      ...(filter.overdue ? { dueAt: { lt: now }, status: { in: NOT_DONE } } : {}),
    },
    include: {
      company: { select: { id: true, name: true } },
      template: { select: { id: true, name: true, obligationType: true } },
    },
    orderBy: [{ dueAt: "asc" }],
  });

  return rows.map((o) => ({
    ...o,
    isOverdue: o.dueAt.getTime() < now.getTime() && NOT_DONE.includes(o.status),
  }));
}

export async function getObligationById(id: string) {
  const actor = await requireActor();
  const o = await prisma.obligation.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true } },
      template: { select: { id: true, name: true, obligationType: true } },
      submissions: { include: { evidence: true }, orderBy: { attemptNo: "asc" } },
      statusEvents: { orderBy: { at: "asc" } },
      assignmentEvents: { orderBy: { at: "asc" } },
    },
  });
  if (!o) throw new Error("Majburiyat topilmadi");
  // Obyekt-scope: kompaniya ko'rish doirasida bo'lishi shart.
  await assertCompanyPermission(prisma, actor, o.companyId, "obligation:view");
  const now = Date.now();
  return { ...o, isOverdue: o.dueAt.getTime() < now && NOT_DONE.includes(o.status) };
}

export async function updateObligationStatus(id: string, toStatus: ObligationStatus, note?: string) {
  const actor = await requireActor();
  const o = await prisma.obligation.findUnique({ where: { id }, select: { id: true, companyId: true, status: true } });
  if (!o) throw new Error("Majburiyat topilmadi");

  await assertCompanyPermission(prisma, actor, o.companyId, permissionForTransition(toStatus));
  if (!canTransition(o.status, toStatus)) {
    throw new Error(`Noqonuniy o'tish: ${o.status} → ${toStatus}`);
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.obligation.update({
      where: { id },
      data: { status: toStatus, ...timingPatch(toStatus, now) },
    }),
    prisma.obligationStatusEvent.create({
      data: { obligationId: id, fromStatus: o.status, toStatus, byUserId: actor.id, note: note ?? null },
    }),
  ]);

  await recordAuditLog({
    userId: actor.id,
    action: "update",
    tableName: "Obligation",
    recordId: id,
    oldData: { status: o.status },
    newData: { status: toStatus },
  });
  revalidateTag("obligations", "max");
  return { ok: true };
}

export async function setDelayReason(id: string, reason: DelayReason, comment?: string) {
  const actor = await requireActor();
  const o = await prisma.obligation.findUnique({ where: { id }, select: { companyId: true } });
  if (!o) throw new Error("Majburiyat topilmadi");
  await assertCompanyPermission(prisma, actor, o.companyId, "delay-reason:mark");

  const now = new Date();
  await prisma.obligation.update({
    where: { id },
    data: {
      delayReason: reason,
      delayComment: comment ?? null,
      delayMarkedById: actor.id,
      delayMarkedAt: now,
      // Belgilash tasdiqlashni bekor qiladi (qayta ko'rib chiqilishi kerak).
      delayApprovedById: null,
      delayApprovedAt: null,
    },
  });
  await recordAuditLog({ userId: actor.id, action: "update", tableName: "Obligation", recordId: id, newData: { delayReason: reason } });
  revalidateTag("obligations", "max");
  return { ok: true };
}

/**
 * Kechikish sababini MANAGER tasdiqlaydi — faqat shundan keyin KPI exclusion'ga
 * yaroqli (reviewer #7). Belgilanmagan sababni tasdiqlab bo'lmaydi.
 */
export async function approveDelayReason(id: string) {
  const actor = await requireActor();
  const o = await prisma.obligation.findUnique({
    where: { id },
    select: { companyId: true, delayMarkedById: true },
  });
  if (!o) throw new Error("Majburiyat topilmadi");
  await assertCompanyPermission(prisma, actor, o.companyId, "delay-reason:approve");
  if (!o.delayMarkedById) throw new Error("Avval kechikish sababi belgilanishi kerak");

  await prisma.obligation.update({
    where: { id },
    data: { delayApprovedById: actor.id, delayApprovedAt: new Date() },
  });
  await recordAuditLog({ userId: actor.id, action: "update", tableName: "Obligation", recordId: id, newData: { delayApproved: true } });
  revalidateTag("obligations", "max");
  return { ok: true };
}

export async function reassignObligation(id: string, toUserId: string, reason?: string) {
  const actor = await requireActor();
  const o = await prisma.obligation.findUnique({
    where: { id },
    select: { companyId: true, responsibleUserId: true },
  });
  if (!o) throw new Error("Majburiyat topilmadi");
  await assertCompanyPermission(prisma, actor, o.companyId, "obligation:assign");

  const now = new Date();
  await prisma.$transaction([
    prisma.obligation.update({
      where: { id },
      data: { responsibleUserId: toUserId, assignedById: actor.id, assignedAt: now },
    }),
    prisma.obligationAssignmentEvent.create({
      data: { obligationId: id, fromUserId: o.responsibleUserId, toUserId, byUserId: actor.id, reason: reason ?? null },
    }),
  ]);
  await recordAuditLog({
    userId: actor.id,
    action: "update",
    tableName: "Obligation",
    recordId: id,
    oldData: { responsibleUserId: o.responsibleUserId },
    newData: { responsibleUserId: toUserId },
  });
  revalidateTag("obligations", "max");
  return { ok: true };
}

export interface EvidenceInput {
  type: EvidenceType;
  storageRef: string;
  note?: string;
}

/**
 * Yangi yuborish urinishi (attempt) + dalillar. attemptNo avtomatik ortadi.
 * externalId/sourceSystem — 1C (Faza B) uchun. Obligation statusi alohida
 * updateObligationStatus orqali o'zgartiriladi.
 */
export async function addSubmission(
  id: string,
  input: { status?: SubmissionStatus; externalId?: string; sourceSystem?: string; evidence?: EvidenceInput[] },
) {
  const actor = await requireActor();
  const o = await prisma.obligation.findUnique({ where: { id }, select: { companyId: true } });
  if (!o) throw new Error("Majburiyat topilmadi");
  await assertCompanyPermission(prisma, actor, o.companyId, "obligation:change-status");

  const prev = await prisma.obligationSubmission.count({ where: { obligationId: id } });
  const now = new Date();
  const submission = await prisma.obligationSubmission.create({
    data: {
      obligationId: id,
      attemptNo: prev + 1,
      status: input.status ?? "sent",
      sentAt: now,
      externalId: input.externalId ?? null,
      sourceSystem: input.sourceSystem ?? "asro",
      createdById: actor.id,
      evidence: input.evidence?.length
        ? { create: input.evidence.map((e) => ({ type: e.type, storageRef: e.storageRef, note: e.note ?? null, createdById: actor.id })) }
        : undefined,
    },
    include: { evidence: true },
  });
  await recordAuditLog({ userId: actor.id, action: "create", tableName: "ObligationSubmission", recordId: submission.id });
  revalidateTag("obligations", "max");
  return submission;
}
