-- Amallar matritsasiga ikkita statistika hisoboti:
--   1-tib (aholi)  — yillik
--   4-moliya       — choraklik, muddat chorak ICHIDA (18-mart/iyun/sen/dek)
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "stat1Tib" TEXT;
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "stat4Moliya" TEXT;

-- Yangi muddat ankori: davrning oxirgi oyidagi N-kun. Mavjud ikkala ankor ham
-- "1-sentabr holatiga, 18-sentabrgacha" turidagi muddatni ifodalay olmaydi.
ALTER TYPE "DeadlineAnchorType" ADD VALUE IF NOT EXISTS 'period_end_month_day';
