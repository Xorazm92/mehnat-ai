"use server";

// =====================================================
// BILDIRISHNOMA SAQLASH MUDDATI — qo'lda ishga tushirish (D2)
// =====================================================
// Tozalash kuniga bir marta cron'da yuradi (`bot/cron/chores.ts`
// `runDailyChores`, 09:00 Asia/Tashkent). Bu yerdagi amal uni ALMASHTIRMAYDI,
// ikkita aniq holat uchun qo'shiladi:
//
//   1. BIRINCHI TOZALASH. Prodda yig'ilib qolgan qatorlarni cron kutmasdan
//      olib tashlash kerak bo'ladi (o'lchangan: 49 957 qator, 42 MB — ularning
//      96% i `claimed`, ya'ni eski oq ro'yxatga umuman tushmasdi).
//   2. CHEGARANI SINAB KO'RISH. `retainDays` parametrik, ya'ni "90 emas, 30
//      kun qilsak nima o'chadi" degan savolga cronni o'zgartirmasdan javob
//      berish mumkin.
//
// FAQAT ADMIN. Amal qaytarib bo'lmaydi (jismonan o'chirish), shuning uchun
// darvoza `isAdminRole` va har yurish audit iziga tushadi — kim, qachon,
// qaysi chegara bilan va nechta qator.
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/platform/permissions";
import { recordAuditLog } from "@/lib/platform/auditTrail";
import { serialize } from "@/lib/serialize";
import {
  purgeOldNotifications,
  type RetentionResult,
} from "@/lib/engines/automation/notificationRetention";

export interface CleanupInput {
  /** O'qilgan bildirishnoma muddati (kun). Standart — 90. */
  readAfterDays?: number;
  /** O'qilmagan bildirishnoma muddati (kun). Standart — 180. */
  unreadAfterDays?: number;
  /** Yetkazish daftari muddati (kun). Standart — 180. */
  deliveryAfterDays?: number;
}

/**
 * Muddati o'tgan bildirishnomalarni o'chiradi.
 *
 * CHEGARA PASTKI QIYMATI BOR. 0 yoki manfiy kun butun jadvalni tozalardi va
 * bu bitta noto'g'ri bosishda dedup kalitlarining HAMMASINI bo'shatib,
 * har bir jonli eslatmani qayta yubortirardi. Eng kichik ruxsat — 7 kun.
 */
export async function cleanupNotifications(input: CleanupInput = {}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const role = session.user.role as string;
  if (!isAdminRole(role)) {
    throw new Error("Ruxsat yo'q: bildirishnomalarni tozalash faqat Admin/Superadmin uchun");
  }

  const MIN_DAYS = 7;
  const check = (v: number | undefined, label: string): number | undefined => {
    if (v === undefined) return undefined;
    if (!Number.isFinite(v) || v < MIN_DAYS) {
      throw new Error(`${label} kamida ${MIN_DAYS} kun bo'lishi kerak`);
    }
    return v;
  };

  const opts = {
    readAfterDays: check(input.readAfterDays, "O'qilgan muddati"),
    unreadAfterDays: check(input.unreadAfterDays, "O'qilmagan muddati"),
    deliveryAfterDays: check(input.deliveryAfterDays, "Yetkazish daftari muddati"),
  };

  const res: RetentionResult = await purgeOldNotifications(prisma, opts);

  // Iz HAR DOIM qoladi, hatto 0 qator o'chsa ham: "tozalash yurgizildimi?"
  // degan savolga javob amalning O'ZIDA bo'lishi kerak, natijasida emas.
  await recordAuditLog({
    userId: session.user.id as string,
    action: "delete",
    tableName: "Notification",
    recordId: `retention:${new Date().toISOString().slice(0, 10)}`,
    newData: {
      readAfterDays: opts.readAfterDays ?? 90,
      unreadAfterDays: opts.unreadAfterDays ?? 180,
      deliveryAfterDays: opts.deliveryAfterDays ?? 180,
      deletedNotifications: res.notifications.read + res.notifications.unread,
      deletedDeliveries: res.deliveries,
    },
  });

  return serialize(res);
}
