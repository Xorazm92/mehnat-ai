"use server";

// =====================================================
// DEADLINE TEMPLATE admin actions (Faza A / compliance engine)
// =====================================================
// Admin-gated CRUD. VERSIONLASH: active/approved template TAHRIRLANMAYDI —
// o'zgartirish uchun yangi versiya yaratiladi (createNewVersion), eski
// majburiyatlar templateVersion snapshoti bilan tarixda qoladi. LIFECYCLE:
// draft → approved → active → retired (inson tasdig'i, audit). Reviewer #4,#16.
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/auditTrail";
import { revalidateTag } from "next/cache";
import type { Periodicity, DeadlineAnchorType, WorkdayAdjustmentPolicy, TemplateLifecycle } from "@prisma/client";

async function requireAdmin(): Promise<string> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isAdminRole(session.user.role as string)) throw new Error("Forbidden");
  return session.user.id;
}

export interface TemplateInput {
  code: string;
  name: string;
  obligationType: string;
  periodicity: Periodicity;
  anchorType: DeadlineAnchorType;
  dueDay?: number | null;
  dueMonth?: number | null;
  offsetDays?: number | null;
  adjustmentPolicy: WorkdayAdjustmentPolicy;
  effectiveFrom: string; // ISO / YYYY-MM-DD
  effectiveTo?: string | null;
}

export async function getDeadlineTemplates() {
  await requireAdmin();
  const rows = await prisma.deadlineTemplate.findMany({
    include: { applicability: true, _count: { select: { obligations: true } } },
    orderBy: [{ code: "asc" }, { version: "desc" }],
  });
  return rows;
}

function toData(input: TemplateInput) {
  return {
    code: input.code.trim(),
    name: input.name.trim(),
    obligationType: input.obligationType.trim(),
    periodicity: input.periodicity,
    anchorType: input.anchorType,
    dueDay: input.anchorType === "fixed_day_of_month" ? (input.dueDay ?? null) : null,
    dueMonth: input.anchorType === "fixed_day_of_month" ? (input.dueMonth ?? null) : null,
    offsetDays: input.anchorType === "period_end_offset" ? (input.offsetDays ?? null) : null,
    adjustmentPolicy: input.adjustmentPolicy,
    effectiveFrom: new Date(input.effectiveFrom),
    effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
  };
}

export async function createDeadlineTemplate(input: TemplateInput) {
  const uid = await requireAdmin();
  const t = await prisma.deadlineTemplate.create({
    data: { ...toData(input), version: 1, lifecycle: "draft", active: true, createdBy: uid },
  });
  await recordAuditLog({ userId: uid, action: "create", tableName: "DeadlineTemplate", recordId: t.id, newData: { code: t.code, version: t.version } });
  revalidateTag("deadline-templates", "max");
  return t;
}

/** Faqat DRAFT tahrirlanadi (approved/active — immutable, yangi versiya kerak). */
export async function updateDeadlineTemplate(id: string, input: TemplateInput) {
  const uid = await requireAdmin();
  const cur = await prisma.deadlineTemplate.findUnique({ where: { id }, select: { lifecycle: true } });
  if (!cur) throw new Error("Shablon topilmadi");
  if (cur.lifecycle !== "draft") throw new Error("Faqat qoralama (draft) tahrirlanadi — yangi versiya yarating");
  await prisma.deadlineTemplate.update({ where: { id }, data: toData(input) });
  await recordAuditLog({ userId: uid, action: "update", tableName: "DeadlineTemplate", recordId: id });
  revalidateTag("deadline-templates", "max");
  return { ok: true };
}

const LIFECYCLE_ORDER: TemplateLifecycle[] = ["draft", "approved", "active", "retired"];

export async function setTemplateLifecycle(id: string, lifecycle: TemplateLifecycle) {
  const uid = await requireAdmin();
  const cur = await prisma.deadlineTemplate.findUnique({ where: { id }, select: { lifecycle: true } });
  if (!cur) throw new Error("Shablon topilmadi");
  // Faqat ketma-ket oldinga (yoki active→retired). Orqaga qaytish yo'q.
  const from = LIFECYCLE_ORDER.indexOf(cur.lifecycle);
  const to = LIFECYCLE_ORDER.indexOf(lifecycle);
  if (to !== from + 1 && !(cur.lifecycle === "active" && lifecycle === "retired")) {
    throw new Error(`Noqonuniy lifecycle o'tishi: ${cur.lifecycle} → ${lifecycle}`);
  }
  const data: { lifecycle: TemplateLifecycle; approvedById?: string; approvedAt?: Date; active?: boolean } = { lifecycle };
  if (lifecycle === "approved") {
    data.approvedById = uid;
    data.approvedAt = new Date();
  }
  if (lifecycle === "retired") data.active = false;
  await prisma.deadlineTemplate.update({ where: { id }, data });
  await recordAuditLog({ userId: uid, action: "update", tableName: "DeadlineTemplate", recordId: id, oldData: { lifecycle: cur.lifecycle }, newData: { lifecycle } });
  revalidateTag("deadline-templates", "max");
  return { ok: true };
}

/** active/approved template'ni yangi DRAFT versiyaga klonlaydi (applicability bilan). */
export async function createNewVersion(id: string) {
  const uid = await requireAdmin();
  const src = await prisma.deadlineTemplate.findUnique({ where: { id }, include: { applicability: true } });
  if (!src) throw new Error("Shablon topilmadi");
  const maxV = await prisma.deadlineTemplate.aggregate({ where: { code: src.code }, _max: { version: true } });
  const nextVersion = (maxV._max.version ?? src.version) + 1;
  const t = await prisma.deadlineTemplate.create({
    data: {
      code: src.code,
      name: src.name,
      obligationType: src.obligationType,
      periodicity: src.periodicity,
      anchorType: src.anchorType,
      dueDay: src.dueDay,
      dueMonth: src.dueMonth,
      offsetDays: src.offsetDays,
      adjustmentPolicy: src.adjustmentPolicy,
      effectiveFrom: src.effectiveFrom,
      effectiveTo: src.effectiveTo,
      version: nextVersion,
      lifecycle: "draft",
      active: true,
      createdBy: uid,
      applicability: { create: src.applicability.map((a) => ({ criteriaType: a.criteriaType, criteriaValue: a.criteriaValue })) },
    },
  });
  await recordAuditLog({ userId: uid, action: "create", tableName: "DeadlineTemplate", recordId: t.id, newData: { code: t.code, version: nextVersion } });
  revalidateTag("deadline-templates", "max");
  return t;
}

export async function addTemplateApplicability(templateId: string, criteriaType: string, criteriaValue: string) {
  const uid = await requireAdmin();
  await prisma.templateApplicability.create({ data: { templateId, criteriaType: criteriaType.trim(), criteriaValue: criteriaValue.trim() } });
  await recordAuditLog({ userId: uid, action: "create", tableName: "TemplateApplicability", recordId: templateId, newData: { criteriaType, criteriaValue } });
  revalidateTag("deadline-templates", "max");
  return { ok: true };
}

export async function removeTemplateApplicability(id: string) {
  const uid = await requireAdmin();
  await prisma.templateApplicability.delete({ where: { id } });
  await recordAuditLog({ userId: uid, action: "delete", tableName: "TemplateApplicability", recordId: id });
  revalidateTag("deadline-templates", "max");
  return { ok: true };
}
