-- HISOBOT FAYLI — skrinshotga qo'shimcha, ixtiyoriy.
--
-- Nazoratchi skrinshotdan o'qiy olmasa, hisobotning O'ZINI ocha olishi kerak.
-- Skrinshot majburiy bo'lib qoladi (tez ko'z yugurtirish uchun).
--
-- Base64 `imageData` bilan bir xil uslubda saqlanadi: qo'shimcha fayl
-- xotirasi qatlami yo'q va `pg_dump` zaxirasi ikkalasini ham qamrab oladi.
-- Hajm chegarasi (2 MB) va tur oq ro'yxati serverda majburlanadi.
ALTER TABLE "ReportProof" ADD COLUMN IF NOT EXISTS "fileData" TEXT;
ALTER TABLE "ReportProof" ADD COLUMN IF NOT EXISTS "fileName" TEXT;
ALTER TABLE "ReportProof" ADD COLUMN IF NOT EXISTS "fileType" TEXT;
