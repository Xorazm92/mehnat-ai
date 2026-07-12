-- ============================================================
-- Migration: 2026 Statistics Reports Updates
-- Adds new columns for Monthly, Quarterly, and Yearly statistics
-- ============================================================

-- 1. Monthly Statistics
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS stat_12_invest TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS stat_12_moliya TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS stat_12_korxona TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS stat_12_narx TEXT;

-- 2. Quarterly Statistics
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS stat_4_invest TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS stat_4_mehnat TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS stat_4_korxona_miz TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS stat_4_kb_qur_sav_xiz TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS stat_4_kb_sanoat TEXT;

-- 3. Yearly Statistics
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS stat_1_invest TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS stat_1_ih TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS stat_1_energiya TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS stat_1_korxona TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS stat_1_korxona_tif TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS stat_1_moliya TEXT;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS stat_1_akt TEXT;
