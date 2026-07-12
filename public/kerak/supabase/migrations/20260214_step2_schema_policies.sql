-- MIGRATION STEP 2: Structural changes and Policies
-- Run this AFTER step1_add_roles.sql has completed

-- 1. Add missing columns to company_monthly_reports
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS assigned_accountant_id UUID REFERENCES profiles(id);
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS assigned_accountant_name TEXT;

-- 2. Update RLS policies to allow appropriate staff roles
DROP POLICY IF EXISTS "Staff can manage monthly reports" ON company_monthly_reports;
DROP POLICY IF EXISTS "Admins can manage monthly reports" ON company_monthly_reports;

CREATE POLICY "Staff can manage monthly reports"
  ON company_monthly_reports FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'admin', 'manager', 'supervisor', 'accountant')
    )
  );
