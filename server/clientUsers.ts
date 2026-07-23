"use server";

// =====================================================
// CLIENT USER admin + staff ticket actions (Faza F)
// =====================================================
// Admin client hisoblarini yaratadi (parol bir marta ko'rsatiladi). Staff
// (scoped) mijoz murojaatlariga javob beradi.
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole, isSeniorRole } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/auditTrail";
import { companyScopeWhere, type Actor } from "@/lib/access";
import { revalidateTag } from "next/cache";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";

async function requireAdmin(): Promise<string> {
  const session = await auth();
  if (!session || session.user.kind === "client") throw new Error("Unauthorized");
  if (!isAdminRole(session.user.role as string)) throw new Error("Forbidden");
  return session.user.id;
}
async function requireStaff(): Promise<Actor> {
  const session = await auth();
  if (!session || session.user.kind === "client") throw new Error("Unauthorized");
  return { id: session.user.id, role: session.user.role as string };
}

export async function getClientUsers() {
  await requireAdmin();
  return prisma.clientUser.findMany({ include: { company: { select: { name: true } } }, orderBy: { createdAt: "desc" } });
}

/** Yangi mijoz hisobi — parol FAQAT shu yerda qaytariladi (hash saqlanadi). */
export async function createClientUser(companyId: string, email: string, fullName: string) {
  const uid = await requireAdmin();
  if (!companyId || !email?.trim() || !fullName?.trim()) throw new Error("Firma, email va ism majburiy");
  const password = randomBytes(9).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 10);
  const c = await prisma.clientUser.create({
    data: { companyId, email: email.trim().toLowerCase(), fullName: fullName.trim(), passwordHash, createdBy: uid },
    select: { id: true, email: true },
  });
  await recordAuditLog({ userId: uid, action: "create", tableName: "ClientUser", recordId: c.id, newData: { companyId, email: c.email } });
  revalidateTag("client-users", "max");
  return { id: c.id, email: c.email, password }; // parol — faqat shu yerda
}

export async function setClientUserActive(id: string, active: boolean) {
  const uid = await requireAdmin();
  await prisma.clientUser.update({ where: { id }, data: { isActive: active } });
  await recordAuditLog({ userId: uid, action: "update", tableName: "ClientUser", recordId: id, newData: { isActive: active } });
  revalidateTag("client-users", "max");
  return { ok: true };
}

/** Staff (scoped) mijoz murojaatlarini ko'radi. */
export async function getStaffClientRequests(filter: { status?: string } = {}) {
  const actor = await requireStaff();
  const scope: Prisma.ClientRequestWhereInput = isSeniorRole(actor.role) ? {} : { company: companyScopeWhere(actor) };
  return prisma.clientRequest.findMany({
    where: { ...scope, ...(filter.status ? { status: filter.status } : {}) },
    include: { company: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function respondClientRequest(id: string, responseText: string) {
  const actor = await requireStaff();
  if (!responseText?.trim()) throw new Error("Javob bo'sh");
  const r = await prisma.clientRequest.findUnique({ where: { id }, select: { companyId: true } });
  if (!r) throw new Error("Murojaat topilmadi");
  // Obyekt-scope: senior hammani, boshqalar o'z firmalarini.
  if (!isSeniorRole(actor.role)) {
    const inScope = await prisma.company.findFirst({ where: { id: r.companyId, ...companyScopeWhere(actor) }, select: { id: true } });
    if (!inScope) throw new Error("Bu murojaatga ruxsatingiz yo'q");
  }
  await prisma.clientRequest.update({
    where: { id },
    data: { responseText: responseText.trim(), status: "answered", respondedBy: actor.id, respondedAt: new Date() },
  });
  await recordAuditLog({ userId: actor.id, action: "update", tableName: "ClientRequest", recordId: id, newData: { status: "answered" } });
  revalidateTag("portal", "max");
  return { ok: true };
}
