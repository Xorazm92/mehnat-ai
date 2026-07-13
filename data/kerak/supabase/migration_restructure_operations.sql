-- ============================================================
-- Migration: Restructure Operations Matrix
-- Adds new columns for Soliq to'lovlari, Statistika, IT Park, Komunalka
-- ============================================================

-- Soliq to'lovlari (Hisobot ustunlari oldindan bor, bular To'lov uchun)
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS aylanma_qqs_tolov TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS daromad_soliq_tolov TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS inps_tolov TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS foyda_soliq_tolov TEXT;

-- Yangi soliq turlari
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS aksiz_soligi TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS nedro_soligi TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS norezident_foyda TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS norezident_nds TEXT;

-- Statistika bo'limi (10 ta ustun)
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS stat_1kb_yillik TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS stat_4kb_chorak TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS stat_1mehnat TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS stat_4mehnat_chorak TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS stat_1korxona TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS stat_1moliya TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS stat_4invest_xorijiy TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS stat_4invest_mahalliy TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS stat_1kx_yillik TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS stat_4kx_chorak TEXT;

-- IT Park
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS itpark_oylik TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS itpark_chorak TEXT;

-- Komunalka (Suv, Gaz, Svet)
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS kom_suv TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS kom_gaz TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS kom_svet TEXT;
