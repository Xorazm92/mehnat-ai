-- 1C QARZDORLIGI: boshlang'ich qoldiq + kesimlar tarixi.
--
-- ASRO qarzni `Company.contractAmount − shu oy to'lovi` deb hisoblaydi, ya'ni
-- O'TGAN OYLARDAN QOLGAN qarzni ko'rmaydi: 759 mln chiqadi, 1C esa 1.18 mlrd
-- deydi. Yechim — 1C dan boshlang'ich qarz BIR MARTA olinadi, keyin ASRO uni
-- o'zi yuritadi. Shuning uchun 1C faylini har kuni yuklash shart emas
-- (foydalanuvchi: "ishchiga ikki ish bo'lib qolmaydimi?").

ALTER TABLE "Contract" ADD COLUMN "openingDebt" DECIMAL(14,2);
ALTER TABLE "Contract" ADD COLUMN "openingDebtAt" TIMESTAMP(3);

CREATE TABLE "DebtSnapshot" (
    "id" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT,
    "contractId" TEXT,
    "rawCustomer" TEXT NOT NULL,
    "rawContract" TEXT,
    "ownFirmName" TEXT,
    "debt" DECIMAL(14,2) NOT NULL,
    "advance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DebtSnapshot_pkey" PRIMARY KEY ("id")
);

-- Bir sanada bir mijoz+shartnoma bir marta — qayta yuklash dublikat yaratmaydi.
CREATE UNIQUE INDEX "DebtSnapshot_asOf_rawCustomer_rawContract_key"
  ON "DebtSnapshot"("asOf", "rawCustomer", "rawContract");
CREATE INDEX "DebtSnapshot_contractId_idx" ON "DebtSnapshot"("contractId");
CREATE INDEX "DebtSnapshot_companyId_idx" ON "DebtSnapshot"("companyId");
CREATE INDEX "DebtSnapshot_asOf_idx" ON "DebtSnapshot"("asOf");

ALTER TABLE "DebtSnapshot" ADD CONSTRAINT "DebtSnapshot_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DebtSnapshot" ADD CONSTRAINT "DebtSnapshot_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
