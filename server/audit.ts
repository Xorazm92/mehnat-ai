"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import { revalidateTag } from "next/cache";
import { Prisma, type AuditAction } from "@prisma/client";
import { serialize } from "@/lib/serialize";

export async function getAuditLogs(filters?: {
  userId?: string;
  tableName?: string;
  action?: AuditAction;
  from?: Date;
  to?: Date;
  limit?: number;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isAdminRole(role)) throw new Error("Forbidden");

  return serialize(
    await prisma.auditLog.findMany({
      where: {
        ...(filters?.userId ? { userId: filters.userId } : {}),
        ...(filters?.tableName ? { tableName: filters.tableName } : {}),
        ...(filters?.action ? { action: filters.action } : {}),
        ...(filters?.from || filters?.to
          ? {
              createdAt: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
      },
      include: {
        user: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      take: filters?.limit || 100,
    })
  );
}

export async function createAuditLog(data: {
  action: AuditAction;
  tableName: string;
  recordId?: string;
  oldData?: Prisma.InputJsonValue;
  newData?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
}) {
  const session = await auth();
  const userId = session?.user?.id;

  // Fire and forget — don't await in action handlers
  return serialize(
    await prisma.auditLog.create({
      data: {
        ...data,
        userId,
      },
    })
  );
}

// =====================================================
// NOTIFICATIONS
// =====================================================

export async function getNotifications(unreadOnly = false) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;

  return serialize(
    await prisma.notification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    })
  );
}

export async function markNotificationsRead(ids?: string[]) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;

  const result = await prisma.notification.updateMany({
    where: {
      userId,
      ...(ids ? { id: { in: ids } } : {}),
    },
    data: { isRead: true },
  });
  revalidateTag("notifications", "max");
  return serialize(result);
}

export async function createNotification(data: {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}) {
  // Internal server-side only — no auth check (called from server actions)
  const result = await prisma.notification.create({ data });
  revalidateTag("notifications", "max");
  return serialize(result);
}

export async function getUnreadCount() {
  const session = await auth();
  if (!session) return 0;

  const userId = session.user.id;

  return prisma.notification.count({
    where: { userId, isRead: false },
  });
}
