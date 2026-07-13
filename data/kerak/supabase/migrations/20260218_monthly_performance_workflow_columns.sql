-- Add missing workflow columns to monthly_performance table for KPI approval workflow

ALTER TABLE monthly_performance 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'employee' CHECK (source IN ('employee', 'supervisor', 'chief', 'system')),
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rejected_reason TEXT;

-- Update RLS to allow updates based on status (approved KPI can't be changed)
CREATE OR REPLACE POLICY "Supervisors and admins can update performance"
  ON public.monthly_performance FOR UPDATE
  USING (
    status != 'approved'  -- Can't update approved records
    AND (
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
  )
  WITH CHECK (
    status != 'approved'
    AND (
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
  );

-- Add index for status
CREATE INDEX IF NOT EXISTS idx_monthly_perf_status ON monthly_performance(status);
