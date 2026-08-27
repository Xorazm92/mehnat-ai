-- Ijtimoiy soliq — INPS'dan ayri hisobot va to'lov (byudjet kodi 36).
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "ijtimoiySoliq" TEXT;
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "ijtimoiySoliqTolov" TEXT;
