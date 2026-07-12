-- =====================================================
-- FINAL FIX for RLS recursion on 'profiles' table
-- =====================================================

-- Step 1: Create a security definer function to check roles without recursion
-- This function runs with the privileges of the creator (postgres)
DROP FUNCTION IF EXISTS public.get_auth_role() CASCADE;

CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_role text;
BEGIN
    SELECT role INTO user_role FROM profiles WHERE id = auth.uid();
    RETURN user_role;
END;
$$;

-- Step 2: Drop all problematic policies
DROP POLICY IF EXISTS "Users can see own profile" ON profiles;
DROP POLICY IF EXISTS "Allow authenticated to see profile metadata" ON profiles;
DROP POLICY IF EXISTS "Admins and supervisors can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Profiles access policy" ON profiles;
DROP POLICY IF EXISTS "Profiles update policy" ON profiles;

-- Step 3: Create clean, non-recursive policies for profiles
-- 1. Everyone can see their own profile
CREATE POLICY "Profiles self select" ON profiles 
FOR SELECT USING (id = auth.uid());

-- 2. Admins and supervisors can see all profiles
-- We use the security definer function to avoid recursion
CREATE POLICY "Profiles admin select" ON profiles 
FOR SELECT USING (
    get_auth_role() IN ('super_admin', 'manager', 'supervisor', 'chief_accountant')
);

-- 3. Users can update their own profile
CREATE POLICY "Profiles self update" ON profiles 
FOR UPDATE USING (id = auth.uid());

-- Step 4: Update Companies Policies to use the function for efficiency
DROP POLICY IF EXISTS "Staff can view relevant companies" ON companies;
DROP POLICY IF EXISTS "Admins view all companies" ON companies;

CREATE POLICY "Companies access policy" ON companies
FOR SELECT USING (
    accountant_id = auth.uid() OR 
    supervisor_id = auth.uid() OR 
    bank_client_id = auth.uid() OR
    get_auth_role() IN ('super_admin', 'manager', 'supervisor', 'chief_accountant', 'auditor')
);

-- Step 5: Update Operations Policies
DROP POLICY IF EXISTS "Staff can view relevant operations" ON operations;

CREATE POLICY "Operations access policy" ON operations
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM companies c
        WHERE c.id = operations.company_id
        AND (
            c.accountant_id = auth.uid() OR 
            c.supervisor_id = auth.uid() OR 
            c.bank_client_id = auth.uid() OR
            get_auth_role() IN ('super_admin', 'manager', 'supervisor', 'chief_accountant', 'auditor')
        )
    )
);
