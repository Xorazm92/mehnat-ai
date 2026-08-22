-- 1C NOMI ↔ BIZNING FIRMA
--
-- 1C hisobotlarida mijoz faqat NOMI bilan keladi, STIR yo'q. Bazadagi
-- firmalarda esa STIR bor va u yagona ishonchli kalit. Vazifa shuning
-- uchun bitta: 1C yozuvini BIR MARTA to'g'ri firmaga bog'lash, keyin STIR
-- o'z ishini qiladi.
--
-- Normalizatsiya (`lib/companyMatch.ts`) 228 qatordan 144 tasini o'zi
-- topadi. Qolgani imlo farqi: "Dksp Amudaryo" ↔ "DSKP AMUDARYO",
-- "Home Spot Toshkent" ↔ boshqacha yozilgan. Ularni mavhum o'xshashlik
-- bilan topish XAVFLI — mijoz qarzini boshqasiga yozib qo'yish undirish
-- ishini buzadi. Shuning uchun ular QO'LDA tasdiqlanadi va shu yerda
-- saqlanadi.
--
-- `alias` unikal: bitta 1C yozuvi bitta firmaga tegishli. Teskarisi emas —
-- bitta firmaning bir necha yozuvi bo'lishi normal.

CREATE TABLE IF NOT EXISTS "CompanyAlias" (
  "id"        TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "alias"     TEXT NOT NULL,
  "source"    TEXT NOT NULL DEFAULT '1c',
  "note"      TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  CONSTRAINT "CompanyAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyAlias_alias_key" ON "CompanyAlias"("alias");
CREATE INDEX IF NOT EXISTS "CompanyAlias_companyId_idx" ON "CompanyAlias"("companyId");

ALTER TABLE "CompanyAlias"
  ADD CONSTRAINT "CompanyAlias_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
