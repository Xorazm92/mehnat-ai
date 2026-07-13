-- =====================================================
-- Companies: add chief accountant assignment field
-- Removes hardcoded chief accountant user-id usage in application logic
-- =====================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS chief_accountant_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_companies_chief_accountant ON public.companies(chief_accountant_id);
