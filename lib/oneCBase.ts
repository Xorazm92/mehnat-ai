// =====================================================
// YANGI FIRMA → 1C BAZA OCHISH XABARNOMASI
// =====================================================
//
// Yangi firma ochilganda kimdir uning 1C bazasini ochishi kerak. Bungacha bu
// og'zaki eslatilardi va tizimda hech qanday iz qolmasdi.
//
// KIMGA BORADI: `SystemSetting` kaliti `oneCBaseOpeners` — User.id ro'yxati,
// admin panelidan tahrirlanadi. Ism qattiq yozilmaydi: OnboardingWizard'da
// ismi 'yorqinoy' bo'lgan xodimni qidiradigan blok aynan shu sababdan
// o'chirildi — odam ishdan ketsa yoki ismi o'zgarsa, kod jim ishlamay qoladi.
//
// Ro'yxat bo'sh/buzuq bo'lsa — barcha faol admin va superadminga tushadi
// (loyihaning "direktor" konvensiyasi, bot/contexts/billing/.../notify-red.ts).

import { Prisma } from "@prisma/client";
import { notifyUsers, type TelegramDispatcher } from "@/lib/notify";
import { formatUzDate } from "@/lib/format";

type Db = Prisma.TransactionClient;

export const ONE_C_CHANNEL = "onec_base";
export const ONE_C_SETTING_KEY = "oneCBaseOpeners";
/** Notification.type — server/audit.ts NOTIFICATION_TYPES bilan mos bo'lishi shart. */
export const ONE_C_NOTIFICATION_TYPE = "onec_base_request";

export const oneCBaseDedupKey = (companyId: string) => `onec-base:${companyId}`;

/**
 * Xabarnoma qabul qiluvchilar. Sozlamadagi id'lar faol foydalanuvchi ekani
 * tekshiriladi — ishdan ketgan xodim ro'yxatda qolib ketsa xabar yo'qolmasin.
 */
export async function resolveOneCRecipients(db: Db): Promise<string[]> {
  const row = await db.systemSetting.findUnique({ where: { key: ONE_C_SETTING_KEY } });
  const configured = Array.isArray(row?.value)
    ? (row.value as unknown[]).filter((v): v is string => typeof v === "string" && v.length > 0)
    : [];

  if (configured.length > 0) {
    const active = await db.user.findMany({
      where: { id: { in: configured }, isActive: true },
      select: { id: true },
    });
    if (active.length > 0) return active.map((u) => u.id);
  }

  // Zaxira yo'l: hech kim sozlanmagan (yoki hammasi nofaol) — direktorlarga.
  const admins = await db.user.findMany({
    where: { role: { in: ["super_admin", "admin"] }, isActive: true },
    select: { id: true },
  });
  return admins.map((u) => u.id);
}

export interface NewCompanyNotice {
  companyId: string;
  companyName: string;
  inn: string;
  /** Firmani kim ochdi — xabarda ko'rsatiladi. */
  createdByName?: string | null;
}

/**
 * "1C baza ochish kerak" xabarini sayt va Telegram orqali yuboradi.
 * Idempotent: bitta firma uchun bir marta (dedupKey = firma id).
 */
export async function notifyOneCBaseNeeded(
  db: Db,
  notice: NewCompanyNotice,
  deps: { dispatchTelegram?: TelegramDispatcher; now?: Date } = {}
) {
  const userIds = await resolveOneCRecipients(db);
  if (userIds.length === 0) {
    return { inapp: 0, telegramQueued: false, skipped: false };
  }

  const now = deps.now ?? new Date();
  const openedBy = notice.createdByName ? ` Ochdi: ${notice.createdByName}.` : "";
  const message =
    `${notice.companyName} (STIR ${notice.inn}) tizimga qo'shildi — ` +
    `1C bazasini ochish kerak.${openedBy}`;

  return notifyUsers(
    db,
    {
      userIds,
      type: ONE_C_NOTIFICATION_TYPE,
      title: "Yangi firma — 1C baza ochish kerak",
      message,
      link: `/organizations?company=${notice.companyId}`,
      channel: ONE_C_CHANNEL,
      dedupKey: oneCBaseDedupKey(notice.companyId),
      telegramText:
        `🆕 Yangi firma — 1C baza kerak\n\n` +
        `🏢 ${notice.companyName}\n` +
        `🔢 STIR: ${notice.inn}\n` +
        `📅 ${formatUzDate(now)}${openedBy}`,
    },
    { dispatchTelegram: deps.dispatchTelegram }
  );
}
