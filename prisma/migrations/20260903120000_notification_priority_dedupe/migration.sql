-- Bildirishnoma shovqinini kesish uchun ikkita ustun va bitta indeks.
--
-- `priority` — Telegram byudjeti faqat low/normal ni cheklaydi, high/critical
-- hech qachon kechiktirilmaydi (lib/engines/automation/notificationBudget.ts).
--
-- `dedupeKey` — ILOVA ICHIDAGI idempotentlik. NotificationDelivery.dedupKey
-- yetkazish daftarini qulflaydi, bu esa ko'rinadigan qatorni. Kunlik yig'ma
-- bir odamga kuniga bitta qator yozishi va parallel ikkita yurish uni
-- buzmasligi kerak — bungacha bot/contexts/billing/.../notify-red.ts
-- findFirst+create qilardi, ya'ni poyga ochiq edi.
--
-- ORQAGA MOSLIK: ikkala ustun ham default/nullable, mavjud ustunlar
-- tegilmaydi. Postgres unikal indeksi NULL'larni sanamaydi, shuning uchun
-- dedupeKey'siz eski qatorlar (65 845 ta) ta'sirlanmaydi va eski kod ham
-- ishlayveradi.
ALTER TABLE "Notification" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE "Notification" ADD COLUMN "dedupeKey" TEXT;

CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key"
  ON "Notification"("userId", "dedupeKey");

-- Qo'ng'iroq belgisi va /notifications aynan shu uchlik bo'yicha so'raydi.
CREATE INDEX "Notification_userId_isRead_createdAt_idx"
  ON "Notification"("userId", "isRead", "createdAt" DESC);

-- Kunlik Telegram byudjeti "shu odamga bugun nechta ketdi" deb so'raydi
-- (lib/engines/automation/notificationBudget.ts). Busiz har xabar uchun
-- NotificationDelivery to'liq skanerlanardi.
CREATE INDEX "NotificationDelivery_recipientId_createdAt_idx"
  ON "NotificationDelivery"("recipientId", "createdAt");
