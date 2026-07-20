-- AlterTable
ALTER TABLE "AccountingPeriod" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedBy" TEXT,
ADD COLUMN     "openingBalance" DECIMAL(14,2),
ADD COLUMN     "reopenReason" TEXT,
ADD COLUMN     "reopenedAt" TIMESTAMP(3),
ADD COLUMN     "reopenedBy" TEXT,
ADD COLUMN     "statusNote" TEXT;

-- AlterTable
ALTER TABLE "FinancialSnapshot" ADD COLUMN     "cashIn" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "cashOut" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "companyCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "employeeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "invalidReason" TEXT,
ADD COLUMN     "invalidatedAt" TIMESTAMP(3),
ADD COLUMN     "invalidatedBy" TEXT,
ADD COLUMN     "isValid" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ledgerBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "loss" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "payrollTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "profit" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "FinancialSnapshot_isValid_idx" ON "FinancialSnapshot"("isValid");

-- =====================================================
-- GLOBAL UNIQUENESS (companyId IS NULL) — Postgres oddiy unique NULL'larni
-- farqlamaydi, shuning uchun global davr/snapshot yagonaligi partial index bilan.
-- =====================================================
CREATE UNIQUE INDEX IF NOT EXISTS "AccountingPeriod_global_year_month_key"
  ON "AccountingPeriod"("year", "month") WHERE "companyId" IS NULL;

-- Faqat VALID snapshotlar yagona: reopen'dan keyin eski (isValid=false) snapshot
-- tarix sifatida qoladi, qayta yopish esa yangi valid snapshot yarata oladi.
CREATE UNIQUE INDEX IF NOT EXISTS "FinancialSnapshot_global_period_key"
  ON "FinancialSnapshot"("period") WHERE "companyId" IS NULL AND "isValid" = true;

-- =====================================================
-- SNAPSHOT IMMUTABILITY — moliyaviy ustunlar DB darajasida qulflanadi.
-- Faqat isValid/invalidatedAt/invalidatedBy/invalidReason o'zgarishi mumkin
-- (reopen invalidatsiyasi). Qolgan har qanday UPDATE xato bilan qaytadi.
-- =====================================================
CREATE OR REPLACE FUNCTION financial_snapshot_immutable_guard() RETURNS trigger AS $$
BEGIN
  IF NEW."openingBalance" IS DISTINCT FROM OLD."openingBalance"
     OR NEW."closingBalance" IS DISTINCT FROM OLD."closingBalance"
     OR NEW."income"        IS DISTINCT FROM OLD."income"
     OR NEW."outflow"       IS DISTINCT FROM OLD."outflow"
     OR NEW."payrollTotal"  IS DISTINCT FROM OLD."payrollTotal"
     OR NEW."cashIn"        IS DISTINCT FROM OLD."cashIn"
     OR NEW."cashOut"       IS DISTINCT FROM OLD."cashOut"
     OR NEW."ledgerBalance" IS DISTINCT FROM OLD."ledgerBalance"
     OR NEW."profit"        IS DISTINCT FROM OLD."profit"
     OR NEW."loss"          IS DISTINCT FROM OLD."loss"
     OR NEW."employeeCount" IS DISTINCT FROM OLD."employeeCount"
     OR NEW."companyCount"  IS DISTINCT FROM OLD."companyCount"
     OR NEW."checksum"      IS DISTINCT FROM OLD."checksum"
     OR NEW."period"        IS DISTINCT FROM OLD."period"
     OR NEW."companyId"     IS DISTINCT FROM OLD."companyId"
     OR NEW."createdBy"     IS DISTINCT FROM OLD."createdBy"
     OR NEW."createdAt"     IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'FinancialSnapshot immutable: moliyaviy maydonlar o''zgartirilmaydi';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS financial_snapshot_immutable ON "FinancialSnapshot";
CREATE TRIGGER financial_snapshot_immutable
  BEFORE UPDATE ON "FinancialSnapshot"
  FOR EACH ROW EXECUTE FUNCTION financial_snapshot_immutable_guard();
