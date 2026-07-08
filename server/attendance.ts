"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/permissions";

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

  return prisma.attendance.findMany({
    where: {
      ...(targetUserId ? { userId: targetUserId } : {}),
      ...dateFilter,
    },
    include: {
      user: { select: { id: true, fullName: true, role: true } },
    },
    orderBy: [{ date: "desc" }],
  });
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

  const payload = {
    status: data.status,
    checkIn: toDateTime(data.checkIn),
    checkOut: toDateTime(data.checkOut),
    notes: data.notes,
  };

  if (existing) {
    return prisma.attendance.update({ where: { id: existing.id }, data: payload });
  }

  return prisma.attendance.create({
    data: { userId: data.userId, date: day, ...payload },
  });
}

export async function deleteAttendance(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isSeniorRole(role)) throw new Error("Forbidden");

  return prisma.attendance.delete({ where: { id } });
}
