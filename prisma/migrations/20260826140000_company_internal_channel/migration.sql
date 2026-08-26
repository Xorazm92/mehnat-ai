-- OG'ZAKI SHARTNOMA TOMONI.
--
-- Mijozlarning bir qismi bizning 10 ta yuridik shaxsimizdan biri bilan
-- shartnoma tuzmaydi: og'zaki kelishuv asosida plastikka o'tkazadi yoki
-- naqd to'laydi. Ilgari "Ichki shartnoma tomoni" tanlagichi FAQAT firmani
-- qabul qilardi, shuning uchun bunday mijozning tomoni "Tanlanmagan" bo'lib
-- qolar va pul qayerga tushishi hech qayerda yozilmasdi.
--
-- Soxta "Plastik"/"Naqd" nomli firma OCHILMAYDI — bir marta shunday
-- qilingan va olib tashlangan: STIRsiz yozuv hisobotlarda haqiqiy firma
-- sifatida sanaladi. Tomon o'rniga DisbursementChannel'ga bog'lanadi,
-- ya'ni pul aynan qaysi plastikka/kassaga tushishi bilan bir manbadan.
ALTER TABLE "Company" ADD COLUMN "internalChannelId" TEXT;

ALTER TABLE "Company"
    ADD CONSTRAINT "Company_internalChannelId_fkey"
    FOREIGN KEY ("internalChannelId") REFERENCES "DisbursementChannel"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Tomon BITTA bo'ladi: yo o'z firmamiz, yo plastik/naqd kanali. Ikkalasi
-- birga yozilsa "shartnoma kim bilan tuzilgan" degan savolga ikki xil
-- javob chiqadi.
ALTER TABLE "Company"
    ADD CONSTRAINT "Company_one_internal_party"
    CHECK ("internalContractorId" IS NULL OR "internalChannelId" IS NULL);

CREATE INDEX "Company_internalChannelId_idx" ON "Company"("internalChannelId");

-- Plastik va naqd kanallari MAS'UL ODAMGA biriktiriladi: plastik tushum
-- ta'sischi Otabek Ro'zmetovning kartasiga tushadi, naqdni esa faqat
-- Alisher qabul qiladi va kiritadi. Xodim topilmasa yozuv o'zgarmaydi —
-- migratsiya baribir o'tadi, biriktirishni UI'dan qilsa bo'ladi.
UPDATE "DisbursementChannel" c
SET "employeeId" = u."id"
FROM "User" u
WHERE c."type" = 'plastik' AND c."employeeId" IS NULL
  AND u."fullName" ILIKE '%Otabek%' AND u."fullName" ILIKE '%zmetov%';

UPDATE "DisbursementChannel" c
SET "employeeId" = u."id"
FROM "User" u
WHERE c."type" = 'cash' AND c."label" ILIKE '%seyf%' AND c."employeeId" IS NULL
  AND u."fullName" ILIKE '%Alisher%';
