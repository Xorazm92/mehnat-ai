-- Oylik reja/fakt. Direktor panelida "reja necha foiz bajarildi" shundan.
CREATE TABLE "MonthlyTarget" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "plan" DECIMAL(16,2),
    "fact" DECIMAL(16,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MonthlyTarget_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MonthlyTarget_period_metric_key" ON "MonthlyTarget"("period", "metric");
CREATE INDEX "MonthlyTarget_period_idx" ON "MonthlyTarget"("period");
