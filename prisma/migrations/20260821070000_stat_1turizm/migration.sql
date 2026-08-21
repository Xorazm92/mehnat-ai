-- 1-turizm (yillik) — tashrif buyuruvchilarga xizmat ko'rsatish va
-- joylashtirish to'g'risidagi hisobot.
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "stat1Turizm" TEXT;
