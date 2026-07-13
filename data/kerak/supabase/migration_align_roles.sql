-- 1. Align user_role enum with all required roles
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'chief_accountant' AFTER 'manager';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'supervisor' AFTER 'chief_accountant';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'bank_manager' AFTER 'supervisor';

-- 2. Correct specific users based on names (Go'zaloy & Yorqinoy)
-- Assuming Go'zaloy should be supervisor and Yorqinoy should be chief_accountant
UPDATE profiles 
SET role = 'supervisor' 
WHERE full_name ILIKE '%Go%zaloy%' 
   OR full_name ILIKE '%Muslimbek%'
   OR full_name ILIKE '%Musobek%';

UPDATE profiles 
SET role = 'chief_accountant' 
WHERE full_name ILIKE '%Yorqinoy%';

-- 3. Ensure 'manager' roles are migrated to 'supervisor' if they exist
UPDATE profiles 
SET role = 'supervisor' 
WHERE role = 'manager';
