-- 1C integratsiyasi QAYTARILDI.
-- Modellar bir marta olib tashlangan edi; dalil (evidence) landing qatlami
-- ularsiz ishlamaydi — claim 1C mapping orqali firmaga bog'lanadi.

-- CreateEnum
CREATE TYPE "IntegrationEventStatus" AS ENUM ('received', 'processing', 'processed', 'failed', 'dead');

-- CreateEnum
CREATE TYPE "SyncRunStatus" AS ENUM ('running', 'completed', 'failed');

-- CreateTable
CREATE TABLE IF NOT EXISTS "OneCConnection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OneCConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OneCCompanyMapping" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalOrgId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OneCCompanyMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "status" "IntegrationEventStatus" NOT NULL DEFAULT 'received',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OneCConnection_tokenHash_key" ON "OneCConnection"("tokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OneCConnection_active_idx" ON "OneCConnection"("active");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OneCCompanyMapping_companyId_idx" ON "OneCCompanyMapping"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OneCCompanyMapping_connectionId_externalOrgId_key" ON "OneCCompanyMapping"("connectionId", "externalOrgId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationEvent_idempotencyKey_key" ON "IntegrationEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntegrationEvent_status_idx" ON "IntegrationEvent"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntegrationEvent_connectionId_idx" ON "IntegrationEvent"("connectionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntegrationEvent_externalId_idx" ON "IntegrationEvent"("externalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntegrationEvent_eventType_idx" ON "IntegrationEvent"("eventType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SyncRun_connectionId_idx" ON "SyncRun"("connectionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SyncRun_status_idx" ON "SyncRun"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SyncError_integrationEventId_idx" ON "SyncError"("integrationEventId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SyncError_connectionId_idx" ON "SyncError"("connectionId");

-- AddForeignKey
ALTER TABLE "OneCCompanyMapping" ADD CONSTRAINT "OneCCompanyMapping_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "OneCConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneCCompanyMapping" ADD CONSTRAINT "OneCCompanyMapping_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationEvent" ADD CONSTRAINT "IntegrationEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "OneCConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationEvent" ADD CONSTRAINT "IntegrationEvent_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "SyncRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "OneCConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

