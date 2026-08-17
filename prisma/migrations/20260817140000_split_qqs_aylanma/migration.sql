-- "AYLANMA/QQS" USTUNINI IKKIGA BO'LISH
--
-- MUAMMO: matritsada bitta `aylanmaQqs` katagi IKKI XIL hisobotni ko'tarardi.
-- Ular bir-biriga umuman o'xshamaydi:
--
--   QQS deklaratsiyasi  — OYLIK,     20-kun, faqat `taxRegime = 'vat'`
--   Aylanma soliq       — CHORAKLIK, 15-kun, faqat `taxRegime = 'turnover'`
--
-- Majburiyat dvigatelida ular allaqachon alohida shablon (QQS_DECL va
-- AYLANMA_SOLIQ, har biri o'z `tax_regime` kriteriyasi bilan), lekin matritsa
-- ikkalasini bitta ustunga yig'ib turardi. Natijada QQS to'lovchi ham,
-- aylanma rejimidagi firma ham AYNAN SHU katakni to'ldirardi va "kim nimani
-- topshirishi kerak" degan savolga javob berib bo'lmasdi.
--
-- MA'LUMOT KO'CHIRISH: eski katak qiymati firmaning SOLIQ REJIMIGA qarab
-- yangi ustunga o'tadi. Rejimi boshqa firmalarda (fixed / yatt / income) bu
-- hisobot umuman talab qilinmaydi — ularning qiymati ko'chirilmaydi va eski
-- ustunda qoladi.
--
-- ESKI USTUNLAR ATAYLAB O'CHIRILMAYDI: ko'chirish natijasini solishtirish va
-- kerak bo'lsa ortga qaytarish uchun. Ularni keyinroq, tekshiruvdan so'ng
-- alohida migratsiya olib tashlaydi.

ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "qqs" TEXT;
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "qqsTolov" TEXT;
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "aylanma" TEXT;
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "aylanmaTolov" TEXT;

-- QQS to'lovchilar → `qqs`
UPDATE "MonthlyReport" mr
SET "qqs" = mr."aylanmaQqs"
FROM "Company" c
WHERE c."id" = mr."companyId"
  AND c."taxRegime" = 'vat'
  AND mr."aylanmaQqs" IS NOT NULL
  AND mr."qqs" IS NULL;

UPDATE "MonthlyReport" mr
SET "qqsTolov" = mr."aylanmaQqsTolov"
FROM "Company" c
WHERE c."id" = mr."companyId"
  AND c."taxRegime" = 'vat'
  AND mr."aylanmaQqsTolov" IS NOT NULL
  AND mr."qqsTolov" IS NULL;

-- Aylanma rejimi → `aylanma`
UPDATE "MonthlyReport" mr
SET "aylanma" = mr."aylanmaQqs"
FROM "Company" c
WHERE c."id" = mr."companyId"
  AND c."taxRegime" = 'turnover'
  AND mr."aylanmaQqs" IS NOT NULL
  AND mr."aylanma" IS NULL;

UPDATE "MonthlyReport" mr
SET "aylanmaTolov" = mr."aylanmaQqsTolov"
FROM "Company" c
WHERE c."id" = mr."companyId"
  AND c."taxRegime" = 'turnover'
  AND mr."aylanmaQqsTolov" IS NOT NULL
  AND mr."aylanmaTolov" IS NULL;

-- Dalillar (skrinshotlar) ham yangi ustun kalitiga ko'chadi: `ReportProof.colKey`
-- matritsa kaliti bo'yicha saqlanadi, aks holda ko'chirilgan katakdagi
-- skrinshot "biriktirilmagan" bo'lib qolardi.
UPDATE "ReportProof" rp
SET "colKey" = CASE rp."colKey"
                 WHEN 'aylanma_qqs'       THEN 'qqs'
                 WHEN 'aylanma_qqs_tolov' THEN 'qqs_tolov'
               END
FROM "Company" c
WHERE c."id" = rp."companyId"
  AND c."taxRegime" = 'vat'
  AND rp."colKey" IN ('aylanma_qqs', 'aylanma_qqs_tolov');

UPDATE "ReportProof" rp
SET "colKey" = CASE rp."colKey"
                 WHEN 'aylanma_qqs'       THEN 'aylanma'
                 WHEN 'aylanma_qqs_tolov' THEN 'aylanma_tolov'
               END
FROM "Company" c
WHERE c."id" = rp."companyId"
  AND c."taxRegime" = 'turnover'
  AND rp."colKey" IN ('aylanma_qqs', 'aylanma_qqs_tolov');
