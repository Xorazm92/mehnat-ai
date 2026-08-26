-- Reestr (docs/SOLIQ_TOLOV_KODLARI.md) bo'yicha to'liqlashtirish:
--   * byudjet kodi bor har bir soliqqa TO'LOV yarmi,
--   * choraklik foyda avans ma'lumotnomasi,
--   * mol-mulk / yer / suv soliqlarining YILLIK yakuniy hisob-kitobi.
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "aksizSoligiTolov" TEXT;
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "nedroSoligiTolov" TEXT;
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "norezidentFoydaTolov" TEXT;
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "norezidentNdsTolov" TEXT;
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "molMulkSoligiTolov" TEXT;
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "yerSoligiTolov" TEXT;
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "suvSoligiTolov" TEXT;
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "jismoniyIjaraTolov" TEXT;
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "bonakTolov" TEXT;
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "foydaAvansHisobot" TEXT;
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "molMulkYillik" TEXT;
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "yerYillik" TEXT;
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "suvYillik" TEXT;
