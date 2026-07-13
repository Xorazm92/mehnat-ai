-- =====================================================
-- FIX ALL MISSING TABLES - ASOS Accounting Manager
-- Run this in Supabase SQL Editor to fix 404 errors
-- Date: 2026-02-06
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. ENUMS (Safe creation with error handling)
-- =====================================================

DO $$ BEGIN
    CREATE TYPE contract_role AS ENUM ('accountant', 'controller', 'bank_manager');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE salary_calculation_type AS ENUM ('percent', 'fixed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE server_info_type AS ENUM ('CR1', 'CR2', 'CR3');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- 2. CONTRACT ASSIGNMENTS TABLE (Critical - Caused 404)
-- =====================================================

CREATE TABLE IF NOT EXISTS contract_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL DEFAULT 'accountant',
    salary_type TEXT NOT NULL DEFAULT 'percent',
    salary_value FLOAT NOT NULL DEFAULT 20.0,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_client ON contract_assignments(client_id);
CREATE INDEX IF NOT EXISTS idx_assignments_user ON contract_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_dates ON contract_assignments(start_date, end_date);

-- =====================================================
-- 3. CLIENT CREDENTIALS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS client_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    service_name TEXT NOT NULL,
    login_id TEXT,
    encrypted_password TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credentials_company ON client_credentials(company_id);

-- =====================================================
-- 4. CLIENT HISTORY TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS client_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES profiles(id),
    action TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_history_company ON client_history(company_id);

-- =====================================================
-- 5. PAYMENTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    amount NUMERIC DEFAULT 0,
    period TEXT,
    payment_date DATE,
    status TEXT DEFAULT 'pending',
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_company ON payments(company_id);

-- =====================================================
-- 6. EXPENSES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    amount NUMERIC DEFAULT 0,
    date DATE,
    category TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 7. KPI RULES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS kpi_rules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    name_uz TEXT,
    description TEXT,
    role TEXT NOT NULL DEFAULT 'accountant',
    reward_percent DECIMAL(5,2) DEFAULT 0,
    penalty_percent DECIMAL(5,2) DEFAULT 0,
    input_type TEXT NOT NULL DEFAULT 'checkbox',
    category TEXT DEFAULT 'general',
    sort_order INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_kpi_rules_role ON kpi_rules(role);
CREATE INDEX IF NOT EXISTS idx_kpi_rules_active ON kpi_rules(is_active);

-- =====================================================
-- 8. MONTHLY PERFORMANCE TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS monthly_performance (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    month DATE NOT NULL,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    employee_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    rule_id UUID REFERENCES kpi_rules(id) ON DELETE CASCADE NOT NULL,
    value DECIMAL(10,2) NOT NULL DEFAULT 0,
    calculated_score DECIMAL(10,4) DEFAULT 0,
    notes TEXT,
    change_reason TEXT,
    recorded_by UUID REFERENCES profiles(id),
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(month, company_id, employee_id, rule_id)
);

CREATE INDEX IF NOT EXISTS idx_monthly_perf_month ON monthly_performance(month);
CREATE INDEX IF NOT EXISTS idx_monthly_perf_company ON monthly_performance(company_id);
CREATE INDEX IF NOT EXISTS idx_monthly_perf_employee ON monthly_performance(employee_id);

-- =====================================================
-- 9. PAYROLL ADJUSTMENTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS payroll_adjustments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    month DATE NOT NULL,
    employee_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    adjustment_type TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    reason TEXT NOT NULL,
    approved_by UUID REFERENCES profiles(id),
    approved_at TIMESTAMPTZ,
    is_approved BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_adj_month ON payroll_adjustments(month);
CREATE INDEX IF NOT EXISTS idx_payroll_adj_employee ON payroll_adjustments(employee_id);

-- =====================================================
-- 10. AUDIT LOGS TABLE (if not exists)
-- =====================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT,
    old_data JSONB,
    new_data JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_table ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_logs(created_at);

-- =====================================================
-- 11. ADD MISSING COLUMNS TO COMPANIES TABLE
-- =====================================================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS bank_client_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS contract_amount DECIMAL(15, 2) DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS accountant_perc DECIMAL(5, 2) DEFAULT 20;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS bank_client_sum DECIMAL(15, 2) DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS supervisor_perc DECIMAL(5, 2) DEFAULT 5;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS chief_accountant_sum DECIMAL(15, 2) DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS internal_contractor TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS server_info TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS base_name_1c TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS kpi_enabled BOOLEAN DEFAULT true;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stat_reports TEXT[];
ALTER TABLE companies ADD COLUMN IF NOT EXISTS service_scope TEXT[];
ALTER TABLE companies ADD COLUMN IF NOT EXISTS it_park_resident BOOLEAN DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tax_type_new TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS brand_name TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS director_name TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS director_phone TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS legal_address TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS founder_name TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS certificate_file_path TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS charter_file_path TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS vat_certificate_date DATE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS has_land_tax BOOLEAN DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS has_water_tax BOOLEAN DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS has_property_tax BOOLEAN DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS has_excise_tax BOOLEAN DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS has_auction_tax BOOLEAN DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS one_c_status TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS one_c_location TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS contract_number TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS contract_date DATE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS payment_day INTEGER DEFAULT 5;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS firma_share_percent DECIMAL(5, 2) DEFAULT 50;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS current_balance DECIMAL(15, 2) DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_status TEXT DEFAULT 'active';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'low';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS risk_notes TEXT;

-- =====================================================
-- 12. ADD MISSING COLUMNS TO OPERATIONS TABLE
-- =====================================================

ALTER TABLE operations ADD COLUMN IF NOT EXISTS kpi JSONB;

-- =====================================================
-- 13. RLS POLICIES (Allow all for authenticated users)
-- =====================================================

ALTER TABLE contract_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Simple policies for development (allow all for authenticated)
CREATE POLICY IF NOT EXISTS "Allow all for authenticated" ON contract_assignments FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all for authenticated" ON client_credentials FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all for authenticated" ON client_history FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all for authenticated" ON payments FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all for authenticated" ON expenses FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all for authenticated" ON kpi_rules FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all for authenticated" ON monthly_performance FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all for authenticated" ON payroll_adjustments FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all for authenticated" ON audit_logs FOR ALL USING (true);

-- =====================================================
-- DONE! Restart your app after running this script.
-- =====================================================
