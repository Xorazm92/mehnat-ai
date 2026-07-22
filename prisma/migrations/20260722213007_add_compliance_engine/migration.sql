-- CreateEnum
CREATE TYPE "ObligationStatus" AS ENUM ('planned', 'in_progress', 'ready', 'sent', 'accepted', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('sent', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('screenshot', 'pdf', 'receipt', 'external_reference', 'api_response', 'manual_approval');

-- CreateEnum
CREATE TYPE "DelayReason" AS ENUM ('accountant_delay', 'client_delay', 'system_failure', 'external_authority', 'management_decision', 'other');

-- CreateEnum
CREATE TYPE "Periodicity" AS ENUM ('monthly', 'quarterly', 'annual');

-- CreateEnum
CREATE TYPE "DeadlineAnchorType" AS ENUM ('period_end_offset', 'fixed_day_of_month');

-- CreateEnum
CREATE TYPE "WorkdayAdjustmentPolicy" AS ENUM ('none', 'next_workday', 'previous_workday');

-- CreateEnum
CREATE TYPE "TemplateLifecycle" AS ENUM ('draft', 'approved', 'active', 'retired');

-- AlterTable
ALTER TABLE "NotificationDelivery" ADD COLUMN     "dedupKey" TEXT,
ADD COLUMN     "recipientId" TEXT;

-- CreateTable
CREATE TABLE "DeadlineTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "obligationType" TEXT NOT NULL,
    "periodicity" "Periodicity" NOT NULL,
    "anchorType" "DeadlineAnchorType" NOT NULL,
    "dueDay" INTEGER,
    "dueMonth" INTEGER,
    "offsetDays" INTEGER,
    "adjustmentPolicy" "WorkdayAdjustmentPolicy" NOT NULL DEFAULT 'next_workday',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "lifecycle" "TemplateLifecycle" NOT NULL DEFAULT 'draft',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeadlineTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateApplicability" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "criteriaType" TEXT NOT NULL,
    "criteriaValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateApplicability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyObligationOverride" (
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

-- CreateTable
CREATE TABLE "BusinessCalendarDay" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "isWorkday" BOOLEAN NOT NULL DEFAULT true,
    "isHoliday" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,
    "approvedById" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessCalendarDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Obligation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "periodKey" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "ObligationStatus" NOT NULL DEFAULT 'planned',
    "responsibleUserId" TEXT,
    "backupUserId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "assignedById" TEXT,
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "firstOverdueAt" TIMESTAMP(3),
    "delayReason" "DelayReason",
    "delayComment" TEXT,
    "delayMarkedById" TEXT,
    "delayMarkedAt" TIMESTAMP(3),
    "delayApprovedById" TEXT,
    "delayApprovedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Obligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObligationStatusEvent" (
    "id" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "fromStatus" "ObligationStatus",
    "toStatus" "ObligationStatus" NOT NULL,
    "byUserId" TEXT,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObligationStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObligationAssignmentEvent" (
    "id" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT,
    "byUserId" TEXT,
    "reason" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObligationAssignmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObligationSubmission" (
    "id" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'sent',
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionCode" TEXT,
    "rejectionNote" TEXT,
    "externalId" TEXT,
    "sourceSystem" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObligationSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionEvidence" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "type" "EvidenceType" NOT NULL,
    "storageRef" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeadlineTemplate_lifecycle_idx" ON "DeadlineTemplate"("lifecycle");

-- CreateIndex
CREATE INDEX "DeadlineTemplate_active_idx" ON "DeadlineTemplate"("active");

-- CreateIndex
CREATE INDEX "DeadlineTemplate_obligationType_idx" ON "DeadlineTemplate"("obligationType");

-- CreateIndex
CREATE UNIQUE INDEX "DeadlineTemplate_code_version_key" ON "DeadlineTemplate"("code", "version");

-- CreateIndex
CREATE INDEX "TemplateApplicability_templateId_idx" ON "TemplateApplicability"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateApplicability_templateId_criteriaType_criteriaValue_key" ON "TemplateApplicability"("templateId", "criteriaType", "criteriaValue");

-- CreateIndex
CREATE INDEX "CompanyObligationOverride_companyId_idx" ON "CompanyObligationOverride"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyObligationOverride_companyId_templateId_key" ON "CompanyObligationOverride"("companyId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessCalendarDay_date_key" ON "BusinessCalendarDay"("date");

-- CreateIndex
CREATE INDEX "BusinessCalendarDay_isWorkday_idx" ON "BusinessCalendarDay"("isWorkday");

-- CreateIndex
CREATE INDEX "Obligation_companyId_idx" ON "Obligation"("companyId");

-- CreateIndex
CREATE INDEX "Obligation_status_idx" ON "Obligation"("status");

-- CreateIndex
CREATE INDEX "Obligation_dueAt_idx" ON "Obligation"("dueAt");

-- CreateIndex
CREATE INDEX "Obligation_responsibleUserId_idx" ON "Obligation"("responsibleUserId");

-- CreateIndex
CREATE INDEX "Obligation_periodKey_idx" ON "Obligation"("periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "Obligation_companyId_templateId_periodStart_periodEnd_key" ON "Obligation"("companyId", "templateId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "ObligationStatusEvent_obligationId_idx" ON "ObligationStatusEvent"("obligationId");

-- CreateIndex
CREATE INDEX "ObligationAssignmentEvent_obligationId_idx" ON "ObligationAssignmentEvent"("obligationId");

-- CreateIndex
CREATE INDEX "ObligationSubmission_obligationId_status_idx" ON "ObligationSubmission"("obligationId", "status");

-- CreateIndex
CREATE INDEX "ObligationSubmission_externalId_idx" ON "ObligationSubmission"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ObligationSubmission_obligationId_attemptNo_key" ON "ObligationSubmission"("obligationId", "attemptNo");

-- CreateIndex
CREATE INDEX "SubmissionEvidence_submissionId_idx" ON "SubmissionEvidence"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_channel_dedupKey_key" ON "NotificationDelivery"("channel", "dedupKey");

-- AddForeignKey
ALTER TABLE "TemplateApplicability" ADD CONSTRAINT "TemplateApplicability_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DeadlineTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyObligationOverride" ADD CONSTRAINT "CompanyObligationOverride_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyObligationOverride" ADD CONSTRAINT "CompanyObligationOverride_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DeadlineTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DeadlineTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObligationStatusEvent" ADD CONSTRAINT "ObligationStatusEvent_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObligationAssignmentEvent" ADD CONSTRAINT "ObligationAssignmentEvent_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObligationSubmission" ADD CONSTRAINT "ObligationSubmission_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionEvidence" ADD CONSTRAINT "SubmissionEvidence_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ObligationSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

