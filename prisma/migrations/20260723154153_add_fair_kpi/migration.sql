-- CreateEnum
CREATE TYPE "CompanyComplexity" AS ENUM ('simple', 'standard', 'complex', 'enterprise');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "complexity" "CompanyComplexity" NOT NULL DEFAULT 'standard';

-- CreateTable
CREATE TABLE "FairKpiScore" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "sla" DECIMAL(5,2) NOT NULL,
    "quality" DECIMAL(5,2) NOT NULL,
    "client" DECIMAL(5,2) NOT NULL,
    "volume" DECIMAL(5,2) NOT NULL,
    "discipline" DECIMAL(5,2) NOT NULL,
    "composite" DECIMAL(5,2) NOT NULL,
    "volumePoints" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "shadowMode" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FairKpiScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FairKpiScore_period_idx" ON "FairKpiScore"("period");

-- CreateIndex
CREATE INDEX "FairKpiScore_employeeId_idx" ON "FairKpiScore"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "FairKpiScore_period_employeeId_key" ON "FairKpiScore"("period", "employeeId");

