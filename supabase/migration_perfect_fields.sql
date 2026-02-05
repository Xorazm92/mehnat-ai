
-- ASOS Accounting Manager - Perfect Fields Migration
-- Adding financial and management columns to companies and operations tables

-- 1. Add columns to companies table
ALTER TABLE companies ADD COLUMN IF NOT EXISTS bank_client_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS contract_amount DECIMAL(15, 2) DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS accountant_perc DECIMAL(5, 2) DEFAULT 20;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS bank_client_sum DECIMAL(15, 2) DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS supervisor_perc DECIMAL(5, 2) DEFAULT 5;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS chief_accountant_sum DECIMAL(15, 2) DEFAULT 0;

-- 2. Add KPI column to operations table (if not exists)
ALTER TABLE operations ADD COLUMN IF NOT EXISTS kpi JSONB;

-- 3. Add UNIQUE constraint to INN if not present
-- Note: We use DO block to safely add constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'companies_inn_key'
    ) THEN
        ALTER TABLE companies ADD CONSTRAINT companies_inn_key UNIQUE (inn);
    END IF;
END $$;

-- 4. Update existing indexes
CREATE INDEX IF NOT EXISTS idx_companies_bank_client ON companies(bank_client_id);
CREATE INDEX IF NOT EXISTS idx_companies_supervisor ON companies(supervisor_id);
