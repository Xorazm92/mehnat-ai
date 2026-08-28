-- Ichki schyot-faktura. To'lov holati BU YERDA saqlanmaydi — u
-- PaymentAllocation ning ishi (qarang prisma/schema.prisma dagi Invoice izohi).

CREATE TABLE IF NOT EXISTS "Invoice" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  "number"        TEXT NOT NULL,
  "period"        TEXT NOT NULL,
  "issuedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueAt"         TIMESTAMP(3),
  "status"        TEXT NOT NULL DEFAULT 'draft',
  "currency"      TEXT NOT NULL DEFAULT 'UZS',
  "total"         DECIMAL(14,2) NOT NULL,
  "note"          TEXT,
  "cancelReason"  TEXT,
  "createdById"   TEXT,
  "createdByName" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_number_key" ON "Invoice"("number");
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_companyId_period_key" ON "Invoice"("companyId", "period");
CREATE INDEX IF NOT EXISTS "Invoice_status_idx" ON "Invoice"("status");
CREATE INDEX IF NOT EXISTS "Invoice_period_idx" ON "Invoice"("period");

CREATE TABLE IF NOT EXISTS "InvoiceLine" (
  "id"          TEXT NOT NULL,
  "invoiceId"   TEXT NOT NULL,
  "serviceId"   TEXT,
  "description" TEXT NOT NULL,
  "qty"         INTEGER NOT NULL DEFAULT 1,
  "unitPrice"   DECIMAL(14,2) NOT NULL,
  "amount"      DECIMAL(14,2) NOT NULL,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

ALTER TABLE "Invoice"
  DROP CONSTRAINT IF EXISTS "Invoice_companyId_fkey",
  ADD CONSTRAINT "Invoice_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvoiceLine"
  DROP CONSTRAINT IF EXISTS "InvoiceLine_invoiceId_fkey",
  ADD CONSTRAINT "InvoiceLine_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
