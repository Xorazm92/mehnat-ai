-- ============================================================
-- Migration: CRM/ERP Enhancements
-- 1. Buxgalter tarixi (assigned_accountant per report)
-- 2. Active services per company
-- ============================================================

-- 1. Buxgalter tarixi: Oylik hisobotga buxgalter muhrlanishi
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS assigned_accountant_id UUID;
ALTER TABLE company_monthly_reports ADD COLUMN IF NOT EXISTS assigned_accountant_name TEXT;

-- 2. Xizmatlarni yoqish/o'chirish
ALTER TABLE companies ADD COLUMN IF NOT EXISTS active_services JSONB DEFAULT '[]'::jsonb;
