-- Fayllarni bazadan diskka ko'chirish uchun havola ustunlari.
-- Eski base64 ustunlari ATAYLAB qoladi: o'qish ikki yo'lli ishlaydi
-- (ref ?? base64), shuning uchun ko'chirish tugamaguncha hech narsa buzilmaydi.
ALTER TABLE "ReportProof" ADD COLUMN IF NOT EXISTS "imageRef" TEXT;
ALTER TABLE "ReportProof" ADD COLUMN IF NOT EXISTS "fileRef" TEXT;
ALTER TABLE "Document"   ADD COLUMN IF NOT EXISTS "storageRef" TEXT;
