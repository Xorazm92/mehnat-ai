-- Fix monthly_performance RLS policies to allow chief_accountant and supervisors

ALTER TABLE public.monthly_performance ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Users can view performance of their companies" ON public.monthly_performance;
DROP POLICY IF EXISTS "Supervisors and admins can record performance" ON public.monthly_performance;
DROP POLICY IF EXISTS "Supervisors and admins can update performance" ON public.monthly_performance;

-- SELECT: employee can see own, company participants can see, and admin/chief can see all
CREATE POLICY "Users can view performance of their companies"
  ON public.monthly_performance FOR SELECT
  USING (
    employee_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = monthly_performance.company_id
        AND (
          c.accountant_id = auth.uid()
          OR c.bank_client_id = auth.uid()
          OR c.supervisor_id = auth.uid()
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'manager', 'auditor', 'chief_accountant')
    )
  );

-- INSERT: admins/chief can insert; supervisor can insert for their companies
CREATE POLICY "Supervisors and admins can record performance"
  ON public.monthly_performance FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'manager', 'auditor', 'chief_accountant')
    )
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = monthly_performance.company_id
        AND c.supervisor_id = auth.uid()
    )
  );

-- UPDATE: admins/chief can update; supervisor can update for their companies
CREATE POLICY "Supervisors and admins can update performance"
  ON public.monthly_performance FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'manager', 'chief_accountant')
    )
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = monthly_performance.company_id
        AND c.supervisor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'manager', 'chief_accountant')
    )
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = monthly_performance.company_id
        AND c.supervisor_id = auth.uid()
    )
  );
