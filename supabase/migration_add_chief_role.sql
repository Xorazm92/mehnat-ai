-- Add chief_accountant to user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'chief_accountant' AFTER 'manager';

-- Re-sync existing logic if needed
COMMENT ON TYPE user_role IS 'super_admin, manager, chief_accountant, accountant, auditor';
