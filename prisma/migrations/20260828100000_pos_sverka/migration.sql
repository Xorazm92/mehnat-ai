-- Kassa apparati ↔ bank ekvayring tushumi sverkasi.
--
-- PosSettlement — HOSILA jadval: BankTransaction'dan qayta hisoblanadi,
-- shuning uchun transactionId yagona (upsert bilan qayta ajratiladi).

CREATE TABLE IF NOT EXISTS "FiscalDevice" (
  "id"             TEXT NOT NULL,
  "fmNumber"       TEXT NOT NULL,
  "label"          TEXT NOT NULL,
  "inn"            TEXT NOT NULL,
  "ownerCompanyId" TEXT,
  "siteKey"        TEXT,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FiscalDevice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FiscalDevice_fmNumber_key" ON "FiscalDevice"("fmNumber");
CREATE INDEX IF NOT EXISTS "FiscalDevice_inn_idx" ON "FiscalDevice"("inn");
CREATE INDEX IF NOT EXISTS "FiscalDevice_ownerCompanyId_idx" ON "FiscalDevice"("ownerCompanyId");
CREATE INDEX IF NOT EXISTS "FiscalDevice_siteKey_idx" ON "FiscalDevice"("siteKey");

CREATE TABLE IF NOT EXISTS "FiscalReportImport" (
  "id"             TEXT NOT NULL,
  "fileName"       TEXT NOT NULL,
  "periodFrom"     TIMESTAMP(3) NOT NULL,
  "periodTo"       TIMESTAMP(3) NOT NULL,
  "rowsParsed"     INTEGER NOT NULL DEFAULT 0,
  "rowsInserted"   INTEGER NOT NULL DEFAULT 0,
  "rowsUpdated"    INTEGER NOT NULL DEFAULT 0,
  "unknownDevices" TEXT,
  "importedBy"     TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FiscalReportImport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FiscalReportImport_createdAt_idx" ON "FiscalReportImport"("createdAt");

CREATE TABLE IF NOT EXISTS "FiscalDailyReport" (
  "id"             TEXT NOT NULL,
  "deviceId"       TEXT NOT NULL,
  "date"           TIMESTAMP(3) NOT NULL,
  "cashAmount"     DECIMAL(14,2) NOT NULL,
  "cardAmount"     DECIMAL(14,2) NOT NULL,
  "totalAmount"    DECIMAL(14,2) NOT NULL,
  "returnedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "receiptCount"   INTEGER NOT NULL DEFAULT 0,
  "importId"       TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FiscalDailyReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FiscalDailyReport_deviceId_date_key" ON "FiscalDailyReport"("deviceId", "date");
CREATE INDEX IF NOT EXISTS "FiscalDailyReport_date_idx" ON "FiscalDailyReport"("date");

CREATE TABLE IF NOT EXISTS "PosTerminal" (
  "id"        TEXT NOT NULL,
  "code"      TEXT NOT NULL,
  "channel"   TEXT NOT NULL,
  "label"     TEXT,
  "accountId" TEXT,
  "siteKey"   TEXT,
  "inScope"   BOOLEAN NOT NULL DEFAULT false,
  "scopeNote" TEXT,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PosTerminal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PosTerminal_code_key" ON "PosTerminal"("code");
CREATE INDEX IF NOT EXISTS "PosTerminal_channel_idx" ON "PosTerminal"("channel");
CREATE INDEX IF NOT EXISTS "PosTerminal_inScope_idx" ON "PosTerminal"("inScope");
CREATE INDEX IF NOT EXISTS "PosTerminal_siteKey_idx" ON "PosTerminal"("siteKey");

CREATE TABLE IF NOT EXISTS "PosSettlement" (
  "id"               TEXT NOT NULL,
  "transactionId"    TEXT NOT NULL,
  "accountId"        TEXT NOT NULL,
  "terminalId"       TEXT NOT NULL,
  "opDate"           TIMESTAMP(3) NOT NULL,
  "dateSource"       TEXT NOT NULL DEFAULT 'detail',
  "docDate"          TIMESTAMP(3) NOT NULL,
  "factAmount"       DECIMAL(14,2) NOT NULL,
  "grossAmount"      DECIMAL(14,2) NOT NULL,
  "commissionAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "isReversal"       BOOLEAN NOT NULL DEFAULT false,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PosSettlement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PosSettlement_transactionId_key" ON "PosSettlement"("transactionId");
CREATE INDEX IF NOT EXISTS "PosSettlement_opDate_idx" ON "PosSettlement"("opDate");
CREATE INDEX IF NOT EXISTS "PosSettlement_terminalId_opDate_idx" ON "PosSettlement"("terminalId", "opDate");
CREATE INDEX IF NOT EXISTS "PosSettlement_accountId_opDate_idx" ON "PosSettlement"("accountId", "opDate");

DO $$ BEGIN
  ALTER TABLE "FiscalDevice" ADD CONSTRAINT "FiscalDevice_ownerCompanyId_fkey"
    FOREIGN KEY ("ownerCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FiscalReportImport" ADD CONSTRAINT "FiscalReportImport_importedBy_fkey"
    FOREIGN KEY ("importedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FiscalDailyReport" ADD CONSTRAINT "FiscalDailyReport_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "FiscalDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FiscalDailyReport" ADD CONSTRAINT "FiscalDailyReport_importId_fkey"
    FOREIGN KEY ("importId") REFERENCES "FiscalReportImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PosTerminal" ADD CONSTRAINT "PosTerminal_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PosSettlement" ADD CONSTRAINT "PosSettlement_terminalId_fkey"
    FOREIGN KEY ("terminalId") REFERENCES "PosTerminal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
