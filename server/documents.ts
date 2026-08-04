"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/permissions";
import { companyScopeWhere } from "@/lib/access";
import { serialize } from "@/lib/serialize";

// =====================================================
// DOCUMENTS (Hujjatlar) — havola/URL asosida
// =====================================================

export async function getDocuments(companyId?: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id as string;
  const role = session.user.role as string;

  // Faqat portfeldagi firmalarning hujjatlari (admin — hammasi)
  const companyFilter = { company: companyScopeWhere({ id: userId, role }) };

  return serialize(
    await prisma.document.findMany({
      where: {
        ...companyFilter,
        ...(companyId ? { companyId } : {}),
      },
      include: {
        company: { select: { id: true, name: true } },
      },
      orderBy: { uploadedAt: "desc" },
    })
  );
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

  if (!data.name?.trim()) throw new Error("Hujjat nomi kiritilishi shart");

  // filePath UI'da <a href> bo'lib ochiladi — faqat http(s) yoki ilova ichidagi
  // yo'lga ruxsat, aks holda saqlangan javascript:/data: havola XSS'ga aylanadi.
  const filePath = data.filePath?.trim() ?? "";
  const isSafeUrl =
    /^https?:\/\//i.test(filePath) || (filePath.startsWith("/") && !filePath.startsWith("//"));
  if (!isSafeUrl) {
    throw new Error("Hujjat havolasi http(s) URL bo'lishi kerak");
  }

  return serialize(
    await prisma.document.create({
      data: { ...data, name: data.name.trim(), filePath, uploadedBy: userId },
    })
  );
}

export async function deleteDocument(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isSeniorRole(role)) throw new Error("Forbidden");

  return serialize(await prisma.document.delete({ where: { id } }));
}
