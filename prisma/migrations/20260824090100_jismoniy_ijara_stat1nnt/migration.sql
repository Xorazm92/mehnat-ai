-- Yangi matritsa ustunlari:
--  - jismoniyIjara: jismoniy shaxslarni ijara xisoboti va to'lovi (OYLIK)
--  - stat1Nnt: 1-NNT yillik statistika hisoboti
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "jismoniyIjara" TEXT;
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "stat1Nnt" TEXT;
