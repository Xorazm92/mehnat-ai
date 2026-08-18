-- KASSA YOZUVINING TAKRORLANMASLIK KALITI
--
-- `PaymentAllocation.dedupKey` va `TransitEntry.dedupKey` bor, `KassaEntry` da
-- yo'q edi. Natijada bank chiqimini yoki `scripts/import-kassa-data.ts` ni
-- ikkinchi marta yurgizish JIM RAVISHDA dublikat xarajat yozardi — bu esa
-- to'g'ridan-to'g'ri kassa balansini pasaytiradi.
--
-- Qisman unikal indeks: eski qatorlarda `dedupKey` NULL bo'lib qoladi va
-- Postgres NULL'larni bir-biridan farqli deb hisoblaydi, ya'ni qo'lda
-- kiritilgan yozuvlar bir-biriga xalaqit bermaydi. `db push` qisman indeksni
-- YARATMAYDI — shuning uchun u faqat shu SQL faylida yashaydi.

ALTER TABLE "KassaEntry" ADD COLUMN IF NOT EXISTS "dedupKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "KassaEntry_dedupKey_key"
  ON "KassaEntry"("dedupKey")
  WHERE "dedupKey" IS NOT NULL;
