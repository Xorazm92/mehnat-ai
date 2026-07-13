-- =====================================================
-- KPI Workflow: employee submit -> supervisor approve/reject
-- Adds status + submission/approval audit fields to monthly_performance
-- =====================================================

ALTER TABLE public.monthly_performance
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'supervisor'
    CHECK (source IN ('employee','supervisor','chief','system')),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('draft','submitted','approved','rejected')),
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_monthly_perf_status ON public.monthly_performance(status);
CREATE INDEX IF NOT EXISTS idx_monthly_perf_source ON public.monthly_performance(source);

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN (
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'monthly_performance'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

CREATE POLICY "Users can view performance for accessible companies"
  ON public.monthly_performance FOR SELECT
  USING (public.can_access_company(company_id) OR employee_id = auth.uid());

CREATE POLICY "Managers can insert performance for accessible companies"
  ON public.monthly_performance FOR INSERT
  WITH CHECK (public.can_manage_company(company_id));

CREATE POLICY "Managers can update performance for accessible companies"
  ON public.monthly_performance FOR UPDATE
  USING (public.can_manage_company(company_id))
  WITH CHECK (public.can_manage_company(company_id));

CREATE POLICY "Employees can submit their own performance"
  ON public.monthly_performance FOR INSERT
  WITH CHECK (
    employee_id = auth.uid()
    AND source = 'employee'
    AND status IN ('draft','submitted')
  );

CREATE POLICY "Employees can update their own submissions"
  ON public.monthly_performance FOR UPDATE
  USING (
    employee_id = auth.uid()
    AND source = 'employee'
    AND status IN ('draft','submitted')
  )
  WITH CHECK (
    employee_id = auth.uid()
    AND source = 'employee'
    AND status IN ('draft','submitted')
  );
