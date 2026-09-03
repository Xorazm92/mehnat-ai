-- YETKAZISH DAFTARI STATUSLARINI TO'G'RILASH (ma'lumot migratsiyasi).
--
-- Oldingi kod `NotificationDelivery.status` ga qo'l ostidagi o'zgaruvchidan
-- yozardi va natijada uchta yolg'on qoldi. Yangi kod
-- (lib/engines/automation/deliveryLedger.ts) to'g'ri yozadi, lekin TARIX
-- baribir noto'g'ri gapiraveradi — quyidagi uchta UPDATE uni tuzatadi.
--
-- HECH QANDAY QATOR O'CHIRILMAYDI. `dedupKey` — idempotentlik qulfi; uni
-- yo'qotish o'sha eslatmani QAYTA yuborilishi mumkin qilardi. Faqat `status`
-- matni o'zgaradi.
--
-- Idempotent: har bir UPDATE o'z manba holatini qidiradi, ikkinchi marta
-- yurgizilsa 0 qator tegadi.

-- 1) `inapp` kanali — bu qatorlar ortida HECH QACHON jo'natish bo'lmagan.
--    Ular bosqich daftarining tokeni, `obligationSweep` esa ularga `sent`
--    yozardi. To'g'ri qiymat — `claimed`.
UPDATE "NotificationDelivery"
   SET status = 'claimed', "sentAt" = NULL
 WHERE channel = 'inapp'
   AND status = 'sent'
   AND "dedupKey" LIKE 'obligation:%:reminder:%';

-- 2) `escalation` kanali — `failed` deb yozilgan, holbuki zanjir bosqichi
--    BO'LIB O'TGAN va in-app xabar muvaffaqiyatli yozilgan. "failed" faqat
--    Telegram nusxasi yetmaganini bildirardi, va aynan shu sababdan lokal
--    bazada 13 592 `failed` / 0 `sent` degan ma'nosiz manzara chiqqan.
--    Zanjir qulfi uchun to'g'ri qiymat — `claimed`.
UPDATE "NotificationDelivery"
   SET status = 'claimed', "sentAt" = NULL
 WHERE channel = 'escalation'
   AND status IN ('failed', 'pending');

-- 3) `director`/`digest` — qabul qiluvchining Telegrami ulanmagani uchun
--    `failed` bo'lib qolgan. Urinish bo'lmagan, ya'ni bu xato emas: `skipped`.
UPDATE "NotificationDelivery"
   SET status = 'skipped', "sentAt" = NULL
 WHERE channel IN ('director', 'digest')
   AND status = 'failed';
