-- Firma darajasidagi majburiyat istisnosi QAYTARILDI.
-- Model bir marta o'chirilgan edi: "UI'ga ulanmagan, bitta ham yozuvi yo'q".
-- E'tiroz qoplandi — endi istisno admin ekrani orqali kiritiladi va har
-- birida `reason` majburiy.
CREATE TABLE IF NOT EXISTS "CompanyObligationOverride" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "customDueDay" INTEGER,
    "customOffsetDays" INTEGER,
    "responsibleUserId" TEXT,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyObligationOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyObligationOverride_companyId_templateId_key"
    ON "CompanyObligationOverride"("companyId", "templateId");
CREATE INDEX IF NOT EXISTS "CompanyObligationOverride_companyId_idx"
    ON "CompanyObligationOverride"("companyId");

ALTER TABLE "CompanyObligationOverride"
    ADD CONSTRAINT "CompanyObligationOverride_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyObligationOverride"
    ADD CONSTRAINT "CompanyObligationOverride_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "DeadlineTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
