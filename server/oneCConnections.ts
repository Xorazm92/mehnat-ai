"use server";

// =====================================================
// 1C CONNECTION admin actions (Faza B / integration layer)
// =====================================================
// Admin-gated: agent ulanishlari (token), firma mappinglari, sync reconciliation.
// Token FAQAT yaratishda bir marta qaytariladi (hash saqlanadi).
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/auditTrail";
import { revalidateTag } from "next/cache";
import { hashToken } from "@/lib/oneCIngest";
import { randomBytes } from "node:crypto";

async function requireAdmin(): Promise<string> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isAdminRole(session.user.role as string)) throw new Error("Forbidden");
  return session.user.id;
}

export async function getOneCConnections() {
  await requireAdmin();
  return prisma.oneCConnection.findMany({
    include: { _count: { select: { mappings: true, events: true, syncRuns: true } } },
    orderBy: { createdAt: "desc" },
  });
}

/** Yangi agent ulanishi — token bir marta qaytariladi (keyin faqat hash). */
export async function createOneCConnection(name: string) {
  const uid = await requireAdmin();
  if (!name?.trim()) throw new Error("Nom majburiy");
  const token = randomBytes(32).toString("hex");
  const conn = await prisma.oneCConnection.create({
    data: { name: name.trim(), tokenHash: hashToken(token), createdBy: uid },
    select: { id: true, name: true },
  });
  await recordAuditLog({ userId: uid, action: "create", tableName: "OneCConnection", recordId: conn.id, newData: { name: conn.name } });
  revalidateTag("onec", "max");
  return { id: conn.id, name: conn.name, token }; // token — FAQAT shu yerda
}

export async function setOneCConnectionActive(id: string, active: boolean) {
  const uid = await requireAdmin();
  await prisma.oneCConnection.update({ where: { id }, data: { active } });
  await recordAuditLog({ userId: uid, action: "update", tableName: "OneCConnection", recordId: id, newData: { active } });
  revalidateTag("onec", "max");
  return { ok: true };
}

export async function createOneCMapping(connectionId: string, externalOrgId: string, companyId: string) {
  const uid = await requireAdmin();
  const m = await prisma.oneCCompanyMapping.create({
    data: { connectionId, externalOrgId: externalOrgId.trim(), companyId },
    select: { id: true },
  });
  await recordAuditLog({ userId: uid, action: "create", tableName: "OneCCompanyMapping", recordId: m.id, newData: { externalOrgId, companyId } });
  revalidateTag("onec", "max");
  return m;
}

export async function removeOneCMapping(id: string) {
  const uid = await requireAdmin();
  await prisma.oneCCompanyMapping.delete({ where: { id } });
  await recordAuditLog({ userId: uid, action: "delete", tableName: "OneCCompanyMapping", recordId: id });
  revalidateTag("onec", "max");
  return { ok: true };
}

/** Reconciliation: hodisa statuslari bo'yicha son + oxirgi xatolar. */
export async function getSyncOverview() {
  await requireAdmin();
  const [byStatus, recentErrors, recentRuns] = await Promise.all([
    prisma.integrationEvent.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.syncError.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 }),
  ]);
  return { byStatus, recentErrors, recentRuns };
}
