
-- Add assigned_accountant_id to operations for historical tracking
ALTER TABLE operations ADD COLUMN IF NOT EXISTS assigned_accountant_id UUID REFERENCES profiles(id);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_operations_assigned_accountant ON operations(assigned_accountant_id);
