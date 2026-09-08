-- Kassa apparati kunlik hisobotining TO'LOV KANALLARI kesimi.
--
-- Soliq kabineti to'lov turi bo'yicha filtrlangan hisobot beradi (Click,
-- Payme, Uzum...). U asosiy hisobotning ichki bo'lagi, shuning uchun
-- `cardAmount` ga qo'shilmaydi — alohida jsonb da saqlanadi:
--   { "click": 1200000, "payme": 3400000 }
-- Kalitlar `PosChannel` qiymatlari (lib/pos/types.ts).
--
-- Qo'shimcha ustun NULL bilan qo'shiladi: mavjud qatorlar o'zgarmaydi.
ALTER TABLE "FiscalDailyReport" ADD COLUMN "channels" JSONB;
