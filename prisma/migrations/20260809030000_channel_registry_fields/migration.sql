-- O'zini-o'zi band qilgan shaxsning rasmiy ma'lumotlari.
--
-- "Band qilganlar" ro'yxatida har bir shaxs uchun tranzit hisob, karta,
-- soliq ma'lumotnomasi raqami, JSHSHIR va band sanasi yuritiladi. Bularsiz
-- kanal faqat "kimningdir kartasi" bo'lib qoladi va soliq hisobotida
-- kimga qaysi asosda pul o'tkazilgani ko'rinmaydi.
--
-- QO'LDA yozilgan (prisma migrate dev ISHLATILMAYDI — bu tarmoqda schema
-- bilan baza o'rtasida boshqa drift bor).

ALTER TABLE "DisbursementChannel" ADD COLUMN "ownFirmId" TEXT;
ALTER TABLE "DisbursementChannel" ADD COLUMN "mfo" TEXT;
ALTER TABLE "DisbursementChannel" ADD COLUMN "transitAccount" TEXT;
ALTER TABLE "DisbursementChannel" ADD COLUMN "certificateNo" TEXT;
ALTER TABLE "DisbursementChannel" ADD COLUMN "pinfl" TEXT;
ALTER TABLE "DisbursementChannel" ADD COLUMN "engagedAt" TIMESTAMP(3);
ALTER TABLE "DisbursementChannel" ADD COLUMN "activityType" TEXT;

CREATE INDEX "DisbursementChannel_ownFirmId_idx" ON "DisbursementChannel"("ownFirmId");

-- Firma o'chirilsa kanal qolsin (tarix yo'qolmasin).
ALTER TABLE "DisbursementChannel"
  ADD CONSTRAINT "DisbursementChannel_ownFirmId_fkey"
  FOREIGN KEY ("ownFirmId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
