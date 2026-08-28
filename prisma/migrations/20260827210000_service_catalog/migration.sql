-- Xizmat katalogi: SOTILADIGAN xizmat va uning narxi.
-- Company.activeServices (matritsa ustunlari) bilan aloqasi yo'q — qarang
-- prisma/schema.prisma dagi Service izohi.

CREATE TABLE IF NOT EXISTS "Service" (
  "id"           TEXT NOT NULL,
  "key"          TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "description"  TEXT,
  "defaultPrice" DECIMAL(14,2),
  "periodicity"  TEXT NOT NULL DEFAULT 'monthly',
  "isActive"     BOOLEAN NOT NULL DEFAULT true,
  "sortOrder"    INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Service_key_key" ON "Service"("key");
CREATE INDEX IF NOT EXISTS "Service_isActive_sortOrder_idx" ON "Service"("isActive", "sortOrder");

CREATE TABLE IF NOT EXISTS "CompanyService" (
  "id"        TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "price"     DECIMAL(14,2),
  "qty"       INTEGER NOT NULL DEFAULT 1,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "startedAt" TIMESTAMP(3),
  "endedAt"   TIMESTAMP(3),
  "note"      TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyService_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyService_companyId_serviceId_key" ON "CompanyService"("companyId", "serviceId");
CREATE INDEX IF NOT EXISTS "CompanyService_companyId_isActive_idx" ON "CompanyService"("companyId", "isActive");
CREATE INDEX IF NOT EXISTS "CompanyService_serviceId_idx" ON "CompanyService"("serviceId");

ALTER TABLE "CompanyService"
  DROP CONSTRAINT IF EXISTS "CompanyService_companyId_fkey",
  ADD CONSTRAINT "CompanyService_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyService"
  DROP CONSTRAINT IF EXISTS "CompanyService_serviceId_fkey",
  ADD CONSTRAINT "CompanyService_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
