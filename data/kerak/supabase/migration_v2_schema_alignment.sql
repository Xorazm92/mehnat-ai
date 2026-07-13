-- Migration V2: Schema Alignment for Accounting Firm Management System
-- Date: 2026-02-06
-- Focus: Multi-role assignments, 3-state KPI, and extended company fields

-- 1. ENUMS
DO $$ BEGIN
    CREATE TYPE tax_type_v2 AS ENUM ('nds_profit', 'turnover');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE server_info_type AS ENUM ('CR1', 'CR2', 'CR3');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

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

-- 2. PROFILES TABLE UPDATE
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- 3. COMPANIES TABLE UPDATE
ALTER TABLE companies ADD COLUMN IF NOT EXISTS internal_contractor TEXT; -- e.g., "ASOS BUXGALTERIYA"
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tax_type_new tax_type_v2;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS server_info server_info_type;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS base_name_1c TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS kpi_enabled BOOLEAN DEFAULT true;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stat_reports TEXT[]; -- Array of StatsType
ALTER TABLE companies ADD COLUMN IF NOT EXISTS service_scope TEXT[]; -- Array of ServiceScope

-- Data migration for tax regime if needed (mapping existing vat/turnover to new enum)
UPDATE companies SET tax_type_new = 'nds_profit' WHERE tax_regime = 'vat';
UPDATE companies SET tax_type_new = 'turnover' WHERE tax_regime = 'turnover';

-- Set unique constraint on INN
ALTER TABLE companies ADD CONSTRAINT unique_inn UNIQUE (inn);

-- 4. CONTRACT ASSIGNMENTS TABLE (The "Brain")
CREATE TABLE IF NOT EXISTS contract_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    role contract_role NOT NULL,
    salary_type salary_calculation_type NOT NULL DEFAULT 'percent',
    salary_value FLOAT NOT NULL DEFAULT 20.0, -- 20% or 500,000 so'm
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE, -- NULL means active
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_client ON contract_assignments(client_id);
CREATE INDEX IF NOT EXISTS idx_assignments_user ON contract_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_dates ON contract_assignments(start_date, end_date);

-- 5. KPI RULES UPDATE (3-State Logic)
-- We'll add weight and 3-state support to kpi_rules
ALTER TABLE kpi_rules ADD COLUMN IF NOT EXISTS weight_percent DECIMAL(5,2) DEFAULT 1.0;
-- The 'value' in performance will now be interpreted as -1, 0, or 1.

-- RLS for new table
ALTER TABLE contract_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View assignments" ON contract_assignments FOR SELECT USING (true);
CREATE POLICY "Manage assignments" ON contract_assignments FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'manager'))
);

-- Audit trigger for assignments
CREATE TRIGGER audit_contract_assignments AFTER INSERT OR UPDATE OR DELETE ON contract_assignments
  FOR EACH ROW EXECUTE FUNCTION create_audit_log();
