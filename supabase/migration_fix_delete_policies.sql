-- FIX: ADD MISSING DELETE POLICIES
-- Date: 2026-02-07
-- Description: Adds missing RLS policies to allow deletion of companies, staff, operations, and documents.

-- 1. COMPANIES: Add DELETE policy for Super Admin and Manager
CREATE POLICY "Admins and managers can delete companies"
  ON companies FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'manager')
    )
  );

-- 2. PROFILES (Staff): Add DELETE policy for Super Admin only
-- Note: Deleting a user profile should be restricted to Super Admins.
CREATE POLICY "Only super admins can delete profiles"
  ON profiles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'super_admin'
    )
  );

-- 3. OPERATIONS (Reports): Add DELETE policy for Accountants (own) and Admins
CREATE POLICY "Accountants can delete their own operations"
  ON operations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM companies
      WHERE companies.id = operations.company_id
      AND (
        companies.accountant_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('super_admin', 'manager')
        )
      )
    )
  );

-- 4. DOCUMENTS: Add DELETE policy for Accountants (own) and Admins
CREATE POLICY "Accountants can delete their own documents"
  ON documents FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM companies
      WHERE companies.id = documents.company_id
      AND (
        companies.accountant_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('super_admin', 'manager')
        )
      )
    )
  );

-- 5. CONTRACT ASSIGNMENTS: Add DELETE policy if table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'client_assignments') THEN
        CREATE POLICY "Admins can delete assignments"
          ON client_assignments FOR DELETE
          USING (
            EXISTS (
              SELECT 1 FROM profiles
              WHERE id = auth.uid()
              AND role IN ('super_admin', 'manager')
            )
          );
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'contract_assignments') THEN
         CREATE POLICY "Admins can delete contract assignments"
          ON contract_assignments FOR DELETE
          USING (
            EXISTS (
              SELECT 1 FROM profiles
              WHERE id = auth.uid()
              AND role IN ('super_admin', 'manager')
            )
          );
    END IF;
END$$;
