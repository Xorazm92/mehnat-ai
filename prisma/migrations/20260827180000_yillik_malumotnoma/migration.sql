-- Mol-mulk va suv soliqlarining YILLIK ma'lumotnomasi (yil boshida) — yil
-- oxiridagi yakuniy hisob-kitobdan ayri katak.
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "molMulkMalumotnoma" TEXT;
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "suvMalumotnoma" TEXT;
