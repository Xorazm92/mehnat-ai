// Kunlik uy ishlari — BullMQ rejasi orqali chaqiriladi (`notify-daily-chores`,
// `notify-billing-reminders`).
//
// NEGA BULAR PROTSESS ICHIDAN CHIQARILDI. Bungacha ular `bot/cron/scheduler.ts`
// da `setTimeout(msUntilHour(9))` + `setInterval(24h)` bilan yurardi. Uch
// muammo: (1) bot har restart bo'lganda jadval siljirdi, (2) ikkinchi instance
// qo'shilsa ish ikki marta bajarilardi, (3) protsess kechasi qayta ishga
// tushsa o'sha kunlik yurish umuman o'tkazib yuborilardi. BullMQ rejasi
// Redis'da yashaydi va bu uchtasini ham hal qiladi.
import { prisma } from "../../lib/prisma";
import { notifyUsers } from "../../lib/notify";
import { purgeOldNotifications } from "../../lib/engines/automation/notificationRetention";
import { SENIOR_REVIEW_ROLES } from "../../lib/reportPermissions";
import { runBillingReminders } from "../contexts/billing/application/run-reminders";
import { receiptButton } from "../contexts/billing/application/receipt-flow";
import { callbackSecret, hasTelegramToken } from "../config";
import { sendMessage } from "../telegram/bot";
import type { ReplyMarkup } from "../telegram/keyboard";


/** Current accounting period, "YYYY-MM" (local). */
export function currentPeriod(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * KUNLIK YIG'MA — tasdiq kutayotgan dalillar.
 *
 * Dalil topshirilganda darhol xabar FAQAT o'sha firmaning nazoratchisi va
 * bosh buxgalteriga ketadi (server/proofs.ts). Qolgan senior rollar ilgari
 * har topshiriqda xabar olardi — prodda 13 596 ta `approval_request`
 * qatoridan 13 577 tasi o'qilmagan bo'lib yig'ilgandi. Endi ular kuniga
 * BITTA yig'ma xabar oladi.
 */
export async function runProofDigest(): Promise<void> {
  const pending = await prisma.reportProof.count({ where: { status: "pending" } });
  if (pending === 0) return;

  const seniors = await prisma.user.findMany({
    where: { role: { in: [...SENIOR_REVIEW_ROLES] }, isActive: true },
    select: { id: true },
  });
  if (seniors.length === 0) return;

  const day = new Date().toISOString().slice(0, 10);
  const res = await notifyUsers(prisma, {
    userIds: seniors.map((u) => u.id),
    type: "approval_request",
    title: "Tasdiqlash kutmoqda",
    message: `${pending} ta hisobot dalili tekshiruvni kutmoqda.`,
    link: "/reports",
    channel: "proof-digest",
    dedupKey: day,
    dedupeKey: `proof-digest:${day}`,
  });
  console.log(`[cron] proof digest: pending=${pending} inapp=${res.inapp} skipped=${res.skipped}`);
}

/**
 * BILDIRISHNOMA SAQLASH MUDDATI.
 *
 * Qoidaning O'ZI `lib/engines/automation/notificationRetention.ts` da: u
 * `db` va `now` ni argument sifatida oladi, ya'ni chegaralar (90/180 kun)
 * sinovga ochiq va bir xil mantiq ekrandan ham chaqiriladi
 * (`server/notifications.ts`). Bu yerda faqat cron chaqiruvi qoladi.
 */
export async function runNotificationRetention(): Promise<void> {
  const res = await purgeOldNotifications(prisma);
  console.log(
    `[cron] retention: notification read=${res.notifications.read} ` +
      `unread=${res.notifications.unread} delivery=${res.deliveries}`
  );
}

/** Ikkalasi ham idempotent — qayta ishga tushish hech narsani buzmaydi. */
export async function runDailyChores(): Promise<void> {
  try {
    await runProofDigest();
  } catch (err) {
    console.error(`[cron] proof digest failed: ${(err as Error).message}`);
  }
  try {
    await runNotificationRetention();
  } catch (err) {
    console.error(`[cron] retention failed: ${(err as Error).message}`);
  }
}

/** Telegram sender for the cron: fails (not silently "sends") when misconfigured
 *  so a reminder is marked `failed`, never `sent`, without a token. */
async function sendTelegram(chatId: bigint, text: string, replyMarkup?: unknown): Promise<void> {
  if (!hasTelegramToken()) throw new Error("TELEGRAM_BOT_TOKEN not set");
  await sendMessage(chatId, text, { replyMarkup: replyMarkup as ReplyMarkup | undefined });
}

/**
 * To'lov eslatmalari. Idempotent (`PaymentReminder` @@unique([companyId,
 * period, level])), shuning uchun kechikib yoki qayta yurish hech qachon
 * ikkinchi eslatmani yubormaydi.
 */
export async function runBillingCron(): Promise<void> {
  // Eslatmada "📄 Kvitansiya yuborish" tugmasi bor — mijoz kvitansiyani
  // to'g'ridan-to'g'ri buxgalterga uzatadi, guruhda e'tiborsiz qolmaydi.
  const res = await runBillingReminders(prisma, currentPeriod(), {
    sendTelegram,
    reminderKeyboard: receiptButton(callbackSecret()),
  });
  console.log(`[cron] billing:`, res);
}
