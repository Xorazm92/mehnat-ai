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
import { logServerError } from "@/lib/platform/logger";
import { claim, settle } from "@/lib/engines/automation/deliveryLedger";
import { withinTelegramBudget, type NotifyPriority } from "@/lib/engines/automation/notificationBudget";

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
  /**
   * ILOVA ICHIDAGI takrorlanmaslik kaliti — `Notification.dedupeKey`
   * (@@unique([userId, dedupeKey])).
   *
   * `dedupKey` dan farqi: u YETKAZISH daftarini qulflaydi, bu esa KO'RINADIGAN
   * qatorni. Ikkalasi kerak, chunki yetkazish qatori o'tkinchi xatoda
   * bo'shatiladi (`settle`) — o'shanda in-app qator ikkinchi marta yozilmasligi
   * kerak. Bundan tashqari DB darajasidagi cheklov poygani yopadi:
   * `findFirst` + `create` naqshi (notify-red.ts) ikkita parallel so'rovda
   * ikkita xabar yaratardi.
   */
  dedupeKey?: string;
  /**
   * Shoshilinchlik. `low`/`normal` kunlik Telegram byudjetiga tushadi,
   * `high`/`critical` esa hech qachon cheklanmaydi. Default: "normal".
   */
  priority?: NotifyPriority;
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
  /**
   * Kunlik Telegram byudjeti tugagani uchun Telegram nusxasi yuborilmadimi.
   * Ilova ichidagi xabar bunday holatda ham yozilgan bo'ladi.
   */
  budgetSkipped: boolean;
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
  deps: { dispatchTelegram?: TelegramDispatcher; now?: Date } = {}
): Promise<NotifyResult> {
  const empty: NotifyResult = {
    inapp: 0,
    telegramQueued: false,
    skipped: false,
    budgetSkipped: false,
  };

  const userIds = Array.from(new Set(input.userIds.filter(Boolean)));
  if (userIds.length === 0) return empty;

  const now = deps.now ?? new Date();
  const priority: NotifyPriority = input.priority ?? "normal";

  // ── 1. dedupKey ni band qilamiz (yuborishdan OLDIN) ────────────────────
  let deliveryId: string | null = null;
  if (input.dedupKey) {
    deliveryId = await claim(db, {
      channel: input.channel,
      dedupKey: input.dedupKey,
      level: "yellow", // bu kanalda daraja tushunchasi yo'q; ustun NOT NULL
      recipientId: userIds[0],
    });
    if (deliveryId == null) return { ...empty, skipped: true };
  }

  // ── 2. Sayt ichidagi xabar — ishonchli kanal, har doim yoziladi ────────
  const link = safeLink(input.link);
  let inapp = 0;
  try {
    // `skipDuplicates`: `dedupeKey` unikal indeksi bilan parallel ikkinchi
    // chaqiruv xato bermasdan jimgina o'tishi kerak — bu KUTILGAN holat.
    const created = await db.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        message: input.message,
        link,
        priority,
        dedupeKey: input.dedupeKey ?? null,
      })),
      skipDuplicates: true,
    });
    inapp = created.count;
  } catch (err) {
    logServerError("notify.inapp", err, { channel: input.channel, dedupKey: input.dedupKey });
  }

  // ── 3. Telegram — navbat orqali, xatosi butun amalni yiqitmaydi ────────
  //
  // BYUDJET. `low`/`normal` uchun bir odamga kunlik chegara bor. Chegaradan
  // oshgan xabar YO'QOLMAYDI — u yuqorida ilova ichida allaqachon yozilgan,
  // faqat Telegram nusxasi bo'lmaydi.
  let telegramQueued = false;
  let budgetSkipped = false;
  if (deps.dispatchTelegram) {
    const allowedSet = await withinTelegramBudget(db, userIds, priority, now);
    const allowed = userIds.filter((id) => allowedSet.has(id));
    budgetSkipped = allowed.length < userIds.length;

    if (allowed.length > 0) {
      try {
        await deps.dispatchTelegram({
          userIds: allowed,
          text: input.telegramText ?? buildTelegramText(input.title, input.message),
        });
        telegramQueued = true;
      } catch (err) {
        logServerError("notify.telegram", err, { channel: input.channel, dedupKey: input.dedupKey });
      }
    }
  }

  if (deliveryId) {
    // "queued", "sent" EMAS. Bu yerda faqat BullMQ navbatiga qo'yildi;
    // Telegram uni qabul qildimi — bu qatordan bilinmaydi. Bungacha shu
    // holat `sent` deb yozilardi va status yolg'on gapirardi.
    //
    // "failed" ATAYIN ISHLATILMAYDI. `settle(..., "failed")` kalitni bo'shatadi,
    // ya'ni chaqiruv qaytarilsa xabar qayta yuboriladi. Bu modulda esa ilova
    // ichidagi qator ALLAQACHON yozilgan va u — vakolatli kanal; kalit
    // bo'shasa o'sha qator ikkinchi marta yozilardi. Telegram bu yerda
    // ataylab best-effort (fayl boshidagi izoh).
    const outcome = telegramQueued ? "queued" : "skipped";
    await settle(db, deliveryId, outcome, now).catch((err) =>
      logServerError("notify.delivery", err, { dedupKey: input.dedupKey })
    );
  }

  return { inapp, telegramQueued, skipped: false, budgetSkipped };
}
