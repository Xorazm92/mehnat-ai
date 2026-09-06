// =====================================================
// BILDIRISHNOMA SAQLASH MUDDATI (D2)
// =====================================================
// Bular moliyaviy yozuv EMAS — `deletedAt` bilan yumshoq o'chirilmaydi,
// jismonan o'chadi. Moliyaviy qoida boshqa (ADR-0011) va u shu jadvallarga
// tegishli emas: xabar yetkazilgandan keyin uning qiymati kunlar bilan
// o'lchanadi, yillar bilan emas.
//
// NEGA `bot/cron/chores.ts` DAN AJRATILDI. Mantiq o'sha yerda global
// `prisma` bilan, parametrsiz yozilgan edi: uni na sinab, na ekrandan
// chaqirib bo'lardi, natijada chegaralar (90/180 kun) hech qachon
// tekshirilmagan. Endi `db` va `now` argument — chegara sinovga ochiq.
//
// ─────────────────────────────────────────────────────────────────────
// STATUS OQ RO'YXATI OLIB TASHLANDI — D2 NING ASOSIY NUQSONI.
//
// Avvalgi tahrir `NotificationDelivery` dan faqat sanab o'tilgan statuslarni
// o'chirardi: `sent | queued | failed | unreachable | skipped`. Ro'yxatda
// `claimed` YO'Q edi — holbuki u eng tez o'sadigan turi: soatlik
// `obligationSweep` har majburiyatning har bosqichi uchun bittadan token
// qatori yozadi (`mode: "token"`), `twinAlertRun` esa zanjir qulfini.
//
// O'LCHANGAN (2026-09-06, lokal `inbola`): 49 957 qatordan 47 824 tasi
// (96%, 42 MB) aynan `claimed` — ya'ni tozalash jadvalning 4% ini olib,
// qolgan 96% ini abadiy qoldirardi. `pending` ham ro'yxatda yo'q edi va u
// yanada yomonroq: bu yuborishdan oldin band qilingan, lekin hech qachon
// yakunlanmagan qulf (jarayon o'rtada uzilgan), ya'ni kalit abadiy band
// bo'lib turadi.
//
// Sabab — QOIDANING SHAKLI. Oq ro'yxat "yangi status qo'shilsa uni bu yerga
// ham yozishni unutmang" degan yashirin shart yaratadi va u albatta
// unutiladi. Endi qoida YOSHGA bog'langan: statusdan qat'i nazar, 180
// kundan eski qator ketadi. Yangi status qo'shilsa u avtomatik qamraladi.
//
// 180 KUN — DEDUP KALITI UCHUN. `NotificationDelivery.dedupKey` idempotentlik
// qulfi (`lib/engines/automation/deliveryLedger.ts`). Qator o'chsa kalit
// bo'shaydi va hodisa qayta qulflanishi mumkin. Oyna har qanday jonli
// eslatma siklidan uzun tanlangan; bundan tashqari eng ko'p o'chadigan turi
// `claimed` — u ortida HECH QANDAY jo'natish yo'q (faqat daftar tokeni),
// ya'ni qayta qulflanish foydalanuvchiga ko'rinmaydi.
import type { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient;

const DAY_MS = 86_400_000;

/** Bir partiyada o'chiriladigan qatorlar soni. */
const DEFAULT_BATCH = 10_000;

export interface RetentionOptions {
  /** Deterministik sinov uchun; berilmasa joriy vaqt. */
  now?: Date;
  /** O'QILGAN bildirishnoma shu kundan keyin ketadi. */
  readAfterDays?: number;
  /** O'QILMAGAN bildirishnoma shu kundan keyin ketadi (uzunroq — ko'rilmagan). */
  unreadAfterDays?: number;
  /** Yetkazish daftari qatori shu kundan keyin ketadi (dedup kaliti bo'shaydi). */
  deliveryAfterDays?: number;
  batchSize?: number;
}

export interface RetentionResult {
  notifications: { read: number; unread: number };
  deliveries: number;
  /** Uchalasining yig'indisi — chaqiruvchi logga shuni yozadi. */
  total: number;
}

/**
 * Partiyalab o'chirish.
 *
 * TRANZAKSIYA ICHIDA EMAS — ataylab. 47 000 qatorni bitta tranzaksiyada
 * o'chirish jadvalni butun davomiylik bo'yicha qulflab turardi va tozalash
 * ish vaqtiga tushib qolsa xabar yozish yo'lini to'sardi. Har partiya —
 * o'z bayonoti; yarim yo'lda uzilsa keyingi yurish qolganini oladi (amal
 * idempotent, chunki shart YOSHGA bog'langan).
 */
async function purgeNotifications(
  db: Db,
  where: Prisma.NotificationWhereInput,
  batchSize: number,
): Promise<number> {
  let total = 0;
  for (;;) {
    const rows = await db.notification.findMany({ where, select: { id: true }, take: batchSize });
    if (rows.length === 0) break;
    const res = await db.notification.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
    total += res.count;
    if (rows.length < batchSize) break;
  }
  return total;
}

async function purgeDeliveries(
  db: Db,
  where: Prisma.NotificationDeliveryWhereInput,
  batchSize: number,
): Promise<number> {
  let total = 0;
  for (;;) {
    const rows = await db.notificationDelivery.findMany({ where, select: { id: true }, take: batchSize });
    if (rows.length === 0) break;
    const res = await db.notificationDelivery.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
    total += res.count;
    if (rows.length < batchSize) break;
  }
  return total;
}

/** Muddati o'tgan bildirishnoma va yetkazish qatorlarini o'chiradi. */
export async function purgeOldNotifications(
  db: Db,
  opts: RetentionOptions = {},
): Promise<RetentionResult> {
  const now = opts.now ?? new Date();
  const batchSize = opts.batchSize ?? DEFAULT_BATCH;
  const daysAgo = (n: number) => new Date(now.getTime() - n * DAY_MS);

  const readCutoff = daysAgo(opts.readAfterDays ?? 90);
  const unreadCutoff = daysAgo(opts.unreadAfterDays ?? 180);
  const deliveryCutoff = daysAgo(opts.deliveryAfterDays ?? 180);

  const read = await purgeNotifications(db, { isRead: true, createdAt: { lt: readCutoff } }, batchSize);
  const unread = await purgeNotifications(db, { isRead: false, createdAt: { lt: unreadCutoff } }, batchSize);
  // STATUS BO'YICHA FILTR YO'Q — yuqoridagi izohga qarang.
  const deliveries = await purgeDeliveries(db, { createdAt: { lt: deliveryCutoff } }, batchSize);

  return {
    notifications: { read, unread },
    deliveries,
    total: read + unread + deliveries,
  };
}
