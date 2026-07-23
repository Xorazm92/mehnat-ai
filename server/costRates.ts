"use server";

// =====================================================
// EMPLOYEE COST RATE admin actions (Faza C2)
// =====================================================
// Versionlangan (effective-dated). Yangi stavka qo'yilganda avvalgi ochiq davr
// avtomatik yopiladi (bir kun oldin) — davrlar bir-birini bosmaydi.
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

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) throw new Error("Sana formati noto'g'ri (YYYY-MM-DD)");
  return new Date(Date.UTC(y, m - 1, d));
}

export async function getUsersForRates() {
  await requireAdmin();
  return prisma.user.findMany({ where: { isActive: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } });
}

export async function getCostRates(userId?: string) {
  await requireAdmin();
  return prisma.employeeCostRate.findMany({
    where: userId ? { userId } : {},
    orderBy: [{ userId: "asc" }, { effectiveFrom: "desc" }],
  });
}

export async function setCostRate(userId: string, hourlyRate: number, effectiveFrom: string, note?: string) {
  const uid = await requireAdmin();
  if (!userId) throw new Error("Xodim majburiy");
  if (!(hourlyRate > 0)) throw new Error("Stavka musbat bo'lishi kerak");
  const from = parseDate(effectiveFrom);
  const dayBefore = new Date(from.getTime() - 86_400_000);

  await prisma.$transaction([
    // Avvalgi ochiq davrni yopamiz (effectiveTo yo'q, effectiveFrom < yangisi).
    prisma.employeeCostRate.updateMany({
      where: { userId, effectiveTo: null, effectiveFrom: { lt: from } },
      data: { effectiveTo: dayBefore },
    }),
    prisma.employeeCostRate.create({
      data: { userId, hourlyRate, effectiveFrom: from, note: note?.trim() || null, createdBy: uid },
    }),
  ]);
  await recordAuditLog({ userId: uid, action: "create", tableName: "EmployeeCostRate", recordId: userId, newData: { hourlyRate, effectiveFrom } });
  revalidateTag("cost-rates", "max");
  return { ok: true };
}

export async function removeCostRate(id: string) {
  const uid = await requireAdmin();
  await prisma.employeeCostRate.delete({ where: { id } });
  await recordAuditLog({ userId: uid, action: "delete", tableName: "EmployeeCostRate", recordId: id });
  revalidateTag("cost-rates", "max");
  return { ok: true };
}
