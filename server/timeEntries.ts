"use server";

// =====================================================
// TIME ENTRY server actions (Faza C2)
// =====================================================
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/auditTrail";
import { companyScopeWhere, assertCompanyPermission, type Actor } from "@/lib/access";
import { resolveRate, computeCost, type RatePeriod } from "@/lib/timeCost";
import { revalidateTag } from "next/cache";
import type { Prisma, TimeSource } from "@prisma/client";

async function requireActor(): Promise<Actor> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  return { id: session.user.id, role: session.user.role as string };
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) throw new Error("Sana formati noto'g'ri (YYYY-MM-DD)");
  return new Date(Date.UTC(y, m - 1, d));
}

export interface LogTimeInput {
  minutes: number;
  date: string; // YYYY-MM-DD
  companyId?: string;
  taskId?: string;
  obligationId?: string;
  activityType?: string;
  note?: string;
  source?: TimeSource;
  userId?: string; // faqat senior boshqa xodim uchun kirita oladi
}

export async function logTime(input: LogTimeInput) {
  const actor = await requireActor();
  if (!input.minutes || input.minutes <= 0) throw new Error("Daqiqa musbat bo'lishi kerak");
  const userId = input.userId && isSeniorRole(actor.role) ? input.userId : actor.id;

  const entry = await prisma.timeEntry.create({
    data: {
      userId,
      companyId: input.companyId ?? null,
      taskId: input.taskId ?? null,
      obligationId: input.obligationId ?? null,
      date: parseDate(input.date),
      minutes: input.minutes,
      activityType: input.activityType?.trim() || null,
      note: input.note?.trim() || null,
      source: input.source ?? "manual",
      createdBy: actor.id,
    },
    select: { id: true },
  });
  await recordAuditLog({ userId: actor.id, action: "create", tableName: "TimeEntry", recordId: entry.id, newData: { userId, minutes: input.minutes } });
  revalidateTag("time-entries", "max");
  return entry;
}

export interface TimeFilter {
  companyId?: string;
  mine?: boolean;
  from?: string;
  to?: string;
}

export async function getTimeEntries(filter: TimeFilter = {}) {
  const actor = await requireActor();
  const scope: Prisma.TimeEntryWhereInput = isSeniorRole(actor.role)
    ? {}
    : { OR: [{ userId: actor.id }, { company: companyScopeWhere(actor) }] };
  const dateFilter =
    filter.from || filter.to
      ? { date: { ...(filter.from ? { gte: parseDate(filter.from) } : {}), ...(filter.to ? { lte: parseDate(filter.to) } : {}) } }
      : {};

  return prisma.timeEntry.findMany({
    where: {
      ...scope,
      ...(filter.companyId ? { companyId: filter.companyId } : {}),
      ...(filter.mine ? { userId: actor.id } : {}),
      ...dateFilter,
    },
    include: { company: { select: { name: true } } },
    orderBy: { date: "desc" },
    take: 500,
  });
}

export async function deleteTimeEntry(id: string) {
  const actor = await requireActor();
  const e = await prisma.timeEntry.findUnique({ where: { id }, select: { userId: true, createdBy: true } });
  if (!e) throw new Error("Yozuv topilmadi");
  if (!isSeniorRole(actor.role) && e.userId !== actor.id && e.createdBy !== actor.id) {
    throw new Error("Bu yozuvni o'chirishga ruxsatingiz yo'q");
  }
  await prisma.timeEntry.delete({ where: { id } });
  await recordAuditLog({ userId: actor.id, action: "delete", tableName: "TimeEntry", recordId: id });
  revalidateTag("time-entries", "max");
  return { ok: true };
}

/**
 * Firma bo'yicha davr ichidagi mehnat vaqti + TANNARX (Faza D margin kirishi).
 * Har yozuvning tannarxi shu sanadagi amaldagi stavka bilan hisoblanadi.
 */
export async function getCompanyTimeCost(companyId: string, from: string, to: string) {
  const actor = await requireActor();
  await assertCompanyPermission(prisma, actor, companyId, "company:view");

  const entries = await prisma.timeEntry.findMany({
    where: { companyId, date: { gte: parseDate(from), lte: parseDate(to) } },
    select: { userId: true, date: true, minutes: true },
  });
  const userIds = [...new Set(entries.map((e) => e.userId))];
  const rates = await prisma.employeeCostRate.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, hourlyRate: true, effectiveFrom: true, effectiveTo: true },
  });
  const byUser = new Map<string, RatePeriod[]>();
  for (const r of rates) {
    const arr = byUser.get(r.userId) ?? [];
    arr.push({ hourlyRate: Number(r.hourlyRate), effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo });
    byUser.set(r.userId, arr);
  }

  let totalMinutes = 0;
  let totalCost = 0;
  for (const e of entries) {
    totalMinutes += e.minutes;
    totalCost += computeCost(e.minutes, resolveRate(byUser.get(e.userId) ?? [], e.date));
  }
  return { entryCount: entries.length, totalMinutes, totalCost };
}
