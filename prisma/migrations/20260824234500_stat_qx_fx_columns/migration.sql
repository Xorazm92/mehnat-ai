-- Yangi statistika ustunlari (Telegram'da so'ralgan hisobotlar):
--  - stat1HisobotMazmuni: davlat statistika hisobotlari mazmuni so'rovnomasi (yillik, 1-iyul)
--  - stat4Qx: 4-qx (tashkilot) qishloq xo'jaligi faoliyati (choraklik, keyingi oy 5-kun)
--  - stat1Qx: 1-qx (tashkilot) qishloq xo'jaligi faoliyati (yillik, 10-aprel)
--  - stat1Fx: 1-fx fermer xo'jaligi faoliyati (yillik, 10-mart)
--  - stat4Fx: 4-fx fermer xo'jaligi faoliyati (choraklik, keyingi oy 5-kun)
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "stat1HisobotMazmuni" TEXT;
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "stat4Qx" TEXT;
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "stat1Qx" TEXT;
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "stat1Fx" TEXT;
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "stat4Fx" TEXT;
