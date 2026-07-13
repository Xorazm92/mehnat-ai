-- Add deadline columns to operations table if they don't exist
ALTER TABLE operations ADD COLUMN IF NOT EXISTS deadline_profit_tax DATE;
ALTER TABLE operations ADD COLUMN IF NOT EXISTS deadline_stats DATE;

-- Composite unique constraint check (should already exist but good for verification)
-- ALTER TABLE operations ADD CONSTRAINT unique_company_period UNIQUE(company_id, period);
