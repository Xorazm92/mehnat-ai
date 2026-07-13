-- SUPABASE_FINAL_ALIGNMENT.sql
-- Run this in your Supabase SQL Editor to fix the "column not found" errors

-- 1. Ensure all columns exist in company_monthly_reports
DO $$ 
BEGIN
    -- Kundalik
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_monthly_reports' AND column_name='didox') THEN ALTER TABLE company_monthly_reports ADD COLUMN didox TEXT; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_monthly_reports' AND column_name='xatlar') THEN ALTER TABLE company_monthly_reports ADD COLUMN xatlar TEXT; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_monthly_reports' AND column_name='avtokameral') THEN ALTER TABLE company_monthly_reports ADD COLUMN avtokameral TEXT; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_monthly_reports' AND column_name='my_mehnat') THEN ALTER TABLE company_monthly_reports ADD COLUMN my_mehnat TEXT; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_monthly_reports' AND column_name='one_c') THEN ALTER TABLE company_monthly_reports ADD COLUMN one_c TEXT; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_monthly_reports' AND column_name='bank_klient') THEN ALTER TABLE company_monthly_reports ADD COLUMN bank_klient TEXT; END IF;
    
    -- Oylik
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_monthly_reports' AND column_name='pul_oqimlari') THEN ALTER TABLE company_monthly_reports ADD COLUMN pul_oqimlari TEXT; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_monthly_reports' AND column_name='chiqadigan_soliqlar') THEN ALTER TABLE company_monthly_reports ADD COLUMN chiqadigan_soliqlar TEXT; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_monthly_reports' AND column_name='hisoblangan_oylik') THEN ALTER TABLE company_monthly_reports ADD COLUMN hisoblangan_oylik TEXT; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_monthly_reports' AND column_name='debitor_kreditor') THEN ALTER TABLE company_monthly_reports ADD COLUMN debitor_kreditor TEXT; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_monthly_reports' AND column_name='foyda_va_zarar') THEN ALTER TABLE company_monthly_reports ADD COLUMN foyda_va_zarar TEXT; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_monthly_reports' AND column_name='tovar_ostatka') THEN ALTER TABLE company_monthly_reports ADD COLUMN tovar_ostatka TEXT; END IF;
    
    -- Soliq
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_monthly_reports' AND column_name='nds_bekor_qilish') THEN ALTER TABLE company_monthly_reports ADD COLUMN nds_bekor_qilish TEXT; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_monthly_reports' AND column_name='aylanma_qqs') THEN ALTER TABLE company_monthly_reports ADD COLUMN aylanma_qqs TEXT; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_monthly_reports' AND column_name='daromad_soliq') THEN ALTER TABLE company_monthly_reports ADD COLUMN daromad_soliq TEXT; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_monthly_reports' AND column_name='inps') THEN ALTER TABLE company_monthly_reports ADD COLUMN inps TEXT; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_monthly_reports' AND column_name='foyda_soliq') THEN ALTER TABLE company_monthly_reports ADD COLUMN foyda_soliq TEXT; END IF;
    
    -- Chorak / Yillik
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_monthly_reports' AND column_name='moliyaviy_natija') THEN ALTER TABLE company_monthly_reports ADD COLUMN moliyaviy_natija TEXT; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_monthly_reports' AND column_name='buxgalteriya_balansi') THEN ALTER TABLE company_monthly_reports ADD COLUMN buxgalteriya_balansi TEXT; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_monthly_reports' AND column_name='statistika') THEN ALTER TABLE company_monthly_reports ADD COLUMN statistika TEXT; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_monthly_reports' AND column_name='bonak') THEN ALTER TABLE company_monthly_reports ADD COLUMN bonak TEXT; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_monthly_reports' AND column_name='yer_soligi') THEN ALTER TABLE company_monthly_reports ADD COLUMN yer_soligi TEXT; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_monthly_reports' AND column_name='mol_mulk_soligi') THEN ALTER TABLE company_monthly_reports ADD COLUMN mol_mulk_soligi TEXT; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_monthly_reports' AND column_name='suv_soligi') THEN ALTER TABLE company_monthly_reports ADD COLUMN suv_soligi TEXT; END IF;

    -- Legacy support (if they existed with different names) - Optional but safer
    -- IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_monthly_reports' AND column_name='foyda_soligi') THEN ...
END $$;
