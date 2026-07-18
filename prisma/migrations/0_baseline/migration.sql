-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('super_admin', 'admin', 'chief_accountant', 'supervisor', 'accountant', 'bank_manager');

-- CreateEnum
CREATE TYPE "TaxRegime" AS ENUM ('vat', 'turnover', 'fixed', 'yatt', 'income');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('accepted', 'not_submitted', 'not_required', 'in_progress', 'blocked', 'error', 'unknown', 'rejected', 'submitted');

-- CreateEnum
CREATE TYPE "StatsType" AS ENUM ('kb1', 'micro', 'mehnat1', 'small');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('create', 'update', 'delete', 'login', 'logout');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'accountant',
    "avatarColor" TEXT DEFAULT 'hsl(200, 50%, 50%)',
    "phone" TEXT,
    "pinfl" TEXT,
    "department" TEXT,
    "gender" TEXT,
    "birthDate" TIMESTAMP(3),
    "education" TEXT,
    "hiredAt" TIMESTAMP(3),
    "firedAt" TIMESTAMP(3),
    "status" TEXT DEFAULT 'active',
    "rating" INTEGER,
    "telegramUserId" BIGINT,
    "telegramUsername" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inn" TEXT NOT NULL,
    "taxRegime" "TaxRegime" NOT NULL DEFAULT 'vat',
    "department" TEXT,
    "departmentId" TEXT,
    "accountantId" TEXT,
    "supervisorId" TEXT,
    "chiefAccountantId" TEXT,
    "login" TEXT,
    "password" TEXT,
    "brandName" TEXT,
    "directorName" TEXT,
    "directorPhone" TEXT,
    "legalAddress" TEXT,
    "founderName" TEXT,
    "ownerName" TEXT,
    "bankClientId" TEXT,
    "bankClientName" TEXT,
    "statsType" "StatsType",
    "kpiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "serverInfo" TEXT,
    "serverName" TEXT,
    "baseName1c" TEXT,
    "contractAmount" DECIMAL(12,2),
    "contractNumber" TEXT,
    "contractDate" TIMESTAMP(3),
    "paymentDay" INTEGER,
    "vatCertificateDate" TEXT,
    "hasLandTax" BOOLEAN NOT NULL DEFAULT false,
    "hasWaterTax" BOOLEAN NOT NULL DEFAULT false,
    "hasPropertyTax" BOOLEAN NOT NULL DEFAULT false,
    "hasExciseTax" BOOLEAN NOT NULL DEFAULT false,
    "oneCStatus" TEXT,
    "oneCLocation" TEXT,
    "companyStatus" TEXT DEFAULT 'active',
    "riskLevel" TEXT DEFAULT 'low',
    "riskNotes" TEXT,
    "accountantPerc" DECIMAL(5,2),
    "bankClientPerc" DECIMAL(5,2),
    "chiefAccountantPerc" DECIMAL(5,2),
    "supervisorPerc" DECIMAL(5,2),
    "accountantSum" DECIMAL(12,2),
    "bankClientSum" DECIMAL(12,2),
    "chiefAccountantSum" DECIMAL(12,2),
    "supervisorSum" DECIMAL(12,2),
    "requiredReports" TEXT[],
    "activeServices" TEXT[],
    "itParkResident" TEXT,
    "isInternalContractor" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chiefAccountantId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "bankKlient" TEXT,
    "didox" TEXT,
    "xatlar" TEXT,
    "avtokameral" TEXT,
    "myMehnat" TEXT,
    "oneC" TEXT,
    "pulOqimlari" TEXT,
    "chiqadiganSoliqlar" TEXT,
    "hisoblananOylik" TEXT,
    "debitorKreditor" TEXT,
    "foydaVaZarar" TEXT,
    "tovarOstatka" TEXT,
    "ndsBekorQilish" TEXT,
    "aylanmaQqs" TEXT,
    "daromadSoliq" TEXT,
    "inps" TEXT,
    "foydaSoliq" TEXT,
    "moliyaviyNatija" TEXT,
    "buxgalteriyaBalansi" TEXT,
    "statistika" TEXT,
    "bonak" TEXT,
    "yerSoligi" TEXT,
    "molMulkSoligi" TEXT,
    "suvSoligi" TEXT,
    "stat12Invest" TEXT,
    "stat12Moliya" TEXT,
    "stat12Korxona" TEXT,
    "stat12Narx" TEXT,
    "stat4Invest" TEXT,
    "stat4Mehnat" TEXT,
    "stat4KorxonaMiz" TEXT,
    "stat4KbQurSavXiz" TEXT,
    "stat4KbSanoat" TEXT,
    "stat1Invest" TEXT,
    "stat1Ih" TEXT,
    "stat1Energiya" TEXT,
    "stat1Korxona" TEXT,
    "stat1KorxonaTif" TEXT,
    "stat1Moliya" TEXT,
    "stat1Akt" TEXT,
    "aksizSoligi" TEXT,
    "nedroSoligi" TEXT,
    "norezidentFoyda" TEXT,
    "norezidentNds" TEXT,
    "aylanmaQqsTolov" TEXT,
    "daromadSoliqTolov" TEXT,
    "inpsTolov" TEXT,
    "foydaSoliqTolov" TEXT,
    "itparkOylik" TEXT,
    "itparkChorak" TEXT,
    "komSuv" TEXT,
    "komGaz" TEXT,
    "komSvet" TEXT,
    "comment" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportProof" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "colKey" TEXT NOT NULL,
    "imageData" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "submittedById" TEXT NOT NULL,
    "submittedByName" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'preparing',
    "deadline" TIMESTAMP(3),
    "assignedTo" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "fileFormat" TEXT,
    "signedBy" TEXT,
    "signedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paymentMethod" TEXT NOT NULL DEFAULT 'naqd',
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "profitTaxStatus" "ReportStatus" NOT NULL DEFAULT 'not_submitted',
    "form1Status" "ReportStatus" NOT NULL DEFAULT 'not_submitted',
    "form2Status" "ReportStatus" NOT NULL DEFAULT 'not_submitted',
    "statsStatus" "ReportStatus" NOT NULL DEFAULT 'not_submitted',
    "comment" TEXT,
    "deadlineProfitTax" TIMESTAMP(3),
    "deadlineStats" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameUz" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "rewardPercent" DECIMAL(5,2) NOT NULL,
    "penaltyPercent" DECIMAL(5,2) NOT NULL,
    "inputType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "descriptionUz" TEXT,
    "options" JSONB NOT NULL DEFAULT '[]',
    "inputTypeV2" TEXT NOT NULL DEFAULT 'select',
    "scope" TEXT NOT NULL DEFAULT 'global',
    "maxBonus" DECIMAL(6,2),
    "maxPenalty" DECIMAL(6,2),

    CONSTRAINT "KpiRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyKpiRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "rewardPercent" DECIMAL(5,2),
    "penaltyPercent" DECIMAL(5,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CompanyKpiRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyPerformance" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "calculatedScore" DECIMAL(10,2) NOT NULL,
    "rewardPercentOverride" DECIMAL(5,2),
    "penaltyPercentOverride" DECIMAL(5,2),
    "selectedOption" TEXT,
    "earlyDays" INTEGER NOT NULL DEFAULT 0,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "absentDays" INTEGER NOT NULL DEFAULT 0,
    "penaltyAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submittedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "notes" TEXT,
    "changeReason" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlyPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollAdjustment" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "adjustmentType" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "PayrollAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractAssignment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "salaryType" TEXT NOT NULL,
    "salaryValue" DECIMAL(12,2) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientCredential" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "loginId" TEXT NOT NULL,
    "encryptedPassword" TEXT NOT NULL,
    "keyFilePath" TEXT,
    "notes" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KassaEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "KassaEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'naqd',
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" "AuditAction" NOT NULL,
    "tableName" TEXT NOT NULL,
    "recordId" TEXT,
    "oldData" JSONB,
    "newData" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "uploadedBy" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'present',
    "notes" TEXT,
    "source" TEXT DEFAULT 'manual',
    "lateMinutes" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serialNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'available',
    "condition" TEXT NOT NULL DEFAULT 'good',
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramGroup" (
    "id" TEXT NOT NULL,
    "chatId" BIGINT NOT NULL,
    "companyId" TEXT,
    "title" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedUpdate" (
    "updateId" BIGINT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedUpdate_pkey" PRIMARY KEY ("updateId")
);

-- CreateTable
CREATE TABLE "TelegramMessage" (
    "id" TEXT NOT NULL,
    "updateId" BIGINT,
    "chatId" BIGINT NOT NULL,
    "messageId" BIGINT NOT NULL,
    "fromUserId" BIGINT,
    "userId" TEXT,
    "text" TEXT,
    "kind" TEXT NOT NULL,
    "replyToId" BIGINT,
    "mediaType" TEXT,
    "voiceTranscript" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "chatId" BIGINT NOT NULL,
    "companyId" TEXT,
    "messageId" BIGINT NOT NULL,
    "askedByUserId" BIGINT,
    "text" TEXT,
    "responsibleRole" TEXT NOT NULL,
    "responsibleUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "answeredAt" TIMESTAMP(3),
    "aiConfidence" DECIMAL(4,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "byUserId" TEXT,
    "messageId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiEvent" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "companyId" TEXT,
    "ruleId" TEXT,
    "periodMonth" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "points" DECIMAL(10,4) NOT NULL,
    "sourceRef" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT,
    "channel" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "targetChatId" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReminder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "amountDue" DECIMAL(12,2) NOT NULL,
    "chatId" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramUserId_key" ON "User"("telegramUserId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE INDEX "Company_accountantId_idx" ON "Company"("accountantId");

-- CreateIndex
CREATE INDEX "Company_supervisorId_idx" ON "Company"("supervisorId");

-- CreateIndex
CREATE INDEX "Company_inn_idx" ON "Company"("inn");

-- CreateIndex
CREATE INDEX "Company_isActive_idx" ON "Company"("isActive");

-- CreateIndex
CREATE INDEX "Company_departmentId_idx" ON "Company"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE INDEX "Department_chiefAccountantId_idx" ON "Department"("chiefAccountantId");

-- CreateIndex
CREATE INDEX "MonthlyReport_companyId_idx" ON "MonthlyReport"("companyId");

-- CreateIndex
CREATE INDEX "MonthlyReport_period_idx" ON "MonthlyReport"("period");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyReport_companyId_period_key" ON "MonthlyReport"("companyId", "period");

-- CreateIndex
CREATE INDEX "ReportProof_companyId_idx" ON "ReportProof"("companyId");

-- CreateIndex
CREATE INDEX "ReportProof_period_idx" ON "ReportProof"("period");

-- CreateIndex
CREATE INDEX "ReportProof_status_idx" ON "ReportProof"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ReportProof_companyId_period_colKey_key" ON "ReportProof"("companyId", "period", "colKey");

-- CreateIndex
CREATE INDEX "FinancialReport_companyId_idx" ON "FinancialReport"("companyId");

-- CreateIndex
CREATE INDEX "FinancialReport_period_idx" ON "FinancialReport"("period");

-- CreateIndex
CREATE INDEX "FinancialReport_status_idx" ON "FinancialReport"("status");

-- CreateIndex
CREATE INDEX "Payment_companyId_idx" ON "Payment"("companyId");

-- CreateIndex
CREATE INDEX "Payment_period_idx" ON "Payment"("period");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_companyId_period_key" ON "Payment"("companyId", "period");

-- CreateIndex
CREATE INDEX "Operation_companyId_idx" ON "Operation"("companyId");

-- CreateIndex
CREATE INDEX "Operation_period_idx" ON "Operation"("period");

-- CreateIndex
CREATE UNIQUE INDEX "Operation_companyId_period_key" ON "Operation"("companyId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "KpiRule_name_key" ON "KpiRule"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyKpiRule_companyId_ruleId_key" ON "CompanyKpiRule"("companyId", "ruleId");

-- CreateIndex
CREATE INDEX "MonthlyPerformance_employeeId_idx" ON "MonthlyPerformance"("employeeId");

-- CreateIndex
CREATE INDEX "MonthlyPerformance_companyId_idx" ON "MonthlyPerformance"("companyId");

-- CreateIndex
CREATE INDEX "MonthlyPerformance_month_idx" ON "MonthlyPerformance"("month");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyPerformance_month_companyId_employeeId_ruleId_key" ON "MonthlyPerformance"("month", "companyId", "employeeId", "ruleId");

-- CreateIndex
CREATE INDEX "ContractAssignment_companyId_idx" ON "ContractAssignment"("companyId");

-- CreateIndex
CREATE INDEX "ContractAssignment_userId_idx" ON "ContractAssignment"("userId");

-- CreateIndex
CREATE INDEX "ClientCredential_companyId_idx" ON "ClientCredential"("companyId");

-- CreateIndex
CREATE INDEX "KassaEntry_date_idx" ON "KassaEntry"("date");

-- CreateIndex
CREATE INDEX "KassaEntry_type_idx" ON "KassaEntry"("type");

-- CreateIndex
CREATE INDEX "Expense_date_idx" ON "Expense"("date");

-- CreateIndex
CREATE INDEX "Expense_category_idx" ON "Expense"("category");

-- CreateIndex
CREATE INDEX "Expense_status_idx" ON "Expense"("status");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_tableName_idx" ON "AuditLog"("tableName");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Document_companyId_idx" ON "Document"("companyId");

-- CreateIndex
CREATE INDEX "Attendance_userId_idx" ON "Attendance"("userId");

-- CreateIndex
CREATE INDEX "Attendance_date_idx" ON "Attendance"("date");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_serialNumber_key" ON "InventoryItem"("serialNumber");

-- CreateIndex
CREATE INDEX "InventoryItem_assignedToId_idx" ON "InventoryItem"("assignedToId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- CreateIndex
CREATE INDEX "SystemSetting_key_idx" ON "SystemSetting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramGroup_chatId_key" ON "TelegramGroup"("chatId");

-- CreateIndex
CREATE INDEX "TelegramGroup_companyId_idx" ON "TelegramGroup"("companyId");

-- CreateIndex
CREATE INDEX "ProcessedUpdate_processedAt_idx" ON "ProcessedUpdate"("processedAt");

-- CreateIndex
CREATE INDEX "TelegramMessage_chatId_createdAt_idx" ON "TelegramMessage"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "TelegramMessage_chatId_messageId_idx" ON "TelegramMessage"("chatId", "messageId");

-- CreateIndex
CREATE INDEX "TelegramMessage_userId_createdAt_idx" ON "TelegramMessage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Question_status_deadlineAt_idx" ON "Question"("status", "deadlineAt");

-- CreateIndex
CREATE INDEX "Question_companyId_idx" ON "Question"("companyId");

-- CreateIndex
CREATE INDEX "Question_chatId_messageId_idx" ON "Question"("chatId", "messageId");

-- CreateIndex
CREATE INDEX "Answer_questionId_idx" ON "Answer"("questionId");

-- CreateIndex
CREATE INDEX "KpiEvent_employeeId_periodMonth_idx" ON "KpiEvent"("employeeId", "periodMonth");

-- CreateIndex
CREATE INDEX "KpiEvent_companyId_periodMonth_idx" ON "KpiEvent"("companyId", "periodMonth");

-- CreateIndex
CREATE INDEX "KpiEvent_periodMonth_idx" ON "KpiEvent"("periodMonth");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_idx" ON "NotificationDelivery"("status");

-- CreateIndex
CREATE INDEX "PaymentReminder_period_idx" ON "PaymentReminder"("period");

-- CreateIndex
CREATE INDEX "PaymentReminder_status_idx" ON "PaymentReminder"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReminder_companyId_period_level_key" ON "PaymentReminder"("companyId", "period", "level");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_accountantId_fkey" FOREIGN KEY ("accountantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_chiefAccountantId_fkey" FOREIGN KEY ("chiefAccountantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_bankClientId_fkey" FOREIGN KEY ("bankClientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_chiefAccountantId_fkey" FOREIGN KEY ("chiefAccountantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyReport" ADD CONSTRAINT "MonthlyReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportProof" ADD CONSTRAINT "ReportProof_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialReport" ADD CONSTRAINT "FinancialReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyKpiRule" ADD CONSTRAINT "CompanyKpiRule_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "KpiRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPerformance" ADD CONSTRAINT "MonthlyPerformance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPerformance" ADD CONSTRAINT "MonthlyPerformance_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "KpiRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAssignment" ADD CONSTRAINT "ContractAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAssignment" ADD CONSTRAINT "ContractAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCredential" ADD CONSTRAINT "ClientCredential_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KassaEntry" ADD CONSTRAINT "KassaEntry_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramGroup" ADD CONSTRAINT "TelegramGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReminder" ADD CONSTRAINT "PaymentReminder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

