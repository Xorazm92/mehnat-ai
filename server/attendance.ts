"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/permissions";
import { serialize } from "@/lib/serialize";
import { classifyArrival, aggregateMonthlyAttendance } from "@/lib/attendance";

// =====================================================
// ATTENDANCE (Davomat)
// =====================================================

export async function getAttendance(filters?: {
  date?: string; // "YYYY-MM-DD"
  from?: Date;
  to?: Date;
  userId?: string;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const currentUserId = session.user.id as string;
  const role = session.user.role as string;

  // Senior rollar hammani ko'radi; boshqalar faqat o'zini
  const targetUserId = isSeniorRole(role) ? filters?.userId : currentUserId;

  let dateFilter = {};
  if (filters?.date) {
    const start = new Date(filters.date);
    const end = new Date(filters.date);
    end.setDate(end.getDate() + 1);
    dateFilter = { date: { gte: start, lt: end } };
  } else if (filters?.from || filters?.to) {
    dateFilter = {
      date: {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      },
    };
  }

  return serialize(
    await prisma.attendance.findMany({
      where: {
        ...(targetUserId ? { userId: targetUserId } : {}),
        ...dateFilter,
      },
      include: {
        user: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: [{ date: "desc" }],
    })
  );
}

export async function upsertAttendance(data: {
  userId: string;
  date: string; // "YYYY-MM-DD"
  status: string; // present, absent, late, excused
  checkIn?: string; // "HH:mm"
  checkOut?: string;
  notes?: string;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isSeniorRole(role)) throw new Error("Forbidden");

  const day = new Date(data.date);
  const toDateTime = (time?: string) =>
    time ? new Date(`${data.date}T${time}:00`) : null;

  // Bir kunda bir foydalanuvchi uchun bitta yozuv (unique bo'lmasa ham qo'lda tekshiramiz)
  const existing = await prisma.attendance.findFirst({
    where: {
      userId: data.userId,
      date: { gte: day, lt: new Date(day.getTime() + 86400000) },
    },
  });

  const checkIn = toDateTime(data.checkIn);
  const payload = {
    status: data.status,
    checkIn,
    checkOut: toDateTime(data.checkOut),
    // Derive lateness from the check-in so KPI aggregation is consistent whether
    // the row came from e-jurnal or a manual entry.
    lateMinutes: checkIn ? classifyArrival(checkIn).lateMinutes : 0,
    source: "manual",
    notes: data.notes,
  };

  if (existing) {
    return serialize(
      await prisma.attendance.update({ where: { id: existing.id }, data: payload })
    );
  }

  return serialize(
    await prisma.attendance.create({
      data: { userId: data.userId, date: day, ...payload },
    })
  );
}

export async function deleteAttendance(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isSeniorRole(role)) throw new Error("Forbidden");

  return serialize(await prisma.attendance.delete({ where: { id } }));
}

/**
 * Bir oy uchun xodimning davomatidan KPI ko'rsatkichlarini (earlyDays,
 * lateMinutes, absentDays, ...) HISOBLAB beradi — nazoratchi qo'lda sanamasligi
 * uchun. Manba: e-jurnal (yoki qo'lda) to'ldirgan `Attendance` jadvali. Read-only
 * — MonthlyPerformance'ga yozmaydi; nazoratchi KPI kiritishда shundan foydalanadi.
 */
export async function deriveAttendanceKpi(employeeId: string, month: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const role = session.user.role as string;
  if (!isSeniorRole(role) && session.user.id !== employeeId) {
    throw new Error("Forbidden");
  }

  const [y, m] = month.split("-").map(Number);
  if (!y || !m) throw new Error("Noto'g'ri oy formati (YYYY-MM kutiladi)");
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 1);

  const rows = await prisma.attendance.findMany({
    where: { userId: employeeId, date: { gte: from, lt: to } },
    select: { status: true, checkIn: true, lateMinutes: true },
    orderBy: { date: "asc" },
  });

  return aggregateMonthlyAttendance(rows);
}
