-- XARAJATGA PUL MANBAI
--
-- Bugungacha xarajat "qayerdan to'landi" degan savolga javob bermasdi:
-- `Expense` da firma ham, kanal ham yo'q edi, `paymentMethod` esa faqat USULNI
-- ("naqd/plastik/schyot") bildirardi — KIMNING schyoti ekanini emas.
--
-- `DisbursementChannel` allaqachon ikkala turni ham saqlay oladi (o'z firma
-- hisobi va xodim plastigi), shuning uchun yangi jadval kerak emas — bitta
-- `channelId` yetarli.
--
-- FK ATAYLAB QO'YILMAYDI: `KassaEntry.channelId` shu uslubda yozilgan —
-- kanal o'chirilsa tarixiy moliyaviy yozuv yo'qolmasligi kerak.
-- NULL ga ruxsat: mavjud xarajatlarda manba yo'q, ular buzilmasin.
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "channelId" TEXT;

CREATE INDEX IF NOT EXISTS "Expense_channelId_idx" ON "Expense"("channelId");
