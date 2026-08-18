-- LEDGER O'LCHOVLARI — naqd qayerda turibdi va kim bilan bog'liq
--
-- MUAMMO. Jurnalda `accountId` bor, lekin "qaysi bank hisobida / qaysi
-- kartada" va "qaysi mijoz / qaysi xodim" degan savollarga javob yo'q.
-- Shu sababdan:
--   * kassa balansi bitta global raqam — bank hisobi, naqd va xodim
--     kartasi bitta qopda. `assertSufficientFunds` "pul bor" deydi, holbuki
--     pulning hammasi kartalarda bo'lishi mumkin;
--   * mijoz qarzi (AR) va to'lanmagan oylik (SALARY_PAYABLE) hisoblarini
--     umuman ochib bo'lmaydi — ular kontragent kesimisiz ma'nosiz.
--
-- NIMA UCHUN USTUN, KOMPOZIT `accountId` EMAS. "CASH_BANK:<uuid>" ko'rinishi
-- ko'rinishidan sodda, lekin to'rt joyda sinadi:
--   1. `getTrialBalance` `groupBy accountId` qiladi — sinov balansi 9 qator
--      o'rniga yuzlab qatorga bo'linib ketardi;
--   2. `getLedgerCashBalance` `accountId = 'CASH'` TENGLIGIGA va
--      `@@index([accountId, period])` ga tayanadi — prefiks skanga aylanardi;
--   3. `lib/monthClose.ts` dagi `accountId !== ACCOUNTS.CASH` tekshiruvi
--      satr tahliliga aylanardi — eng muhim invariant ichida string parsing;
--   4. `ACCOUNTS` yopiq union bo'lishdan to'xtardi, ya'ni bitta harfli xato
--      (`Ar:` va `AR:`) jimgina yangi hisob yaratardi.
--
-- CASH BITTA HISOB BO'LIB QOLADI. Kanal — faqat o'lchov. Shuning uchun
-- bankdan kartaga o'tkazma `CASH(karta) debit / CASH(bank) credit` bo'ladi va
-- hisob darajasida NETTO NOL beradi: umumiy balans o'zgarmaydi, faqat kesim
-- paydo bo'ladi. Bu bugungi xatti-harakatni ham saqlaydi (hozir karta
-- o'tkazmasi balansga umuman ta'sir qilmaydi).
--
-- CHECK QO'YILMAYDI. Tarixiy CASH qatorlarida `channelId` NULL bo'lib qoladi
-- (backfill tarixni qayta yozmaydi — jurnal append-only). NULL = "kanal
-- noma'lum" degan halol chelak; sverkada u nolga intilishi kerak bo'lgan
-- ko'rsatkich bo'ladi. Cheklov backfill tugagach alohida migratsiyada.

ALTER TABLE "LedgerEntry" ADD COLUMN IF NOT EXISTS "channelId"   TEXT;
ALTER TABLE "LedgerEntry" ADD COLUMN IF NOT EXISTS "subjectType" TEXT;
ALTER TABLE "LedgerEntry" ADD COLUMN IF NOT EXISTS "subjectId"   TEXT;

-- Kanal kesimidagi naqd pozitsiya.
CREATE INDEX IF NOT EXISTS "LedgerEntry_accountId_channelId_period_idx"
  ON "LedgerEntry"("accountId", "channelId", "period");

-- Kontragent qoldig'i (AR va SALARY_PAYABLE ikkalasiga ham).
CREATE INDEX IF NOT EXISTS "LedgerEntry_accountId_subjectType_subjectId_period_idx"
  ON "LedgerEntry"("accountId", "subjectType", "subjectId", "period");

-- DIQQAT: mavjud `@@index([accountId, period])` O'CHIRILMAYDI. U yangi
-- indeksning prefiksi EMAS — `accountId='CASH' AND period<=X` so'rovida
-- `channelId` o'rtada turgani uchun `period` faqat filtr bo'lib qolardi.
-- `getLedgerCashBalance` eng issiq so'rov, unga o'z indeksi kerak.
