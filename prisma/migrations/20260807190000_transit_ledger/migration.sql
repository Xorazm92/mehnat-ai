-- TRANZIT DAFTARI — xodim kartasi orqali o'tadigan pul oqimi.
--
-- Ba'zi to'lovlar o'zini-o'zi band qilgan xodim kartasi orqali qilinadi:
--   bank hisobi → xodim kartasi → ijara / aloqa / ovqat
-- Iyul vipiskasida bunday 77 ta o'tkazma bor (547 mln so'm), lekin
-- kartaga chiqqandan keyin pul qayerga ketgani ko'rinmasdi.
--
-- Kartaga tushgan pul HALI XARAJAT EMAS — u firmaning puli, boshqa joyda
-- turibdi. Shuning uchun kirimda KassaEntry yozilmaydi (aks holda xarajat
-- ikki marta sanalardi), faqat kartadan sarflanganda yoziladi.
--
-- QO'LDA yozilgan (prisma migrate dev ISHLATILMAYDI — bu tarmoqda boshqa
-- drift bor). Hech qanday mavjud ma'lumot o'zgarmaydi.

CREATE TABLE "TransitEntry" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "bankTransactionId" TEXT,
    "kassaEntryId" TEXT,
    "dedupKey" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransitEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TransitEntry_dedupKey_key" ON "TransitEntry"("dedupKey");
CREATE INDEX "TransitEntry_channelId_date_idx" ON "TransitEntry"("channelId", "date");
CREATE INDEX "TransitEntry_direction_idx" ON "TransitEntry"("direction");

ALTER TABLE "TransitEntry" ADD CONSTRAINT "TransitEntry_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "DisbursementChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Bir karta bir marta ro'yxatga olinsin (avtomatik yaratishda takror bo'lmasin).
CREATE UNIQUE INDEX "DisbursementChannel_type_cardMask_key"
  ON "DisbursementChannel"("type", "cardMask");
