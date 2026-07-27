"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole, isSeniorRole } from "@/lib/permissions";
import { revalidateTag } from "next/cache";
import type { AuditAction } from "@prisma/client";
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
      // Clamp — katta limit bilan butun jurnalni bir so'rovda tortib bo'lmasin.
      take: Math.min(Math.max(filters?.limit || 100, 1), 500),
    })
  );
}

/**
 * Bitta YOZUV tarixi — firma kartasi, xodim kartasi va h.k. uchun.
 *
 * `getAuditLogs` faqat adminlar uchun va butun jurnalni filtrlaydi; u yozuv
 * sahifasida ishlatib bo'lmaydi. Auditda E4 sifatida yozilgan muammo aynan
 * shu edi: `AuditLog` sodiqlik bilan yozilardi, lekin foydalanuvchi turgan
 * joyda — firma kartasida — HECH QAYERDA ko'rinmasdi. "Kim soliq rejimini
 * o'zgartirdi?" degan savolga javob yo'q edi.
 *
 * Ruxsat: senior rollar (bosh buxgalter, nazoratchi, admin). Buxgalter o'z
 * firmasining o'zgarish tarixini ko'rmaydi — bu nazorat vositasi.
 */
export async function getRecordHistory(params: {
  tableName: string;
  recordId: string;
  limit?: number;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isSeniorRole(role)) throw new Error("Forbidden");

  return serialize(
    await prisma.auditLog.findMany({
      where: { tableName: params.tableName, recordId: params.recordId },
      include: { user: { select: { id: true, fullName: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(params.limit ?? 25, 1), 100),
    })
  );
}

// Audit yozish endpointi ATAYIN yo'q: server ichki yozuvlar lib/auditTrail.ts
// orqali ketadi. Public action bo'lsa, istalgan foydalanuvchi ixtiyoriy
// tableName/newData bilan jurnalni zaharlashi mumkin edi.

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

const NOTIFICATION_TYPES = new Set([
  "deadline",
  "status_change",
  "kpi_alert",
  "system",
  "approval_request",
]);

export async function createNotification(data: {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}) {
  // Exported = publicly reachable; require an authenticated caller.
  // Internal server-action callers always run with a session.
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  // Klientdan chaqiriladigan oqim (OperationModule) bor, shuning uchun rol bilan
  // yopib bo'lmaydi — lekin kontentni cheklaymiz: faqat ma'lum turlar, faqat
  // ilova ichidagi havola (tashqi/javascript: URL forging emas), oqilona uzunlik.
  if (!NOTIFICATION_TYPES.has(data.type)) throw new Error("Bildirishnoma turi noto'g'ri");
  const link = data.link?.trim();
  if (link && (!link.startsWith("/") || link.startsWith("//"))) {
    throw new Error("Havola ilova ichidagi yo'l bo'lishi kerak");
  }

  const result = await prisma.notification.create({
    data: {
      userId: data.userId,
      type: data.type,
      title: data.title.slice(0, 200),
      message: data.message.slice(0, 1000),
      link: link || null,
    },
  });
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
