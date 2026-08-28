-- Firma hujjatlari arxivi. Fayl base64 holida bazada — ReportProof bilan
-- bir xil usul (qarang prisma/schema.prisma dagi Document izohi).

CREATE TABLE IF NOT EXISTS "Document" (
  "id"             TEXT NOT NULL,
  "companyId"      TEXT NOT NULL,
  "docType"        TEXT NOT NULL DEFAULT 'boshqa',
  "title"          TEXT NOT NULL,
  "note"           TEXT,
  "fileData"       TEXT NOT NULL,
  "fileName"       TEXT NOT NULL,
  "fileType"       TEXT NOT NULL,
  "fileSize"       INTEGER NOT NULL DEFAULT 0,
  "issuedAt"       TIMESTAMP(3),
  "expiresAt"      TIMESTAMP(3),
  "uploadedById"   TEXT,
  "uploadedByName" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"      TIMESTAMP(3),
  "deletedBy"      TEXT,
  CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Document_companyId_deletedAt_idx" ON "Document"("companyId", "deletedAt");
CREATE INDEX IF NOT EXISTS "Document_docType_idx" ON "Document"("docType");
CREATE INDEX IF NOT EXISTS "Document_expiresAt_idx" ON "Document"("expiresAt");

ALTER TABLE "Document"
  DROP CONSTRAINT IF EXISTS "Document_companyId_fkey",
  ADD CONSTRAINT "Document_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
