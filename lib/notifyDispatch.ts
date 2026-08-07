// Telegram uzatuvchisining SERVER (Next.js) tomonidagi adapteri.
//
// lib/notify.ts ataylab framework-free: u Telegram'ni bilmaydi, faqat port
// qabul qiladi. Bu fayl shu portni BullMQ `notify` navbatiga ulaydi.
//
// Nega navbat: grammY instansi `asro-bot` protsessida, Next.js ichida emas.
// Server action to'g'ridan-to'g'ri yubora olmaydi — job qo'yadi, bot oladi.
// Redis yiqilgan bo'lsa `enqueueNotifyJob` xato beradi va uni `notifyUsers`
// ushlab qoladi: sayt ichidagi xabar baribir yozilgan bo'ladi.

import { enqueueNotifyJob } from "@/bot/queues/notify.queue";
import type { TelegramDispatcher } from "@/lib/notify";

export const telegramQueueDispatcher: TelegramDispatcher = async ({ userIds, text }) => {
  await enqueueNotifyJob({ kind: "direct-message", userIds, text });
};
