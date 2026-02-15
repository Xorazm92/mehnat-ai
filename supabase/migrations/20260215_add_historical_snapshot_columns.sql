-- Historical data snapshot columns for company_monthly_reports
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS assigned_supervisor_id UUID REFERENCES profiles(id);
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS assigned_supervisor_name TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS assigned_bank_manager_id UUID REFERENCES profiles(id);
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS assigned_bank_manager_name TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS contract_amount NUMERIC;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS assigned_accountant_id UUID REFERENCES profiles(id);
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS assigned_accountant_name TEXT;

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_monthly_reports_accountant ON company_monthly_reports(assigned_accountant_id);
CREATE INDEX IF NOT EXISTS idx_monthly_reports_supervisor ON company_monthly_reports(assigned_supervisor_id);
CREATE INDEX IF NOT EXISTS idx_monthly_reports_bank ON company_monthly_reports(assigned_bank_manager_id);
