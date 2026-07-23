"use server";

// =====================================================
// CLIENT PORTAL server actions (Faza F)
// =====================================================
// FAQAT client identity. Har so'rov session.companyId bilan izolyatsiya qilinadi
// — mijoz hech qachon boshqa firma ma'lumotini ko'rmaydi (companyId payload'dan
// OLINMAYDI, sessiyadan olinadi).
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { recordAuditLog } from "@/lib/auditTrail";
import { revalidateTag } from "next/cache";

async function requireClient(): Promise<{ id: string; companyId: string }> {
  const session = await auth();
  if (!session || session.user.kind !== "client" || !session.user.companyId) {
    throw new Error("Unauthorized");
  }
  return { id: session.user.id, companyId: session.user.companyId };
}

export async function getPortalOverview() {
  const { companyId } = await requireClient();
  const [company, openObligations, unpaidInvoices, openTickets] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    prisma.obligation.count({ where: { companyId, status: { in: ["planned", "in_progress", "ready", "sent", "rejected"] } } }),
    prisma.invoice.count({ where: { companyId, deletedAt: null, status: { in: ["sent", "partial", "overdue"] } } }),
    prisma.clientRequest.count({ where: { companyId, status: "open" } }),
  ]);
  return { companyName: company?.name ?? "", openObligations, unpaidInvoices, openTickets };
}

export async function getPortalObligations() {
  const { companyId } = await requireClient();
  const now = Date.now();
  const rows = await prisma.obligation.findMany({
    where: { companyId },
    include: {
      template: { select: { name: true, obligationType: true } },
      submissions: { include: { evidence: { select: { type: true, storageRef: true } } }, orderBy: { attemptNo: "desc" }, take: 1 },
    },
    orderBy: { dueAt: "desc" },
    take: 200,
  });
  return rows.map((o) => ({
    id: o.id,
    templateName: o.template.name,
    periodKey: o.periodKey,
    status: o.status as string,
    dueAt: o.dueAt.toISOString(),
    isOverdue: o.dueAt.getTime() < now && ["planned", "in_progress", "ready", "sent", "rejected"].includes(o.status),
    hasEvidence: (o.submissions[0]?.evidence.length ?? 0) > 0,
  }));
}

export async function getPortalInvoices() {
  const { companyId } = await requireClient();
  const rows = await prisma.invoice.findMany({
    where: { companyId, deletedAt: null },
    orderBy: [{ period: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: { id: true, period: true, amount: true, paidAmount: true, status: true, dueAt: true },
  });
  return rows.map((i) => ({ id: i.id, period: i.period, amount: Number(i.amount), paidAmount: Number(i.paidAmount), status: i.status as string, dueAt: i.dueAt ? i.dueAt.toISOString() : null }));
}

export async function getPortalRequests() {
  const { companyId } = await requireClient();
  return prisma.clientRequest.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 100 });
}

export async function createClientRequest(subject: string, message: string) {
  const { id, companyId } = await requireClient();
  if (!subject?.trim() || !message?.trim()) throw new Error("Mavzu va matn majburiy");
  const req = await prisma.clientRequest.create({
    data: { companyId, clientUserId: id, subject: subject.trim(), message: message.trim(), status: "open" },
    select: { id: true },
  });
  await recordAuditLog({ userId: null, action: "create", tableName: "ClientRequest", recordId: req.id, newData: { companyId, clientUserId: id } });
  revalidateTag("portal", "max");
  return req;
}
