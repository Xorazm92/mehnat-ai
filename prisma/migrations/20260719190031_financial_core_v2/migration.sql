-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "deleteReason" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT;

-- AlterTable
ALTER TABLE "KassaEntry" ADD COLUMN     "deleteReason" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "deleteReason" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT;

-- AlterTable
ALTER TABLE "PayrollAdjustment" ADD COLUMN     "deleteReason" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT;

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "companyId" TEXT,
    "adjustmentId" TEXT,
    "month" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'naqd',
    "note" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deleteReason" TEXT,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "description" TEXT,
    "sourceTable" TEXT,
    "sourceId" TEXT,
    "period" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "period" TEXT NOT NULL,
    "openingBalance" DECIMAL(14,2) NOT NULL,
    "closingBalance" DECIMAL(14,2) NOT NULL,
    "income" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "outflow" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payout_employeeId_month_idx" ON "Payout"("employeeId", "month");

-- CreateIndex
CREATE INDEX "Payout_adjustmentId_idx" ON "Payout"("adjustmentId");

-- CreateIndex
CREATE INDEX "Payout_paidAt_idx" ON "Payout"("paidAt");

-- CreateIndex
CREATE INDEX "Payout_deletedAt_idx" ON "Payout"("deletedAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_transactionId_idx" ON "LedgerEntry"("transactionId");

-- CreateIndex
CREATE INDEX "LedgerEntry_accountId_period_idx" ON "LedgerEntry"("accountId", "period");

-- CreateIndex
CREATE INDEX "LedgerEntry_sourceTable_sourceId_idx" ON "LedgerEntry"("sourceTable", "sourceId");

-- CreateIndex
CREATE INDEX "LedgerEntry_period_idx" ON "LedgerEntry"("period");

-- CreateIndex
CREATE INDEX "AccountingPeriod_year_month_idx" ON "AccountingPeriod"("year", "month");

-- CreateIndex
CREATE INDEX "AccountingPeriod_status_idx" ON "AccountingPeriod"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriod_companyId_year_month_key" ON "AccountingPeriod"("companyId", "year", "month");

-- CreateIndex
CREATE INDEX "FinancialSnapshot_period_idx" ON "FinancialSnapshot"("period");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialSnapshot_companyId_period_key" ON "FinancialSnapshot"("companyId", "period");

-- CreateIndex
CREATE INDEX "Expense_deletedAt_idx" ON "Expense"("deletedAt");

-- CreateIndex
CREATE INDEX "KassaEntry_deletedAt_idx" ON "KassaEntry"("deletedAt");

-- CreateIndex
CREATE INDEX "Payment_deletedAt_idx" ON "Payment"("deletedAt");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_employeeId_month_idx" ON "PayrollAdjustment"("employeeId", "month");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_deletedAt_idx" ON "PayrollAdjustment"("deletedAt");

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "PayrollAdjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
