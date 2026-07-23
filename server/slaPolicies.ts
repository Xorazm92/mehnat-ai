"use server";

// =====================================================
// SLA POLICY admin actions (Faza C1)
// =====================================================
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/auditTrail";
import { revalidateTag } from "next/cache";

async function requireAdmin(): Promise<string> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isAdminRole(session.user.role as string)) throw new Error("Forbidden");
  return session.user.id;
}

export async function getSlaPolicies() {
  await requireAdmin();
  return prisma.slaPolicy.findMany({ include: { _count: { select: { tasks: true, breaches: true } } }, orderBy: [{ active: "desc" }, { name: "asc" }] });
}

export interface SlaPolicyInput {
  name: string;
  taskType?: string | null;
  responseMinutes?: number | null;
  resolutionMinutes?: number | null;
  businessHoursOnly?: boolean;
}

export async function createSlaPolicy(input: SlaPolicyInput) {
  const uid = await requireAdmin();
  if (!input.name?.trim()) throw new Error("Nom majburiy");
  const p = await prisma.slaPolicy.create({
    data: {
      name: input.name.trim(),
      taskType: input.taskType?.trim() || null,
      responseMinutes: input.responseMinutes ?? null,
      resolutionMinutes: input.resolutionMinutes ?? null,
      businessHoursOnly: input.businessHoursOnly ?? false,
      createdBy: uid,
    },
    select: { id: true },
  });
  await recordAuditLog({ userId: uid, action: "create", tableName: "SlaPolicy", recordId: p.id, newData: { name: input.name } });
  revalidateTag("sla-policies", "max");
  return p;
}

export async function updateSlaPolicy(id: string, input: SlaPolicyInput) {
  const uid = await requireAdmin();
  await prisma.slaPolicy.update({
    where: { id },
    data: {
      name: input.name.trim(),
      taskType: input.taskType?.trim() || null,
      responseMinutes: input.responseMinutes ?? null,
      resolutionMinutes: input.resolutionMinutes ?? null,
      businessHoursOnly: input.businessHoursOnly ?? false,
    },
  });
  await recordAuditLog({ userId: uid, action: "update", tableName: "SlaPolicy", recordId: id });
  revalidateTag("sla-policies", "max");
  return { ok: true };
}

export async function setSlaPolicyActive(id: string, active: boolean) {
  const uid = await requireAdmin();
  await prisma.slaPolicy.update({ where: { id }, data: { active } });
  await recordAuditLog({ userId: uid, action: "update", tableName: "SlaPolicy", recordId: id, newData: { active } });
  revalidateTag("sla-policies", "max");
  return { ok: true };
}
