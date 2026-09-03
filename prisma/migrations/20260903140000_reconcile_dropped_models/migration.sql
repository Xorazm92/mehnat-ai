-- =====================================================
-- 6 JADVAL VA 2 ENUM TIKLANADI — R-01 (kassa audit master reja)
-- =====================================================
--
-- MUAMMO. `20260810150000_consolidate_drop_unused_modules` olti jadvalni
-- (CompanyObligationOverride, OneCConnection, OneCCompanyMapping, SyncRun,
-- SyncError, IntegrationEvent) va ikkita enum turini (IntegrationEventStatus,
-- SyncRunStatus) DROP qildi — ular UI'ga ulanmagan, nolta qator deb.
--
-- Lekin `schema.prisma` da bu modellar HALI HAM bor (1C integratsiyasi va
-- firma-darajali majburiyat istisnosi qaytadan ishlatila boshlangan —
-- `20260806230000_restore_1c_integration` va
-- `20260806235000_restore_obligation_overrides` ANIQ shu maqsadda yozilgan
-- edi). Muammo — ULARNING TARTIBI: ikkalasi ham DROP migratsiyasidan (08-10)
-- OLDIN (08-06) turadi. Ya'ni migratsiya TARIXIDA ketma-ketlik:
--
--     yaratish (07-22, 07-23) → "tiklash" (08-06, aslida hali dropdan oldin,
--     shuning uchun no-op) → DROP (08-10)
--
-- Toza `prisma migrate deploy` shu tartibda yuguradi va oxiri — jadvalsiz.
-- Prod va dev'da bu jadvallar BOR, chunki kimdir `schema.prisma` shu
-- modellarni e'lon qilgandan keyin `prisma db push` ishlatgan — bu esa
-- migratsiya tarixidan TASHQARI, jimgina drift.
--
-- ISBOT (2026-09-03, faqat o'qish so'rovlari):
--   · prod (16.192.135.23/inbola): 71 jadval, barcha 71 migratsiya "applied"
--   · lokal inbola: 71 jadval, `migrate status` — "up to date"
--   · toza schema'da `migrate deploy` (asro_test/verify_r01): 65 jadval —
--     aynan shu 6 tasi yo'q, boshqa hech qanday farq yo'q
--
-- YECHIM. Bu migratsiya FORWARD-ONLY va idempotent: `IF NOT EXISTS` /
-- `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` naqshi — xuddi
-- `20260806230000`/`20260806235000` dagi bilan bir xil, chunki bu holat
-- ALLAQACHON bir marta yechilgan va o'sha yechim TARTIB tufayli behuda ketgan.
-- Prod/dev'da bu migratsiya NO-OP (jadvallar allaqachon bor — quyidagi
-- tekshiruv shuni tasdiqladi). Toza bazada esa 65 → 71 jadvalga olib boradi.
--
-- Ustun ro'yxati JORIY `schema.prisma` dan: `OneCConnection.kind` va
-- `IntegrationEvent.companyId` original CREATE TABLE'da yo'q edi, ular
-- `20260807010000_evidence_contract_seeds` da keyinroq ALTER bilan
-- qo'shilgan — bu yerda ular boshidanoq CREATE TABLE ichida, chunki fresh
-- install uchun o'sha keyingi ALTER allaqachon o'tib ketgan bo'ladi.

-- ── Enumlar (idempotent — CREATE TYPE IF NOT EXISTS Postgres'da yo'q) ──
DO $$ BEGIN
  CREATE TYPE "IntegrationEventStatus" AS ENUM ('received', 'processing', 'processed', 'failed', 'dead');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SyncRunStatus" AS ENUM ('running', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── CompanyObligationOverride ───────────────────────────────────────────
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

ALTER TABLE "CompanyObligationOverride" DROP CONSTRAINT IF EXISTS "CompanyObligationOverride_companyId_fkey";
ALTER TABLE "CompanyObligationOverride"
    ADD CONSTRAINT "CompanyObligationOverride_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyObligationOverride" DROP CONSTRAINT IF EXISTS "CompanyObligationOverride_templateId_fkey";
ALTER TABLE "CompanyObligationOverride"
    ADD CONSTRAINT "CompanyObligationOverride_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "DeadlineTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── OneCConnection ('kind' boshidanoq — evidence_contract_seeds izohiga qarang) ──
CREATE TABLE IF NOT EXISTS "OneCConnection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT '1c',
    "tokenHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OneCConnection_pkey" PRIMARY KEY ("id")
);

-- Jadval allaqachon (drift orqali) bor, lekin ustun yo'q holat uchun ham xavfsiz.
ALTER TABLE "OneCConnection" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT '1c';

CREATE UNIQUE INDEX IF NOT EXISTS "OneCConnection_tokenHash_key" ON "OneCConnection"("tokenHash");
CREATE INDEX IF NOT EXISTS "OneCConnection_active_idx" ON "OneCConnection"("active");

-- ── OneCCompanyMapping ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "OneCCompanyMapping" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalOrgId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OneCCompanyMapping_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OneCCompanyMapping_companyId_idx" ON "OneCCompanyMapping"("companyId");
CREATE UNIQUE INDEX IF NOT EXISTS "OneCCompanyMapping_connectionId_externalOrgId_key" ON "OneCCompanyMapping"("connectionId", "externalOrgId");

ALTER TABLE "OneCCompanyMapping" DROP CONSTRAINT IF EXISTS "OneCCompanyMapping_connectionId_fkey";
ALTER TABLE "OneCCompanyMapping" ADD CONSTRAINT "OneCCompanyMapping_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "OneCConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OneCCompanyMapping" DROP CONSTRAINT IF EXISTS "OneCCompanyMapping_companyId_fkey";
ALTER TABLE "OneCCompanyMapping" ADD CONSTRAINT "OneCCompanyMapping_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── SyncRun ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "SyncRun" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "status" "SyncRunStatus" NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "eventsReceived" INTEGER NOT NULL DEFAULT 0,
    "eventsProcessed" INTEGER NOT NULL DEFAULT 0,
    "eventsFailed" INTEGER NOT NULL DEFAULT 0,
    "cursor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SyncRun_connectionId_idx" ON "SyncRun"("connectionId");
CREATE INDEX IF NOT EXISTS "SyncRun_status_idx" ON "SyncRun"("status");

ALTER TABLE "SyncRun" DROP CONSTRAINT IF EXISTS "SyncRun_connectionId_fkey";
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "OneCConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── IntegrationEvent ('companyId' boshidanoq) ───────────────────────────
CREATE TABLE IF NOT EXISTS "IntegrationEvent" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "syncRunId" TEXT,
    "sourceSystem" TEXT NOT NULL DEFAULT '1c',
    "eventType" TEXT NOT NULL,
    "externalId" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "companyId" TEXT,
    "status" "IntegrationEventStatus" NOT NULL DEFAULT 'received',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "IntegrationEvent" ADD COLUMN IF NOT EXISTS "companyId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationEvent_idempotencyKey_key" ON "IntegrationEvent"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "IntegrationEvent_status_idx" ON "IntegrationEvent"("status");
CREATE INDEX IF NOT EXISTS "IntegrationEvent_connectionId_idx" ON "IntegrationEvent"("connectionId");
CREATE INDEX IF NOT EXISTS "IntegrationEvent_externalId_idx" ON "IntegrationEvent"("externalId");
CREATE INDEX IF NOT EXISTS "IntegrationEvent_eventType_idx" ON "IntegrationEvent"("eventType");
CREATE INDEX IF NOT EXISTS "IntegrationEvent_companyId_idx" ON "IntegrationEvent"("companyId");

ALTER TABLE "IntegrationEvent" DROP CONSTRAINT IF EXISTS "IntegrationEvent_connectionId_fkey";
ALTER TABLE "IntegrationEvent" ADD CONSTRAINT "IntegrationEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "OneCConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationEvent" DROP CONSTRAINT IF EXISTS "IntegrationEvent_syncRunId_fkey";
ALTER TABLE "IntegrationEvent" ADD CONSTRAINT "IntegrationEvent_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "SyncRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── SyncError (FK yo'q — original migratsiyada ham yo'q edi) ────────────
CREATE TABLE IF NOT EXISTS "SyncError" (
    "id" TEXT NOT NULL,
    "integrationEventId" TEXT,
    "syncRunId" TEXT,
    "connectionId" TEXT,
    "message" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncError_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SyncError_integrationEventId_idx" ON "SyncError"("integrationEventId");
CREATE INDEX IF NOT EXISTS "SyncError_connectionId_idx" ON "SyncError"("connectionId");
