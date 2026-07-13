"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/permissions";
import { serialize } from "@/lib/serialize";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

// =====================================================
// CLIENT CREDENTIALS (Soliq/Didox/Bank kirish ma'lumotlari)
// Parollar bazada AES-256-GCM bilan shifrlanadi (lib/crypto.ts).
// =====================================================

// Firma bo'yicha kirish huquqi: senior rollar yoki biriktirilgan xodim
async function assertCompanyAccess(companyId: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const role = session.user.role as string;
  if (isSeniorRole(role)) return session;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { accountantId: true, bankClientId: true },
  });
  if (!company || (company.accountantId !== userId && company.bankClientId !== userId)) {
    throw new Error("Forbidden");
  }
  return session;
}

export async function getClientCredentials(companyId: string) {
  await assertCompanyAccess(companyId);

  const rows = await prisma.clientCredential.findMany({
    where: { companyId },
    orderBy: { updatedAt: "desc" },
  });

  // Ko'rish huquqi bor foydalanuvchiga parol ochiq qaytadi (UI "ko'z" tugmasi uchun)
  return serialize(
    rows.map((r) => ({ ...r, encryptedPassword: decryptSecret(r.encryptedPassword) }))
  );
}

export async function createClientCredential(data: {
  companyId: string;
  serviceName: string;
  loginId: string;
  password?: string;
  notes?: string;
}) {
  const session = await assertCompanyAccess(data.companyId);

  if (!data.serviceName?.trim() || !data.loginId?.trim()) {
    throw new Error("Xizmat nomi va login kiritilishi shart");
  }

  const row = await prisma.clientCredential.create({
    data: {
      companyId: data.companyId,
      serviceName: data.serviceName.trim(),
      loginId: data.loginId.trim(),
      encryptedPassword: data.password ? encryptSecret(data.password) : "",
      notes: data.notes || null,
      updatedBy: session.user.id,
    },
  });

  return serialize({ ...row, encryptedPassword: data.password ?? "" });
}

export async function deleteClientCredential(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const row = await prisma.clientCredential.findUnique({
    where: { id },
    select: { companyId: true },
  });
  if (!row) throw new Error("Ma'lumot topilmadi");

  await assertCompanyAccess(row.companyId);
  await prisma.clientCredential.delete({ where: { id } });
  return { ok: true };
}
