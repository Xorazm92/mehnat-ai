-- Migration: Add company_monthly_reports table for CSV-based operations tracking
-- Run this in your Supabase SQL Editor

-- 1. Create the company_monthly_reports table
CREATE TABLE IF NOT EXISTS company_monthly_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  period TEXT NOT NULL,
  bank_klient TEXT,
  didox TEXT,
  xatlar TEXT,
  avtokameral TEXT,
  my_mehnat TEXT,
  one_c TEXT,
  pul_oqimlari TEXT,
  chiqadigan_soliqlar TEXT,
  hisoblangan_oylik TEXT,
  debitor_kreditor TEXT,
  foyda_va_zarar TEXT,
  tovar_ostatka TEXT,
  nds_bekor_qilish TEXT,
  aylanma_qqs TEXT,
  daromad_soliq TEXT,
  inps TEXT,
  foyda_soliq TEXT,
  moliyaviy_natija TEXT,
  buxgalteriya_balansi TEXT,
  statistika TEXT,
  bonak TEXT,
  yer_soligi TEXT,
  mol_mulk_soligi TEXT,
  suv_soligi TEXT,
  comment TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, period)
);

-- 2. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_monthly_reports_company ON company_monthly_reports(company_id);
CREATE INDEX IF NOT EXISTS idx_monthly_reports_period ON company_monthly_reports(period);

-- 3. Add accountant_name and password columns to companies (if not exist)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='accountant_name') THEN
    ALTER TABLE companies ADD COLUMN accountant_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='password') THEN
    ALTER TABLE companies ADD COLUMN password TEXT;
  END IF;
END $$;

-- 4. RLS: Allow authenticated users to read monthly reports
ALTER TABLE company_monthly_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view monthly reports"
  ON company_monthly_reports FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage monthly reports"
  ON company_monthly_reports FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'manager')
    )
  );
