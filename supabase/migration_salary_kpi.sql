-- Migration SQL for Salary & KPI System Integration

-- Update companies table with financial fields
ALTER TABLE companies ADD COLUMN IF NOT EXISTS bank_client_id UUID REFERENCES profiles(id);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES profiles(id);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS contract_amount NUMERIC DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS accountant_perc NUMERIC DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS bank_client_sum NUMERIC DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS supervisor_perc NUMERIC DEFAULT 0;

-- Update operations table with KPI metrics field
ALTER TABLE operations ADD COLUMN IF NOT EXISTS kpi JSONB DEFAULT '{}'::jsonb;

-- Ensure schema cache is refreshed (handled by PostgREST automatically)
COMMENT ON TABLE companies IS 'Companies list with financial contract details';
COMMENT ON TABLE operations IS 'Monthly operation reports with KPI metrics';
