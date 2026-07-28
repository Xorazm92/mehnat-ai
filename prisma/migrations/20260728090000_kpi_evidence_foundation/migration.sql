-- KPI dalil qatlami uchun poydevor (Faza 0).
-- Qo'lda yozilgan: schema'da bu migratsiyaga tegishli bo'lmagan boshqa
-- o'zgarishlar ham bor, shuning uchun `migrate dev` ISHLATILMAYDI.

-- 1) Jarimani firma bo'yicha auditlash uchun. approveEmployeeSalary
--    companyBreakdowns'ni bitta summaga yig'ardi va "o'sha firmadagi ulushdan -1%"
--    atributsiyasi faqat erkin matnda qolardi.
ALTER TABLE "PayrollAdjustment" ADD COLUMN "companyId" TEXT;

-- 2) Davomat: bir xodim — bir kun — bir qator.
--    Avval mavjud qatorlarni UTC yarim tuniga keltiramiz (ikkala yozuvchi ham
--    "YYYY-MM-DD" dan quradi, lekin eski/import qatorlarda vaqt bo'lishi mumkin),
--    keyin dublikatlarni eng yangisini qoldirib tozalaymiz. Busiz constraint
--    o'rnatilmaydi va `migrate deploy` prodda yiqiladi.
UPDATE "Attendance" SET "date" = date_trunc('day', "date")
WHERE "date" <> date_trunc('day', "date");

DELETE FROM "Attendance" a
USING "Attendance" b
WHERE a."userId" = b."userId"
  AND a."date" = b."date"
  AND (a."updatedAt" < b."updatedAt" OR (a."updatedAt" = b."updatedAt" AND a."id" < b."id"));

DROP INDEX IF EXISTS "Attendance_userId_idx";
CREATE UNIQUE INDEX "Attendance_userId_date_key" ON "Attendance"("userId", "date");

-- 3) ShiftCover — kim kimning o'rniga ishladi (yo'qlik puli o'rinbosarga o'tadi).
CREATE TABLE "ShiftCover" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "absentUserId" TEXT NOT NULL,
    "coverUserId" TEXT NOT NULL,
    "companyId" TEXT,
    "kind" TEXT NOT NULL,
    "approvedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftCover_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShiftCover_coverUserId_idx" ON "ShiftCover"("coverUserId");
CREATE INDEX "ShiftCover_date_absentUserId_idx" ON "ShiftCover"("date", "absentUserId");

-- Postgres NULL'larni bir-biridan farqli deb biladi, shuning uchun oddiy
-- UNIQUE(date, absentUserId, companyId) firma bo'yicha emas, umumiy (companyId
-- NULL) ikkita yozuvni o'tkazib yuborardi va o'rinbosarga pul ikki marta
-- to'lanardi. Ikkita QISMIY unique indeks bu teshikni yopadi.
CREATE UNIQUE INDEX "ShiftCover_day_absent_company_key"
    ON "ShiftCover"("date", "absentUserId", "companyId")
    WHERE "companyId" IS NOT NULL;

CREATE UNIQUE INDEX "ShiftCover_day_absent_global_key"
    ON "ShiftCover"("date", "absentUserId")
    WHERE "companyId" IS NULL;
