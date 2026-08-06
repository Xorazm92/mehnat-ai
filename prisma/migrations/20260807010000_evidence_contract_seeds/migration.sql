-- A6 — Evidence shartnomasi uchun sxema urug'lari. Hammasi QO'SHIMCHA.
--
-- DeadlineTemplate: matritsa bog'lanishi (matrixKey), KPI yo'nalishi
-- (kpiRuleName), normativ mehnat (ADR-0010) va dalil/eskalatsiya siyosati.
-- Bularsiz B blok har biri uchun kodga qattiq yozilgan xarita talab qilardi.
--
-- SubmissionEvidence: sha256/byteSize/mimeType — bayt yaxlitligi;
-- sourceEventId — import kelib chiqishi. @@unique([submissionId, storageRef])
-- backfill va importni idempotent qiladi.
--
-- Task.obligationId: majburiyat Task tug'dirmaydi — Task majburiyatga
-- bog'lanadi (ADR-0009).
--
-- OneCConnection.kind: Excel alohida quvur qurmaydi (ADR-0008).

ALTER TABLE "DeadlineTemplate"
  ADD COLUMN IF NOT EXISTS "matrixKey"        TEXT,
  ADD COLUMN IF NOT EXISTS "kpiRuleName"      TEXT,
  ADD COLUMN IF NOT EXISTS "normativeMinutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "evidenceRequired" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "escalates"        BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS "DeadlineTemplate_matrixKey_idx" ON "DeadlineTemplate"("matrixKey");

ALTER TABLE "SubmissionEvidence"
  ADD COLUMN IF NOT EXISTS "sha256"        TEXT,
  ADD COLUMN IF NOT EXISTS "byteSize"      INTEGER,
  ADD COLUMN IF NOT EXISTS "mimeType"      TEXT,
  ADD COLUMN IF NOT EXISTS "sourceEventId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionEvidence_submissionId_storageRef_key"
  ON "SubmissionEvidence"("submissionId", "storageRef");
CREATE INDEX IF NOT EXISTS "SubmissionEvidence_sha256_idx" ON "SubmissionEvidence"("sha256");

ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "obligationId" TEXT;
CREATE INDEX IF NOT EXISTS "Task_obligationId_idx" ON "Task"("obligationId");
ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_obligationId_fkey";
ALTER TABLE "Task" ADD CONSTRAINT "Task_obligationId_fkey"
  FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OneCConnection" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT '1c';

ALTER TABLE "IntegrationEvent" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
CREATE INDEX IF NOT EXISTS "IntegrationEvent_companyId_idx" ON "IntegrationEvent"("companyId");
