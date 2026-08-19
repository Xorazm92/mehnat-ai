-- QARZ BO'YICHA ALOQA IZI
--
-- `/kassa/qarzdorlik` qarz SUMMASINI ko'rsatardi, lekin u bilan NIMA
-- QILINGANINI emas. Natijada ro'yxat har kuni bir xil turar va rahbar uni
-- signal emas, shovqin deb o'qirdi — `lib/debt.ts` sharhida tasvirlangan
-- muammoning aynan takrori, faqat boshqa darajada.
--
-- Uch ustun: oxirgi qachon gaplashildi, keyingi suhbat qachonga belgilandi,
-- va nima kelishildi.

ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "debtContactedAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "debtNextContactAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "debtContactNote" TEXT;

CREATE INDEX IF NOT EXISTS "Company_debtNextContactAt_idx"
  ON "Company"("debtNextContactAt");
