-- ICHKI SHARTNOMA TOMONI — mijoz shartnomasi ASRO'ning qaysi yuridik shaxsi
-- nomidan tuzilgani.
--
-- MUAMMO: ekranda "Ichki shartnoma tomoni" tanlagichi bor edi va `types.ts` da
-- `internalContractor` maydoni turardi, lekin `Company` jadvalida bunday ustun
-- YO'Q edi (faqat `isInternalContractor` boolean). `sanitizeCompanyData` uni oq
-- ro'yxatda topmay jimgina tashlab yuborardi. Foydalanuvchi tanlaydi, "firma
-- qo'shildi" degan muvaffaqiyat xabarini oladi, tahrirlashga qaytganda esa
-- maydon yana "Tanlanmagan" bo'lib turadi.
--
-- NOM emas, ID saqlanadi: o'z firmalarimiz nomi o'zgarib turadi
-- ("HOME SPOT STORY" → "FINFO INFO BEST"), bog'lanish esa uzilmasligi kerak.
--
-- `ON DELETE SET NULL`: o'z firma o'chirilsa mijoz qatori YO'QOLMASIN — faqat
-- bog'lanish uziladi.
--
-- Qo'shimcha va qaytariladigan: ustun nullable, mavjud qatorlarga tegilmaydi.

ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "internalContractorId" TEXT;

CREATE INDEX IF NOT EXISTS "Company_internalContractorId_idx"
  ON "Company"("internalContractorId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Company_internalContractorId_fkey'
  ) THEN
    ALTER TABLE "Company"
      ADD CONSTRAINT "Company_internalContractorId_fkey"
      FOREIGN KEY ("internalContractorId") REFERENCES "Company"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
