-- BANK VIPISKA IMPORTI VA SHARTNOMALAR
--
-- QO'LDA yozilgan migratsiya. `prisma migrate dev` ISHLATILMAGAN va
-- ishlatilmasin: bu tarmoqda schema.prisma bilan baza o'rtasida boshqa
-- (obligation-engine) drift bor, avtomatik diff esa DeadlineTemplate,
-- IntegrationEvent, OneCConnection, SubmissionEvidence va Task jadvallaridan
-- ustunlarni O'CHIRIB yuborardi. Bu yerda faqat quyidagilar bor:
--
--   Company.isOwnFirm      — ASRO'ning o'z yuridik shaxsi (mijoz emas)
--   KassaEntry.channelId   — pul qaysi kanal orqali o'tgani
--   BankAccount            — o'z firmaning bank hisobi
--   BankStatementImport    — yuklangan vipiska fayli (audit izi)
--   BankTransaction        — vipiskadagi xom, o'zgarmas qator
--   Contract               — mijoz shartnomasi (bittada bir nechta bo'lishi mumkin)
--   PaymentAllocation      — tranzaksiya → oylik Payment qatoriga taqsimot
--   DisbursementChannel    — chiqim kanali (o'z hisobi / naqd / xodim kartasi)
--
-- Hech qanday mavjud ma'lumot o'chirilmaydi yoki o'zgartirilmaydi.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "isOwnFirm" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "KassaEntry" ADD COLUMN     "channelId" TEXT;

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "mfo" TEXT,
    "bankName" TEXT,
    "ownerCompanyId" TEXT NOT NULL,
    "inn" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatementImport" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "openingBalance" DECIMAL(14,2),
    "closingBalance" DECIMAL(14,2),
    "rowsParsed" INTEGER NOT NULL DEFAULT 0,
    "rowsInserted" INTEGER NOT NULL DEFAULT 0,
    "rowsDuplicate" INTEGER NOT NULL DEFAULT 0,
    "importedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatementImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "valueDate" TIMESTAMP(3) NOT NULL,
    "docNumber" TEXT,
    "opCode" TEXT,
    "direction" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "counterpartyInn" TEXT,
    "counterpartyName" TEXT,
    "counterpartyAccount" TEXT,
    "purpose" TEXT,
    "contractHint" TEXT,
    "expenseCategory" TEXT,
    "rawHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unmatched',
    "matchedCompanyId" TEXT,
    "matchedContractId" TEXT,
    "kassaEntryId" TEXT,
    "ignoredReason" TEXT,
    "postedAt" TIMESTAMP(3),
    "postedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ownFirmId" TEXT,
    "number" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3),
    "amount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "bankTransactionId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "contractId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisbursementChannel" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "employeeId" TEXT,
    "cardMask" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisbursementChannel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_accountNumber_key" ON "BankAccount"("accountNumber");

-- CreateIndex
CREATE INDEX "BankAccount_ownerCompanyId_idx" ON "BankAccount"("ownerCompanyId");

-- CreateIndex
CREATE INDEX "BankAccount_inn_idx" ON "BankAccount"("inn");

-- CreateIndex
CREATE INDEX "BankStatementImport_accountId_periodFrom_idx" ON "BankStatementImport"("accountId", "periodFrom");

-- CreateIndex
CREATE INDEX "BankStatementImport_createdAt_idx" ON "BankStatementImport"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_rawHash_key" ON "BankTransaction"("rawHash");

-- CreateIndex
CREATE INDEX "BankTransaction_accountId_valueDate_idx" ON "BankTransaction"("accountId", "valueDate");

-- CreateIndex
CREATE INDEX "BankTransaction_status_idx" ON "BankTransaction"("status");

-- CreateIndex
CREATE INDEX "BankTransaction_counterpartyInn_idx" ON "BankTransaction"("counterpartyInn");

-- CreateIndex
CREATE INDEX "BankTransaction_direction_status_idx" ON "BankTransaction"("direction", "status");

-- CreateIndex
CREATE INDEX "BankTransaction_matchedCompanyId_idx" ON "BankTransaction"("matchedCompanyId");

-- CreateIndex
CREATE INDEX "Contract_companyId_idx" ON "Contract"("companyId");

-- CreateIndex
CREATE INDEX "Contract_ownFirmId_idx" ON "Contract"("ownFirmId");

-- CreateIndex
CREATE INDEX "Contract_number_idx" ON "Contract"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_companyId_number_key" ON "Contract"("companyId", "number");

-- CreateIndex
CREATE INDEX "PaymentAllocation_paymentId_idx" ON "PaymentAllocation"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_bankTransactionId_idx" ON "PaymentAllocation"("bankTransactionId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_contractId_idx" ON "PaymentAllocation"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_bankTransactionId_paymentId_key" ON "PaymentAllocation"("bankTransactionId", "paymentId");

-- CreateIndex
CREATE INDEX "DisbursementChannel_isActive_idx" ON "DisbursementChannel"("isActive");

-- CreateIndex
CREATE INDEX "DisbursementChannel_employeeId_idx" ON "DisbursementChannel"("employeeId");

-- CreateIndex
CREATE INDEX "Company_isOwnFirm_idx" ON "Company"("isOwnFirm");

-- CreateIndex
CREATE INDEX "KassaEntry_companyId_idx" ON "KassaEntry"("companyId");

-- CreateIndex
CREATE INDEX "KassaEntry_channelId_idx" ON "KassaEntry"("channelId");

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_ownerCompanyId_fkey" FOREIGN KEY ("ownerCompanyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementImport" ADD CONSTRAINT "BankStatementImport_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementImport" ADD CONSTRAINT "BankStatementImport_importedBy_fkey" FOREIGN KEY ("importedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_importId_fkey" FOREIGN KEY ("importId") REFERENCES "BankStatementImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_matchedCompanyId_fkey" FOREIGN KEY ("matchedCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_matchedContractId_fkey" FOREIGN KEY ("matchedContractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_ownFirmId_fkey" FOREIGN KEY ("ownFirmId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisbursementChannel" ADD CONSTRAINT "DisbursementChannel_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
