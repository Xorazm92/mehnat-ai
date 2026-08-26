-- Shartnoma split'i 2 qismdan (bank + offset) 4 qismga o'tadi:
-- bank + plastik + naqd + offset. Sabab — shartnoma amalda plastik yoki
-- naqd to'lovga ham tuziladi; ular "bank" ichida yashiringanda "shu firma
-- oyiga qancha naqd kutiladi" degan savolga javob qoladigan joy yo'q edi.
--
-- Mavjud qatorlar uchun plastik = naqd = 0: eski ma'lumotda ajratish yo'q,
-- summa allaqachon bankAmount ichida. Nolni "limit belgilanmagan" deb
-- o'qish ilova qatlamining ishi (lib/bank/importStatement.ts) — aks holda
-- bugungi barcha plastik/naqd tushumlari limitga urilib qolardi.
ALTER TABLE "CompanyServiceTerm"
    ADD COLUMN "plastikAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN "naqdAmount"    DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "CompanyServiceTerm"
    DROP CONSTRAINT "CompanyServiceTerm_split_eq_total";

ALTER TABLE "CompanyServiceTerm"
    ADD CONSTRAINT "CompanyServiceTerm_split_eq_total"
    CHECK ("bankAmount" + "plastikAmount" + "naqdAmount" + "offsetAmount" = "totalAmount");
