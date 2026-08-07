// =====================================================
// UMUMIY XABARNOMA — sayt + Telegram (framework-free)
// =====================================================
//
// Bungacha bir xil naqsh uch joyda qo'lda takrorlangan edi:
// lib/escalation.ts, lib/dailyDigest.ts, lib/obligationSweep.ts. Har biri
// (1) NotificationDelivery qatorini band qiladi, (2) Notification yozadi,
// (3) Telegram'ga uzatadi, (4) delivery holatini yangilaydi. Shu ketma-ketlik
// shu yerda bir marta yozildi.
//
// NEGA TELEGRAM TO'G'RIDAN-TO'G'RI YUBORILMAYDI: grammY instansi `asro-bot`
// protsessida yashaydi, Next.js server action'i ichida emas. Shuning uchun
// Telegram qismi `notify` BullMQ navbatiga qo'yiladi — bot uni o'zi oladi.
// Navbat ishlamasa ham sayt ichidagi xabar joyida qoladi: in-app — ishonchli
// kanal, Telegram — qo'shimcha.
//
// IDEMPOTENTLIK: NotificationDelivery @@unique([channel, dedupKey]). Bir xil
// dedupKey bilan ikkinchi chaqiruv hech narsa yubormaydi. Shu sababli server
// action qayta urinsa ham (yoki foydalanuvchi ikki marta bossa ham) xabar
// takrorlanmaydi.

import { Prisma } from "@prisma/client";
import { logServerError } from "@/lib/logger";

type Db = Prisma.TransactionClient;

/** Telegram'ga uzatuvchi port — bot qatlami in'ektsiya qiladi. */
export type TelegramDispatcher = (input: {
  userIds: string[];
  text: string;
}) => Promise<void>;

export interface NotifyInput {
  /** Kimga — User.id ro'yxati. Bo'sh bo'lsa hech narsa qilinmaydi. */
  userIds: string[];
  /** Notification.type — components/NotificationsModule.tsx TYPE_META bilan mos bo'lsin. */
  type: string;
  title: string;
  message: string;
  /** Ilova ichidagi yo'l ("/organizations"). Tashqi URL qabul qilinmaydi. */
  link?: string | null;
  /** NotificationDelivery.channel — kanallarni ajratish uchun. */
  channel: string;
  /**
   * Takrorlanmaslik kaliti. Berilmasa dedup ishlamaydi (har chaqiruvda yuboriladi)
   * — buni ataylab tanlash kerak.
   */
  dedupKey?: string;
  /** Telegram matni; berilmasa `title` + `message` dan yig'iladi. */
  telegramText?: string;
}

export interface NotifyResult {
  /** Sayt ichida nechta Notification qatori yozildi. */
  inapp: number;
  /** Telegram uchun navbatga qo'yildimi. */
  telegramQueued: boolean;
  /** dedupKey allaqachon band bo'lgani uchun o'tkazib yuborildimi. */
  skipped: boolean;
}

const isUniqueViolation = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Havola ilova ichida ekanini tekshiradi (ochiq redirect'ning oldini oladi). */
function safeLink(link: string | null | undefined): string | null {
  const value = link?.trim();
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export function buildTelegramText(title: string, message: string): string {
  return `🔔 ${title}\n\n${message}`;
}

/**
 * Bir yoki bir necha foydalanuvchiga ikkala kanal orqali xabar yuboradi.
 *
 * @param deps.dispatchTelegram — bot qatlamidan kelgan uzatuvchi. Berilmasa
 *   (masalan testda yoki bot o'chirilgan bo'lsa) faqat sayt ichida yoziladi.
 */
export async function notifyUsers(
  db: Db,
  input: NotifyInput,
  deps: { dispatchTelegram?: TelegramDispatcher } = {}
): Promise<NotifyResult> {
  const empty: NotifyResult = { inapp: 0, telegramQueued: false, skipped: false };

  const userIds = Array.from(new Set(input.userIds.filter(Boolean)));
  if (userIds.length === 0) return empty;

  // ── 1. dedupKey ni band qilamiz (yuborishdan OLDIN) ────────────────────
  let deliveryId: string | null = null;
  if (input.dedupKey) {
    // Avval arzon o'qish: unikal indeksga urilib xato olish Prisma'ning
    // konsolga qizil log yozishiga sabab bo'ladi, holbuki takror chaqiruv —
    // kutilgan holat, hodisa emas. (lib/escalation.ts dagi bilan bir xil yo'l.)
    const claimed = await db.notificationDelivery.findUnique({
      where: { channel_dedupKey: { channel: input.channel, dedupKey: input.dedupKey } },
      select: { id: true },
    });
    if (claimed) return { ...empty, skipped: true };

    try {
      const row = await db.notificationDelivery.create({
        data: {
          channel: input.channel,
          level: "yellow", // bu kanalda daraja tushunchasi yo'q; ustun NOT NULL
          dedupKey: input.dedupKey,
          recipientId: userIds[0],
          status: "pending",
        },
        select: { id: true },
      });
      deliveryId = row.id;
    } catch (e) {
      if (isUniqueViolation(e)) return { ...empty, skipped: true };
      throw e;
    }
  }

  // ── 2. Sayt ichidagi xabar — ishonchli kanal, har doim yoziladi ────────
  const link = safeLink(input.link);
  let inapp = 0;
  try {
    const created = await db.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        message: input.message,
        link,
      })),
    });
    inapp = created.count;
  } catch (err) {
    logServerError("notify.inapp", err, { channel: input.channel, dedupKey: input.dedupKey });
  }

  // ── 3. Telegram — navbat orqali, xatosi butun amalni yiqitmaydi ────────
  let telegramQueued = false;
  if (deps.dispatchTelegram) {
    try {
      await deps.dispatchTelegram({
        userIds,
        text: input.telegramText ?? buildTelegramText(input.title, input.message),
      });
      telegramQueued = true;
    } catch (err) {
      logServerError("notify.telegram", err, { channel: input.channel, dedupKey: input.dedupKey });
    }
  }

  if (deliveryId) {
    await db.notificationDelivery
      .update({
        where: { id: deliveryId },
        data: { status: telegramQueued ? "sent" : "failed", sentAt: new Date() },
      })
      .catch((err) => logServerError("notify.delivery", err, { dedupKey: input.dedupKey }));
  }

  return { inapp, telegramQueued, skipped: false };
}
