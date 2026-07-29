-- Bot "Interaktiv Operatsion Pult" — Faza 1
--
-- 1) User.phoneNormalized — `phone` ning oxirgi 9 raqami. Bot Telegram
--    `request_contact` orqali kelgan raqamni shu ustun bo'yicha topadi, shunda
--    xodim email/JSHSHIR yozib o'tirmaydi.
--    ATAYIN UNIQUE EMAS: prodda bir xil yoki bo'sh raqamlar bo'lishi mumkin va
--    migratsiya ular tufayli yiqilmasligi kerak. Noaniqlik (2+ mos xodim)
--    ilova qatlamida rad etiladi — qarang bot/contexts/identity/application/link-by-phone.ts
-- 2) TelegramMessage.fileId — chek/skrinshotni keyinroq Telegramdan yuklab
--    olish uchun (to'lov kvitansiyasi oqimi).
--
-- Ikkala ustun ham nullable va indekslar CONCURRENTLY'siz — jadvallar kichik
-- (User) yoki yozuv-og'ir bo'lsa ham qisqa muddatli lock yetarli.

ALTER TABLE "User" ADD COLUMN "phoneNormalized" TEXT;
CREATE INDEX "User_phoneNormalized_idx" ON "User"("phoneNormalized");

ALTER TABLE "TelegramMessage" ADD COLUMN "fileId" TEXT;

-- Mavjud raqamlarni darhol to'ldiramiz: faqat raqamlarni qoldirib, oxirgi 9 tasi.
-- 9 raqamdan qisqa qiymatlar (chala to'ldirilgan `phone`) NULL bo'lib qoladi —
-- aks holda ikkita chala yozuv bir-biriga "mos" bo'lib qolardi.
UPDATE "User"
SET "phoneNormalized" = RIGHT(REGEXP_REPLACE("phone", '\D', '', 'g'), 9)
WHERE "phone" IS NOT NULL
  AND LENGTH(REGEXP_REPLACE("phone", '\D', '', 'g')) >= 9;
