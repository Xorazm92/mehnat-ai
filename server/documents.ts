"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/permissions";

// =====================================================
// DOCUMENTS (Hujjatlar) — havola/URL asosida
// =====================================================

export async function getDocuments(companyId?: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id as string;
  const role = session.user.role as string;

  // Senior rollar barcha firmalar hujjatlarini; accountant faqat o'ziga biriktirilgan
  const companyFilter = isSeniorRole(role)
    ? {}
    : { company: { accountantId: userId } };

  return prisma.document.findMany({
    where: {
      ...companyFilter,
      ...(companyId ? { companyId } : {}),
    },
    include: {
      company: { select: { id: true, name: true } },
    },
    orderBy: { uploadedAt: "desc" },
  });
}

export async function createDocument(data: {
  companyId: string;
  name: string;
  filePath: string;
  mimeType?: string;
  fileSize?: number;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  const userId = session.user.id as string;

  if (!isSeniorRole(role)) {
    const company = await prisma.company.findUnique({ where: { id: data.companyId } });
    if (company?.accountantId !== userId) throw new Error("Forbidden");
  }

  return prisma.document.create({
    data: { ...data, uploadedBy: userId },
  });
}

export async function deleteDocument(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isSeniorRole(role)) throw new Error("Forbidden");

  return prisma.document.delete({ where: { id } });
}
