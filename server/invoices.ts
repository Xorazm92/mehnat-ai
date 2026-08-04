"use server";

// =====================================================
// INVOICE server actions (Faza D / billing)
// =====================================================
// Moliyaviy amal — senior + firma-scope (invoice:manage). Soft-delete (void).
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/auditTrail";
import { companyScopeWhere, assertCompanyPermission, type Actor } from "@/lib/access";
import { revalidateTag } from "next/cache";
import type { InvoiceStatus, Prisma } from "@prisma/client";

async function requireActor(): Promise<Actor> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  return { id: session.user.id, role: session.user.role as string };
}

export async function getInvoices(filter: { period?: string; companyId?: string } = {}) {
  const actor = await requireActor();
  const scope: Prisma.InvoiceWhereInput = { company: companyScopeWhere(actor) };
  return prisma.invoice.findMany({
    where: { deletedAt: null, ...scope, ...(filter.period ? { period: filter.period } : {}), ...(filter.companyId ? { companyId: filter.companyId } : {}) },
    include: { company: { select: { name: true } } },
    orderBy: [{ period: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
}

export async function createInvoice(input: { companyId: string; period: string; amount: number; dueAt?: string; notes?: string }) {
  const actor = await requireActor();
  await assertCompanyPermission(prisma, actor, input.companyId, "invoice:manage");
  if (!(input.amount > 0)) throw new Error("Summa musbat bo'lishi kerak");

  const inv = await prisma.invoice.create({
    data: {
      companyId: input.companyId,
      period: input.period,
      amount: input.amount,
      status: "sent",
      issuedAt: new Date(),
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      notes: input.notes?.trim() || null,
      createdBy: actor.id,
    },
    select: { id: true },
  });
  await recordAuditLog({ userId: actor.id, action: "create", tableName: "Invoice", recordId: inv.id, newData: { companyId: input.companyId, period: input.period, amount: input.amount } });
  revalidateTag("invoices", "max");
  return inv;
}

/** To'lov qayd etish — paidAmount ortadi, status avtomatik (partial/paid). */
export async function recordInvoicePayment(id: string, amount: number) {
  const actor = await requireActor();
  const inv = await prisma.invoice.findUnique({ where: { id }, select: { companyId: true, amount: true, paidAmount: true } });
  if (!inv) throw new Error("Hisob topilmadi");
  await assertCompanyPermission(prisma, actor, inv.companyId, "invoice:manage");
  if (!(amount > 0)) throw new Error("To'lov musbat bo'lishi kerak");

  const newPaid = Number(inv.paidAmount) + amount;
  const status: InvoiceStatus = newPaid >= Number(inv.amount) ? "paid" : "partial";
  await prisma.invoice.update({ where: { id }, data: { paidAmount: newPaid, status } });
  await recordAuditLog({ userId: actor.id, action: "update", tableName: "Invoice", recordId: id, newData: { paidAmount: newPaid, status } });
  revalidateTag("invoices", "max");
  return { ok: true };
}

export async function voidInvoice(id: string, reason: string) {
  const actor = await requireActor();
  const inv = await prisma.invoice.findUnique({ where: { id }, select: { companyId: true } });
  if (!inv) throw new Error("Hisob topilmadi");
  await assertCompanyPermission(prisma, actor, inv.companyId, "invoice:manage");
  await prisma.invoice.update({ where: { id }, data: { status: "void", deletedAt: new Date(), deletedBy: actor.id, deleteReason: reason || null } });
  await recordAuditLog({ userId: actor.id, action: "update", tableName: "Invoice", recordId: id, newData: { status: "void" } });
  revalidateTag("invoices", "max");
  return { ok: true };
}
