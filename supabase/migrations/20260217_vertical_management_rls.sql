-- Vertical management RLS (Supervisor can fully access assigned companies and related data)

-- =====================================================
-- 1) Helper functions (recursion-safe)
-- =====================================================

-- Required dependency: public.has_role(text[]) from 20260216_fix_profiles_rls_recursion.sql

CREATE OR REPLACE FUNCTION public.can_access_company(c_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = c_id
      AND (
        c.accountant_id = auth.uid()
        OR c.supervisor_id = auth.uid()
        OR c.bank_client_id = auth.uid()
      )
  )
  OR public.has_role(ARRAY['super_admin','chief_accountant']);
$$;

GRANT EXECUTE ON FUNCTION public.can_access_company(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_company(uuid) TO anon;

CREATE OR REPLACE FUNCTION public.can_manage_company(c_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public.has_role(ARRAY['super_admin','chief_accountant'])
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = c_id
      AND (
        c.accountant_id = auth.uid()
        OR c.supervisor_id = auth.uid()
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_company(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_company(uuid) TO anon;

CREATE OR REPLACE FUNCTION public.can_view_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT (p_profile_id = auth.uid())
  OR public.has_role(ARRAY['super_admin','chief_accountant'])
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.supervisor_id = auth.uid()
      AND (c.accountant_id = p_profile_id OR c.bank_client_id = p_profile_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_view_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_profile(uuid) TO anon;

-- =====================================================
-- 2) PROFILES policies (staff visibility)
-- =====================================================

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN (
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users can view accessible profiles"
  ON public.profiles FOR SELECT
  USING (public.can_view_profile(id));

-- Keep self update only (or admin roles)
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- =====================================================
-- 3) COMPANIES policies
-- =====================================================

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN (
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'companies'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.companies', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users can view accessible companies"
  ON public.companies FOR SELECT
  USING (public.can_access_company(id));

CREATE POLICY "Users can update accessible companies"
  ON public.companies FOR UPDATE
  USING (public.can_manage_company(id));

CREATE POLICY "Admins can insert companies"
  ON public.companies FOR INSERT
  WITH CHECK (public.has_role(ARRAY['super_admin','chief_accountant']));

-- Optional: allow delete only for admins
CREATE POLICY "Admins can delete companies"
  ON public.companies FOR DELETE
  USING (public.has_role(ARRAY['super_admin','chief_accountant']));

-- =====================================================
-- 4) OPERATIONS policies
-- =====================================================

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN (
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'operations'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.operations', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users can view operations for accessible companies"
  ON public.operations FOR SELECT
  USING (public.can_access_company(company_id));

CREATE POLICY "Users can update operations for accessible companies"
  ON public.operations FOR UPDATE
  USING (public.can_manage_company(company_id));

CREATE POLICY "Users can insert operations for accessible companies"
  ON public.operations FOR INSERT
  WITH CHECK (public.can_manage_company(company_id));

CREATE POLICY "Users can delete operations for accessible companies"
  ON public.operations FOR DELETE
  USING (public.can_manage_company(company_id));

-- =====================================================
-- 5) MONTHLY REPORTS policies
-- =====================================================

ALTER TABLE public.company_monthly_reports ENABLE ROW LEVEL SECURITY;

 DO $$
 DECLARE pol record;
 BEGIN
   FOR pol IN (
     SELECT policyname
     FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'company_monthly_reports'
   ) LOOP
     EXECUTE format('DROP POLICY IF EXISTS %I ON public.company_monthly_reports', pol.policyname);
   END LOOP;
 END $$;

CREATE POLICY "Users can view monthly reports for accessible companies"
  ON public.company_monthly_reports FOR SELECT
  USING (public.can_access_company(company_id));

CREATE POLICY "Users can manage monthly reports for accessible companies"
  ON public.company_monthly_reports FOR ALL
  USING (public.can_manage_company(company_id))
  WITH CHECK (public.can_manage_company(company_id));

-- =====================================================
-- 6) DOCUMENTS policies
-- =====================================================

 DO $$
 DECLARE pol record;
 BEGIN
   FOR pol IN (
     SELECT policyname
     FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'documents'
   ) LOOP
     EXECUTE format('DROP POLICY IF EXISTS %I ON public.documents', pol.policyname);
   END LOOP;
 END $$;

DROP POLICY IF EXISTS "Users can view documents for accessible companies" ON public.documents;
DROP POLICY IF EXISTS "Users can upload documents for their companies" ON public.documents;
DROP POLICY IF EXISTS "Documents access policy" ON public.documents;
DROP POLICY IF EXISTS "Documents upload policy" ON public.documents;
DROP POLICY IF EXISTS "Accountants can delete their own documents" ON public.documents;

CREATE POLICY "Users can view documents for accessible companies"
  ON public.documents FOR SELECT
  USING (public.can_access_company(company_id));

CREATE POLICY "Users can upload documents for accessible companies"
  ON public.documents FOR INSERT
  WITH CHECK (public.can_manage_company(company_id));

CREATE POLICY "Users can delete documents for accessible companies"
  ON public.documents FOR DELETE
  USING (public.can_manage_company(company_id));

-- =====================================================
-- 7) PAYMENTS policies
-- =====================================================

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

 DO $$
 DECLARE pol record;
 BEGIN
   FOR pol IN (
     SELECT policyname
     FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'payments'
   ) LOOP
     EXECUTE format('DROP POLICY IF EXISTS %I ON public.payments', pol.policyname);
   END LOOP;
 END $$;

DROP POLICY IF EXISTS "Admins and managers can view all payments" ON public.payments;
DROP POLICY IF EXISTS "Admins and managers can insert/update payments" ON public.payments;

CREATE POLICY "Users can view payments for accessible companies"
  ON public.payments FOR SELECT
  USING (public.can_access_company(company_id));

CREATE POLICY "Users can manage payments for accessible companies"
  ON public.payments FOR ALL
  USING (public.can_manage_company(company_id))
  WITH CHECK (public.can_manage_company(company_id));

-- =====================================================
-- 8) EXPENSES policies (not company-scoped)
-- =====================================================

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

 DO $$
 DECLARE pol record;
 BEGIN
   FOR pol IN (
     SELECT policyname
     FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'expenses'
   ) LOOP
     EXECUTE format('DROP POLICY IF EXISTS %I ON public.expenses', pol.policyname);
   END LOOP;
 END $$;

DROP POLICY IF EXISTS "Admins and managers can view all expenses" ON public.expenses;
DROP POLICY IF EXISTS "Admins and managers can insert/update expenses" ON public.expenses;

CREATE POLICY "Admins can view expenses"
  ON public.expenses FOR SELECT
  USING (public.has_role(ARRAY['super_admin','chief_accountant']));

CREATE POLICY "Admins can manage expenses"
  ON public.expenses FOR ALL
  USING (public.has_role(ARRAY['super_admin','chief_accountant']))
  WITH CHECK (public.has_role(ARRAY['super_admin','chief_accountant']));

-- =====================================================
-- 9) CLIENT CREDENTIALS policies
-- =====================================================

ALTER TABLE public.client_credentials ENABLE ROW LEVEL SECURITY;

 DO $$
 DECLARE pol record;
 BEGIN
   FOR pol IN (
     SELECT policyname
     FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'client_credentials'
   ) LOOP
     EXECUTE format('DROP POLICY IF EXISTS %I ON public.client_credentials', pol.policyname);
   END LOOP;
 END $$;

DROP POLICY IF EXISTS "Users can view credentials for accessible companies" ON public.client_credentials;
DROP POLICY IF EXISTS "Admins can manage credentials" ON public.client_credentials;

CREATE POLICY "Users can view credentials for accessible companies"
  ON public.client_credentials FOR SELECT
  USING (public.can_access_company(company_id));

CREATE POLICY "Users can manage credentials for accessible companies"
  ON public.client_credentials FOR ALL
  USING (public.can_manage_company(company_id))
  WITH CHECK (public.can_manage_company(company_id));

-- =====================================================
-- 10) CONTRACT ASSIGNMENTS policies
-- =====================================================

ALTER TABLE public.contract_assignments ENABLE ROW LEVEL SECURITY;

 DO $$
 DECLARE pol record;
 BEGIN
   FOR pol IN (
     SELECT policyname
     FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'contract_assignments'
   ) LOOP
     EXECUTE format('DROP POLICY IF EXISTS %I ON public.contract_assignments', pol.policyname);
   END LOOP;
 END $$;

DROP POLICY IF EXISTS "View assignments" ON public.contract_assignments;
DROP POLICY IF EXISTS "Manage assignments" ON public.contract_assignments;

CREATE POLICY "Users can view assignments for accessible companies"
  ON public.contract_assignments FOR SELECT
  USING (public.can_access_company(client_id));

CREATE POLICY "Admins can manage assignments"
  ON public.contract_assignments FOR ALL
  USING (public.has_role(ARRAY['super_admin','chief_accountant']))
  WITH CHECK (public.has_role(ARRAY['super_admin','chief_accountant']));

-- =====================================================
-- 11) KPI / PERFORMANCE policies
-- =====================================================

ALTER TABLE public.monthly_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_history ENABLE ROW LEVEL SECURITY;

 DO $$
 DECLARE pol record;
 BEGIN
   FOR pol IN (
     SELECT tablename, policyname
     FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN (
         'kpi_rules',
         'monthly_performance',
         'payroll_adjustments',
         'kpi_metrics',
         'kpi_history'
       )
   ) LOOP
     EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
   END LOOP;
 END $$;

-- kpi_rules: everyone can read, admins manage
DROP POLICY IF EXISTS "Everyone can view active KPI rules" ON public.kpi_rules;
DROP POLICY IF EXISTS "Only admins can manage KPI rules" ON public.kpi_rules;

CREATE POLICY "Users can view KPI rules"
  ON public.kpi_rules FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage KPI rules"
  ON public.kpi_rules FOR ALL
  USING (public.has_role(ARRAY['super_admin','chief_accountant']))
  WITH CHECK (public.has_role(ARRAY['super_admin','chief_accountant']));

-- monthly_performance: tied to company
DROP POLICY IF EXISTS "Users can view performance of their companies" ON public.monthly_performance;
DROP POLICY IF EXISTS "Supervisors and admins can record performance" ON public.monthly_performance;
DROP POLICY IF EXISTS "Supervisors and admins can update performance" ON public.monthly_performance;

CREATE POLICY "Users can view performance for accessible companies"
  ON public.monthly_performance FOR SELECT
  USING (public.can_access_company(company_id) OR employee_id = auth.uid());

CREATE POLICY "Users can manage performance for accessible companies"
  ON public.monthly_performance FOR ALL
  USING (public.can_manage_company(company_id))
  WITH CHECK (public.can_manage_company(company_id));

-- payroll_adjustments: employee-scoped, admins view/manage
DROP POLICY IF EXISTS "Employees can view their own adjustments" ON public.payroll_adjustments;
DROP POLICY IF EXISTS "Only admins can manage adjustments" ON public.payroll_adjustments;

CREATE POLICY "Users can view payroll adjustments"
  ON public.payroll_adjustments FOR SELECT
  USING (employee_id = auth.uid() OR public.has_role(ARRAY['super_admin','chief_accountant']));

CREATE POLICY "Admins can manage payroll adjustments"
  ON public.payroll_adjustments FOR ALL
  USING (public.has_role(ARRAY['super_admin','chief_accountant']))
  WITH CHECK (public.has_role(ARRAY['super_admin','chief_accountant']));

-- kpi_metrics / kpi_history: employee-scoped
DROP POLICY IF EXISTS "Users can view their own KPI metrics" ON public.kpi_metrics;
DROP POLICY IF EXISTS "System can insert/update KPI metrics" ON public.kpi_metrics;
DROP POLICY IF EXISTS "Users can view their own KPI history" ON public.kpi_history;

CREATE POLICY "Users can view KPI metrics"
  ON public.kpi_metrics FOR SELECT
  USING (accountant_id = auth.uid() OR public.has_role(ARRAY['super_admin','chief_accountant']));

CREATE POLICY "System can insert/update KPI metrics"
  ON public.kpi_metrics FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can view KPI history"
  ON public.kpi_history FOR SELECT
  USING (accountant_id = auth.uid() OR public.has_role(ARRAY['super_admin','chief_accountant']));

-- =====================================================
-- 12) AUDIT LOGS policies
-- =====================================================

 DO $$
 DECLARE pol record;
 BEGIN
   FOR pol IN (
     SELECT policyname
     FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'audit_logs'
   ) LOOP
     EXECUTE format('DROP POLICY IF EXISTS %I ON public.audit_logs', pol.policyname);
   END LOOP;
 END $$;

DROP POLICY IF EXISTS "Only admins can view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Audit select policy" ON public.audit_logs;

CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (public.has_role(ARRAY['super_admin','chief_accountant']));
