-- KASSA YOZUVIGA TASDIQ OQIMI — `Expense` jadvalini birlashtirish uchun
--
-- MUAMMO. Tizimda IKKITA "pul chiqdi" jadvali bor:
--   `Expense`               — tasdiq oqimi bilan (1 mln / 10 mln chegaralari)
--   `KassaEntry(expense)`   — tasdiqsiz, to'g'ridan-to'g'ri
--
-- Prodda `Expense` da 3 ta `pending` qator bor va NOLTA tasdiqlangan, ya'ni u
-- balansga umuman hissa qo'shmaydi. Lekin uning atrofida to'liq modul qurilgan:
-- alohida ekran (`/expenses`), 559 qatorlik komponent, va OLTITA modulda
-- alohida shox (`lib/balance.ts`, `lib/monthClose.ts`, `lib/reconciliation.ts`,
-- `scripts/backfill-ledger.ts`, `server/kassa.ts`, `lib/cashGate.ts`).
--
-- YECHIM. Tasdiq maydonlari `KassaEntry` ga ko'chadi va bitta jadval qoladi.
--
-- `status` STANDART "approved" — mavjud 691 qator tasdiqsiz yozilgan va ular
-- allaqachon balansda sanaladi. Standart "pending" bo'lsa, migratsiya ijro
-- etilgan zahoti butun kassa balansi nolga tushib ketardi.
--
-- JADVAL HOZIR O'CHIRILMAYDI. `Expense` qoladi: ko'chirish tekshirilgach,
-- alohida migratsiyada tashlanadi. Bir migratsiyada ham ko'chirish, ham
-- o'chirish — xatolikda qaytarib bo'lmaydigan holat.

ALTER TABLE "KassaEntry" ADD COLUMN IF NOT EXISTS "status"         TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE "KassaEntry" ADD COLUMN IF NOT EXISTS "approvedBy"     TEXT;
ALTER TABLE "KassaEntry" ADD COLUMN IF NOT EXISTS "approvedAt"     TIMESTAMP(3);
ALTER TABLE "KassaEntry" ADD COLUMN IF NOT EXISTS "rejectedReason" TEXT;

-- Tasdiq kutayotganlar navbati — `getKassaEntries` va oy yopish checklisti
-- shu bo'yicha so'raydi.
CREATE INDEX IF NOT EXISTS "KassaEntry_status_idx" ON "KassaEntry"("status");
