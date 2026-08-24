-- CompanyServiceTerm — shartnoma summasi + bank/offset split, VERSIYALANGAN.
--
-- Oraliqlar kesishmasligi uchun btree_gist + EXCLUDE constraint ishlatiladi:
-- @@unique([companyId, effectiveFrom]) buni yetarlicha to'smaydi (effectiveTo
-- noto'g'ri yozilsa yoki gap qolsa, ikki versiya bitta davrga mos kelib
-- qolishi mumkin). EXCLUDE — DB darajasida, tranzaksiyadan qat'i nazar
-- kafolatlanadigan yagona yo'l.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE "CompanyServiceTerm" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "bankAmount" DECIMAL(14,2) NOT NULL,
    "offsetAmount" DECIMAL(14,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyServiceTerm_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CompanyServiceTerm"
    ADD CONSTRAINT "CompanyServiceTerm_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Split yig'indisi umumiy summaga teng bo'lishi shart.
ALTER TABLE "CompanyServiceTerm"
    ADD CONSTRAINT "CompanyServiceTerm_split_eq_total"
    CHECK ("bankAmount" + "offsetAmount" = "totalAmount");

-- effectiveTo > effectiveFrom (yoki NULL — hali yopilmagan versiya).
ALTER TABLE "CompanyServiceTerm"
    ADD CONSTRAINT "CompanyServiceTerm_effectiveTo_after_from"
    CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");

CREATE INDEX "CompanyServiceTerm_companyId_effectiveFrom_idx" ON "CompanyServiceTerm"("companyId", "effectiveFrom");
CREATE INDEX "CompanyServiceTerm_companyId_effectiveTo_idx" ON "CompanyServiceTerm"("companyId", "effectiveTo");

-- Bitta firmaning davrlari HECH QACHON kesishmasin (yarim ochiq oraliq —
-- effectiveTo o'zi yangi versiyaning boshlanish nuqtasi, ikkalasi ustma-ust
-- tushmaydi). NULL effectiveTo = cheksizlikkacha ochiq.
ALTER TABLE "CompanyServiceTerm"
    ADD CONSTRAINT "CompanyServiceTerm_no_overlap"
    EXCLUDE USING gist (
        "companyId" WITH =,
        tsrange("effectiveFrom", "effectiveTo", '[)') WITH &&
    );

-- Backfill: mavjud Company.contractAmount → dastlabki versiya. Split
-- to'liq bank deb belgilanadi (offset=0) — mavjud ma'lumotda ajratish yo'q,
-- xavfsiz taraf: pul kassaga tushgan deb hisoblanadi, kam emas ko'p.
-- effectiveFrom = 2026-01-01 — seed-deadline-templates.ts dagi CONTRACT_BACKFILL
-- bilan bir xil anchor, shu sanadan oldingi davr uchun term so'ralmaydi.
INSERT INTO "CompanyServiceTerm" ("id", "companyId", "totalAmount", "bankAmount", "offsetAmount", "effectiveFrom", "reason", "createdAt")
SELECT gen_random_uuid(), "id", "contractAmount", "contractAmount", 0, TIMESTAMP '2026-01-01 00:00:00', 'backfill: Company.contractAmount dan ko''chirildi', CURRENT_TIMESTAMP
FROM "Company"
WHERE "contractAmount" IS NOT NULL;
