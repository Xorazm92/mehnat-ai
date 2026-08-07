-- PaymentAllocation'ni umumlashtirish: bank + plastik + naqd
--
-- Sabab: iyul ma'lumotida 4 ta mijoz bir oyda HAM bank orqali, HAM plastik
-- karta bilan to'lagan. Plastikni alohida joyga (KassaEntry) yozish balansni
-- to'g'ri ko'rsatardi, lekin o'sha mijozlarning QARZI yopilmay qolardi.
-- Endi uchala manba ham shu jadvalga tushadi va `Payment.amount` ularning
-- yig'indisidan hisoblanadi.
--
-- QO'LDA yozilgan (prisma migrate dev ISHLATILMAGAN — bu tarmoqda schema bilan
-- baza o'rtasida boshqa drift bor). Mavjud 134 qator saqlanadi va ularga
-- dedupKey = 'bank:<bankTransactionId>' qiymati beriladi.

-- 1. Bank tranzaksiyasi endi majburiy emas (plastik/naqd uchun bo'sh qoladi).
ALTER TABLE "PaymentAllocation" ALTER COLUMN "bankTransactionId" DROP NOT NULL;

-- 2. Yangi ustunlar.
ALTER TABLE "PaymentAllocation" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'bank';
ALTER TABLE "PaymentAllocation" ADD COLUMN "externalRef" TEXT;
ALTER TABLE "PaymentAllocation" ADD COLUMN "receivedAt" TIMESTAMP(3);
ALTER TABLE "PaymentAllocation" ADD COLUMN "dedupKey" TEXT;

-- 3. Mavjud qatorlarni to'ldirish (hammasi bank manbaidan).
UPDATE "PaymentAllocation"
   SET "dedupKey" = 'bank:' || "bankTransactionId",
       "receivedAt" = (SELECT t."valueDate" FROM "BankTransaction" t WHERE t.id = "PaymentAllocation"."bankTransactionId")
 WHERE "dedupKey" IS NULL;

-- 4. Endi majburiy va unikal qilish mumkin.
ALTER TABLE "PaymentAllocation" ALTER COLUMN "dedupKey" SET NOT NULL;
CREATE UNIQUE INDEX "PaymentAllocation_dedupKey_key" ON "PaymentAllocation"("dedupKey");
CREATE INDEX "PaymentAllocation_source_idx" ON "PaymentAllocation"("source");

-- 5. Eski juftlik-unikali endi kerak emas: bankTransactionId NULL bo'lganda
--    Postgres NULL'larni farqli deb biladi, ya'ni u plastik qatorlarni
--    ushlab qololmaydi. Uning o'rnini dedupKey egalladi.
DROP INDEX IF EXISTS "PaymentAllocation_bankTransactionId_paymentId_key";
