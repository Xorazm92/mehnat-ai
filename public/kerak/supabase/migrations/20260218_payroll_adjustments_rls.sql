-- Fix payroll_adjustments RLS policies (INSERT/UPDATE/DELETE must use WITH CHECK)

ALTER TABLE public.payroll_adjustments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (safe)
DROP POLICY IF EXISTS "Employees can view their own adjustments" ON public.payroll_adjustments;
DROP POLICY IF EXISTS "Only admins can manage adjustments" ON public.payroll_adjustments;
DROP POLICY IF EXISTS "Admins can insert adjustments" ON public.payroll_adjustments;
DROP POLICY IF EXISTS "Admins can update adjustments" ON public.payroll_adjustments;
DROP POLICY IF EXISTS "Admins can delete adjustments" ON public.payroll_adjustments;

-- Read access: employee can see own; admins can see all
CREATE POLICY "Employees can view their own adjustments"
  ON public.payroll_adjustments FOR SELECT
  USING (
    employee_id = auth.uid()
    OR public.has_role(ARRAY['super_admin','manager','chief_accountant'])
  );

-- Insert: only admins/chief
CREATE POLICY "Admins can insert adjustments"
  ON public.payroll_adjustments FOR INSERT
  WITH CHECK (
    public.has_role(ARRAY['super_admin','manager','chief_accountant'])
  );

-- Update: only admins/chief
CREATE POLICY "Admins can update adjustments"
  ON public.payroll_adjustments FOR UPDATE
  USING (public.has_role(ARRAY['super_admin','manager','chief_accountant']))
  WITH CHECK (public.has_role(ARRAY['super_admin','manager','chief_accountant']));

-- Delete: only admins/chief
CREATE POLICY "Admins can delete adjustments"
  ON public.payroll_adjustments FOR DELETE
  USING (public.has_role(ARRAY['super_admin','manager','chief_accountant']));
