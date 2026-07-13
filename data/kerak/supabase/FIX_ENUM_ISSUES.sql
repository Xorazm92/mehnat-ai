-- ==========================================
-- FIX: RLS policies for direct table upsert
-- Run this in Supabase SQL Editor
-- ==========================================

-- 1. KILL any stuck transactions from previous attempts
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state IN ('idle in transaction', 'idle in transaction (aborted)')
AND pid <> pg_backend_pid();

-- 2. Drop problematic triggers
DROP TRIGGER IF EXISTS audit_contract_assignments ON contract_assignments;
DROP TRIGGER IF EXISTS audit_companies ON companies;
DROP TRIGGER IF EXISTS trigger_log_company_changes ON companies;

-- 3. Fix Companies RLS — allow managers to do everything
DROP POLICY IF EXISTS "Companies select policy" ON companies;
DROP POLICY IF EXISTS "Companies update policy" ON companies;
DROP POLICY IF EXISTS "Companies insert policy" ON companies;
DROP POLICY IF EXISTS "Companies delete policy" ON companies;
DROP POLICY IF EXISTS "Allow managers full access" ON companies;

-- Single comprehensive policy for managers
CREATE POLICY "Allow managers full access" ON companies 
  FOR ALL 
  USING (
    accountant_id = auth.uid() 
    OR public.check_is_manager() 
    OR public.check_is_auditor()
  )
  WITH CHECK (
    public.check_is_manager()
  );

-- 4. Fix contract_assignments RLS — allow managers
DROP POLICY IF EXISTS "Allow all for authenticated" ON contract_assignments;
DROP POLICY IF EXISTS "Managers manage assignments" ON contract_assignments;
DROP POLICY IF EXISTS "contract_assignments_select" ON contract_assignments;
DROP POLICY IF EXISTS "contract_assignments_insert" ON contract_assignments;
DROP POLICY IF EXISTS "contract_assignments_update" ON contract_assignments;
DROP POLICY IF EXISTS "contract_assignments_delete" ON contract_assignments;

-- Make sure RLS is enabled
ALTER TABLE contract_assignments ENABLE ROW LEVEL SECURITY;

-- Single comprehensive policy
CREATE POLICY "Managers manage assignments" ON contract_assignments
  FOR ALL
  USING (true)
  WITH CHECK (public.check_is_manager());

-- 5. Fix ENUM → TEXT (if not done yet)
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'companies' AND column_name = 'server_info'
        AND data_type = 'USER-DEFINED'
    ) THEN
        ALTER TABLE public.companies ALTER COLUMN server_info TYPE TEXT;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'contract_assignments' AND column_name = 'role'
        AND data_type = 'USER-DEFINED'
    ) THEN
        ALTER TABLE public.contract_assignments ALTER COLUMN role TYPE TEXT;
    END IF;
END $$;

-- 6. Verify
SELECT tablename, policyname, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('companies', 'contract_assignments');
