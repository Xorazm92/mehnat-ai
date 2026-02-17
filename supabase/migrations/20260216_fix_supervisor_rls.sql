-- =====================================================
-- Fix RLS Policies for Supervisor Access
-- Run this in Supabase SQL Editor
-- =====================================================

-- Step 1: Fix companies SELECT policy to include supervisor_id
DROP POLICY IF EXISTS "Accountants can view their own companies" ON companies;
DROP POLICY IF EXISTS "Staff can view relevant companies" ON companies;
CREATE POLICY "Staff can view relevant companies" ON companies FOR SELECT
  USING (
    accountant_id = auth.uid()
    OR supervisor_id = auth.uid()
    OR bank_client_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'manager', 'supervisor', 'chief_accountant', 'auditor')
    )
  );

-- Step 2: Fix companies UPDATE policy
DROP POLICY IF EXISTS "Accountants can update their own companies" ON companies;
DROP POLICY IF EXISTS "Staff can update relevant companies" ON companies;
CREATE POLICY "Staff can update relevant companies" ON companies FOR UPDATE
  USING (
    accountant_id = auth.uid()
    OR supervisor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'manager', 'supervisor', 'chief_accountant')
    )
  );

-- Step 3: Fix operations SELECT policy
DROP POLICY IF EXISTS "Users can view operations for accessible companies" ON operations;
DROP POLICY IF EXISTS "Staff can view relevant operations" ON operations;
CREATE POLICY "Staff can view relevant operations" ON operations FOR SELECT
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
          AND p.role IN ('super_admin', 'manager', 'supervisor', 'chief_accountant', 'auditor')
        )
      )
    )
  );

-- Step 4: Fix profiles SELECT policy to allow supervisors to see all staff
DROP POLICY IF EXISTS "Admins and managers can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins and supervisors can view all profiles" ON profiles;
CREATE POLICY "Admins and supervisors can view all profiles" ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'manager', 'supervisor', 'chief_accountant')
    )
  );
