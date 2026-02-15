-- Historical data snapshot columns for company_monthly_reports
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS assigned_supervisor_id UUID REFERENCES profiles(id);
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS assigned_supervisor_name TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS assigned_bank_manager_id UUID REFERENCES profiles(id);
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS assigned_bank_manager_name TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS contract_amount NUMERIC;

-- Ensure operations table (usually an alias or same structure) also has these if it's separate
-- In some environments they might be the same table.
