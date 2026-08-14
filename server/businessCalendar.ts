"use server";

// =====================================================
// BUSINESS CALENDAR admin actions (Faza A / compliance engine)
// =====================================================
// Ish/dam olish/bayram kunlari — deadline calculator dueAt'ni ish kuniga
// surishда ishlatadi. Admin-gated. Sana UTC yarim tunda (@db.Date). Reviewer #16.
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/auditTrail";
import { updateTag } from "next/cache";

async function requireAdmin(): Promise<string> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isAdminRole(session.user.role as string)) throw new Error("Forbidden");
  return session.user.id;
}

/** "YYYY-MM-DD" → UTC yarim tun Date. */
function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) throw new Error("Sana formati noto'g'ri (YYYY-MM-DD)");
  return new Date(Date.UTC(y, m - 1, d));
}

export async function getCalendarDays(year?: number) {
  await requireAdmin();
  const where = year
    ? { date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } }
    : {};
  return prisma.businessCalendarDay.findMany({ where, orderBy: { date: "asc" } });
}

export interface CalendarDayInput {
  date: string; // YYYY-MM-DD
  isWorkday: boolean;
  isHoliday: boolean;
  name?: string;
}

export async function upsertCalendarDay(input: CalendarDayInput) {
  const uid = await requireAdmin();
  const date = parseDate(input.date);
  const row = await prisma.businessCalendarDay.upsert({
    where: { date },
    create: { date, isWorkday: input.isWorkday, isHoliday: input.isHoliday, name: input.name?.trim() || null, approvedById: uid, createdBy: uid },
    update: { isWorkday: input.isWorkday, isHoliday: input.isHoliday, name: input.name?.trim() || null, approvedById: uid },
  });
  await recordAuditLog({ userId: uid, action: "update", tableName: "BusinessCalendarDay", recordId: row.id, newData: { date: input.date, isWorkday: input.isWorkday, isHoliday: input.isHoliday } });
  updateTag("business-calendar");
  return row;
}

export async function deleteCalendarDay(id: string) {
  const uid = await requireAdmin();
  await prisma.businessCalendarDay.delete({ where: { id } });
  await recordAuditLog({ userId: uid, action: "delete", tableName: "BusinessCalendarDay", recordId: id });
  updateTag("business-calendar");
  return { ok: true };
}
