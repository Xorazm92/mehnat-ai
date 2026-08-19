-- TUSHUM QAYSI KASSAGA TUSHDI
--
-- Qo'lda kiritilgan naqd/plastik tushum shu paytgacha `KassaEntry(income)` ga
-- yozilardi — ya'ni mijozga BOG'LANMAGAN edi va uning qarzini kamaytirmasdi
-- (qarz `Payment` dan hisoblanadi, `lib/debt.ts`). Endi u ham bank va 1C
-- plastik importi bilan bir xil yo'ldan — `PaymentAllocation` orqali — o'tadi.
--
-- Buning uchun taqsimotda kanal (kassa) ma'lumoti kerak: bank tushumida u
-- `BankTransaction.accountId` da bor, qo'lda kiritilganda esa saqlanadigan
-- joyi yo'q edi.
--
-- FK ATAYIN qo'yilmaydi: kanal o'chirilsa tarixiy tushum yozuvi yo'qolmasin
-- (`KassaEntry.channelId` bilan bir xil qoida).

ALTER TABLE "PaymentAllocation" ADD COLUMN IF NOT EXISTS "channelId" TEXT;

CREATE INDEX IF NOT EXISTS "PaymentAllocation_channelId_idx"
  ON "PaymentAllocation"("channelId");
