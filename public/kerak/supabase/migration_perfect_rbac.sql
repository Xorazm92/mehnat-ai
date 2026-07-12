-- 1. Update RLS policies for profiles to include supervisor and chief_accountant
DROP POLICY IF EXISTS "Admins and managers can view all profiles" ON profiles;
CREATE POLICY "Admins and supervisors can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'manager', 'supervisor', 'chief_accountant')
    )
  );

-- 2. Update RLS policies for companies
DROP POLICY IF EXISTS "Accountants can view their own companies" ON companies;
CREATE POLICY "Staff can view relevant companies"
  ON companies FOR SELECT
  USING (
    accountant_id = auth.uid()
    OR supervisor_id = auth.uid()
    OR bank_client_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'manager', 'supervisor', 'chief_accountant')
    )
  );

-- 3. Update RLS policies for operations
DROP POLICY IF EXISTS "Accountants can view their own operations" ON operations;
CREATE POLICY "Staff can view relevant operations"
  ON operations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = operations.company_id
      AND (
        c.accountant_id = auth.uid()
        OR c.supervisor_id = auth.uid()
        OR c.bank_client_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
          AND p.role IN ('super_admin', 'manager', 'supervisor', 'chief_accountant')
        )
      )
    )
  );

-- 4. Re-assign Go'zaloy's firms to a subordinate and set her as supervisor
-- We'll pick 'Ruslan' (7dcd6c86-f6ba-4015-a90e-d20d2127aa46) as the new accountant
UPDATE companies
SET 
  supervisor_id = 'afb104a8-0032-476f-9042-d23ed5fe98b9', -- Go'zaloy
  accountant_id = '7dcd6c86-f6ba-4015-a90e-d20d2127aa46', -- Ruslan
  accountant_name = 'Ruslan'
WHERE accountant_id = 'afb104a8-0032-476f-9042-d23ed5fe98b9';

-- 5. Ensure all companies where Muslimbek/Musobek were accountants are also tagged with them as supervisors if needed
-- For now, ensure they have supervisor coverage on their firms too
UPDATE companies
SET supervisor_id = accountant_id
WHERE accountant_id IN ('99f728be-7822-46dd-958a-440ee76aa577', '83130d2d-1f2a-4a15-95df-c9048a278405')
  AND supervisor_id IS NULL;
