// =====================================================
// FOYDALANUVCHI DARAJASIDAGI TELEGRAM BYUDJETI
// =====================================================
//
// Bu — oxirgi to'siq, asosiy yechim emas. Shovqinning 99.5% i majburiyat
// sweepidan kelardi va u yig'ma bilan hal qilindi
// (lib/engines/automation/obligationRollup.ts). Byudjet esa KELAJAKDAGI
// portlashdan saqlaydi: yangi kod yo'li yoki ma'lumot importi bir odamga
// yuzlab xabar yubormoqchi bo'lsa, Telegram tomoni to'xtaydi.
//
// HECH QANDAY XABAR YO'QOLMAYDI. Chegara faqat Telegram nusxasiga tegadi;
// ilova ichidagi qator BARIBIR yoziladi va qo'ng'iroq belgisida ko'rinadi.
// `high`/`critical` esa umuman cheklanmaydi.
import { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient;

export type NotifyPriority = "low" | "normal" | "high" | "critical";

/**
 * Bir odamga bir kunda ketadigan `low`/`normal` Telegram xabarlarining eng
 * ko'p soni.
 *
 * 15 — ertalabki digest va direktor hisoboti (2 ta) ustiga kun davomida
 * o'ndan ortiq voqea bo'lishi normal ish kunida uchramaydi; undan oshsa bu
 * odam emas, kod yoki import xabar yubormoqda.
 */
export const NOTIFY_DAILY_TELEGRAM_BUDGET = 15;

/** `high` va `critical` byudjetdan o'tib ketadi — ular kechiktirilmaydi. */
export function bypassesBudget(priority: NotifyPriority): boolean {
  return priority === "high" || priority === "critical";
}

const startOfUtcDay = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/**
 * Byudjetdan o'tadigan qabul qiluvchilarni ajratadi — BITTA so'rovda.
 *
 * Sanash `NotificationDelivery` dan: haqiqatan jo'natilgan (`sent`) yoki
 * navbatga qo'yilgan (`queued`) qatorlar. `claimed`/`skipped` sanalmaydi —
 * ular hech kimning telefonida chiqmagan. Yangi jadval kerak emas;
 * `@@index([recipientId, createdAt])` shu so'rov uchun qo'shilgan.
 *
 * `groupBy` ataylab: qabul qiluvchi boshiga alohida `count` qilish yagona
 * voronkani N+1 ga aylantirardi, holbuki undan HAR BIR xabar o'tadi.
 */
export async function withinTelegramBudget(
  db: Db,
  userIds: string[],
  priority: NotifyPriority,
  now = new Date(),
): Promise<Set<string>> {
  const all = new Set(userIds);
  if (bypassesBudget(priority) || all.size === 0) return all;

  const used = await db.notificationDelivery.groupBy({
    by: ["recipientId"],
    where: {
      recipientId: { in: [...all] },
      createdAt: { gte: startOfUtcDay(now) },
      status: { in: ["sent", "queued"] },
    },
    _count: { _all: true },
  });

  for (const row of used) {
    if (row.recipientId && row._count._all >= NOTIFY_DAILY_TELEGRAM_BUDGET) {
      all.delete(row.recipientId);
    }
  }
  return all;
}
