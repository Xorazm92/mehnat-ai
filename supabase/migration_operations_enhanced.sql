
-- Migration: Align operations table with company_monthly_reports for better history tracking
ALTER TABLE operations ADD COLUMN IF NOT EXISTS assigned_accountant_name TEXT;
ALTER TABLE operations ADD COLUMN IF NOT EXISTS assigned_bank_manager_id UUID REFERENCES profiles(id);
ALTER TABLE operations ADD COLUMN IF NOT EXISTS assigned_bank_manager_name TEXT;
ALTER TABLE operations ADD COLUMN IF NOT EXISTS assigned_supervisor_id UUID REFERENCES profiles(id);
ALTER TABLE operations ADD COLUMN IF NOT EXISTS assigned_supervisor_name TEXT;
ALTER TABLE operations ADD COLUMN IF NOT EXISTS contract_amount NUMERIC DEFAULT 0;

-- Optional: Add indexes
CREATE INDEX IF NOT EXISTS idx_operations_bank_manager ON operations(assigned_bank_manager_id);
CREATE INDEX IF NOT EXISTS idx_operations_supervisor ON operations(assigned_supervisor_id);
