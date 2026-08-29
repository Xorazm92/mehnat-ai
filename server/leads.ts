"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function listLeads() {
  const session = await auth();
  if (!session) return { error: "Avtorizatsiya kerak" };

  const leads = await prisma.lead.findMany({
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      inn: true,
      source: true,
      status: true,
      note: true,
      assignedTo: { select: { id: true, fullName: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return { leads };
}

export async function createLead(data: {
  name: string;
  phone?: string;
  email?: string;
  inn?: string;
  source?: string;
  note?: string;
}) {
  const session = await auth();
  if (!session) return { error: "Avtorizatsiya kerak" };

  if (!["admin", "super_admin"].includes(session.user.role)) {
    return { error: "Faqat admin yaratishi mumkin" };
  }

  const lead = await prisma.lead.create({
    data: {
      name: data.name,
      phone: data.phone,
      email: data.email,
      inn: data.inn,
      source: data.source,
      note: data.note,
    },
    select: { id: true, name: true, status: true, createdAt: true },
  });

  return { lead };
}

export async function updateLeadStatus(
  id: string,
  status: string
) {
  const session = await auth();
  if (!session) return { error: "Avtorizatsiya kerak" };

  const lead = await prisma.lead.update({
    where: { id },
    data: { status: status as "new" | "contacted" | "qualified" | "proposal" | "negotiation" | "won" | "lost" },
    select: { id: true, status: true },
  });

  return { lead };
}

export async function assignLead(leadId: string, userId: string) {
  const session = await auth();
  if (!session) return { error: "Avtorizatsiya kerak" };

  const lead = await prisma.lead.update({
    where: { id: leadId },
    data: { assignedToId: userId },
    select: { id: true, assignedTo: { select: { id: true, fullName: true } } },
  });

  return { lead };
}
