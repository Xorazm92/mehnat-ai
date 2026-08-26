-- Dividend solig'i (byudjet to'lov kodi 138) — hisobot va to'lov yarmi.
-- Matritsada ustun bor edi-yu, DB ustuni yo'q edi: ta'sischiga taqsimot
-- qilgan firmalarda bu soliq hech qayerda kuzatilmasdi.
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "dividendSoligi" TEXT;
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "dividendSoligiTolov" TEXT;
