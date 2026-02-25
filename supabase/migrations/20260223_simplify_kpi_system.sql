-- Migration: Simplify KPI System
-- Date: 2026-02-23
-- Description: Clean up messy rules, introduce global rules, and update constraints.

-- 1. Update kpi_rules table
ALTER TABLE kpi_rules ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT false;

-- 2. Modify monthly_performance
-- A. Allow company_id to be NULL for global rules
ALTER TABLE monthly_performance ALTER COLUMN company_id DROP NOT EXISTS;

-- B. Update Unique Constraint
ALTER TABLE monthly_performance DROP CONSTRAINT IF EXISTS monthly_performance_month_company_id_employee_id_rule_id_key;
ALTER TABLE monthly_performance DROP CONSTRAINT IF EXISTS monthly_performance_month_employee_id_rule_id_company_id_key;

-- Note: In Postgres, multiple NULLs in a UNIQUE constraint are treated as distinct.
-- To allow only ONE global entry per rule/employee/month, we can use a partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_perf_unique_global 
ON monthly_performance (month, employee_id, rule_id) 
WHERE company_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_perf_unique_company 
ON monthly_performance (month, employee_id, rule_id, company_id) 
WHERE company_id IS NOT NULL;

-- 3. Cleanup old rules (Deactivate all first)
UPDATE kpi_rules SET is_active = false;

-- 4. Seed New Clean Rules
-- We'll use upsert logic to reuse IDs if possible (matching by name and role)
DO $$
DECLARE
    v_id UUID;
BEGIN
    -- GLOBAL RULES
    -- Attendance
    INSERT INTO kpi_rules (name, name_uz, role, reward_percent, penalty_percent, input_type, category, sort_order, is_global, is_active)
    VALUES ('attendance', 'Ishga kelib ketish (Keldi-ketdi)', 'accountant', 1.0, -1.0, 'checkbox', 'attendance', 1, true, true)
    ON CONFLICT (name, role) DO UPDATE SET is_active = true, is_global = true, reward_percent = 1.0, penalty_percent = -1.0;

    -- Telegram
    INSERT INTO kpi_rules (name, name_uz, role, reward_percent, penalty_percent, input_type, category, sort_order, is_global, is_active)
    VALUES ('telegram', 'Telegramda javob berish', 'accountant', 1.0, 0, 'checkbox', 'telegram', 2, true, true)
    ON CONFLICT (name, role) DO UPDATE SET is_active = true, is_global = true, reward_percent = 1.0, penalty_percent = 0;

    -- AUTOMATION RULES (Company Specific)
    -- 1C Baza
    INSERT INTO kpi_rules (name, name_uz, role, reward_percent, penalty_percent, input_type, category, sort_order, is_global, is_active)
    VALUES ('acc_1c_base', '1C Baza yuritish', 'accountant', 1.0, 0, 'checkbox', 'automation', 10, false, true)
    ON CONFLICT (name, role) DO UPDATE SET is_active = true, is_global = false, reward_percent = 1.0;

    -- Didox
    INSERT INTO kpi_rules (name, name_uz, role, reward_percent, penalty_percent, input_type, category, sort_order, is_global, is_active)
    VALUES ('acc_didox', 'Didox (Elektron hujjatlar)', 'accountant', 0.25, -0.25, 'checkbox', 'automation', 11, false, true)
    ON CONFLICT (name, role) DO UPDATE SET is_active = true, is_global = false, reward_percent = 0.25, penalty_percent = -0.25;

    -- Xatlar
    INSERT INTO kpi_rules (name, name_uz, role, reward_percent, penalty_percent, input_type, category, sort_order, is_global, is_active)
    VALUES ('acc_letters', 'Xatlar (E-imzo)', 'accountant', 0.25, -0.25, 'checkbox', 'automation', 12, false, true)
    ON CONFLICT (name, role) DO UPDATE SET is_active = true, is_global = false, reward_percent = 0.25, penalty_percent = -0.25;

    -- My Mehnat
    INSERT INTO kpi_rules (name, name_uz, role, reward_percent, penalty_percent, input_type, category, sort_order, is_global, is_active)
    VALUES ('acc_my_mehnat', 'My Mehnat (YMT)', 'accountant', 0.25, -0.25, 'checkbox', 'automation', 13, false, true)
    ON CONFLICT (name, role) DO UPDATE SET is_active = true, is_global = false, reward_percent = 0.25, penalty_percent = -0.25;

    -- Avtokameral
    INSERT INTO kpi_rules (name, name_uz, role, reward_percent, penalty_percent, input_type, category, sort_order, is_global, is_active)
    VALUES ('acc_auto_cameral', 'Avtokameral nazorat', 'accountant', 0.25, -0.25, 'checkbox', 'automation', 14, false, true)
    ON CONFLICT (name, role) DO UPDATE SET is_active = true, is_global = false, reward_percent = 0.25, penalty_percent = -0.25;

    -- Pul oqimlari
    INSERT INTO kpi_rules (name, name_uz, role, reward_percent, penalty_percent, input_type, category, sort_order, is_global, is_active)
    VALUES ('acc_cashflow', 'Pul oqimlari nazorati', 'accountant', 0.25, -0.25, 'checkbox', 'automation', 15, false, true)
    ON CONFLICT (name, role) DO UPDATE SET is_active = true, is_global = false, reward_percent = 0.25, penalty_percent = -0.25;

    -- Soliqlar
    INSERT INTO kpi_rules (name, name_uz, role, reward_percent, penalty_percent, input_type, category, sort_order, is_global, is_active)
    VALUES ('acc_tax', 'Chiqadigan soliqlar', 'accountant', 0.25, -0.25, 'checkbox', 'automation', 16, false, true)
    ON CONFLICT (name, role) DO UPDATE SET is_active = true, is_global = false, reward_percent = 0.25, penalty_percent = -0.25;

    -- Debitor/Kreditor
    INSERT INTO kpi_rules (name, name_uz, role, reward_percent, penalty_percent, input_type, category, sort_order, is_global, is_active)
    VALUES ('acc_debt', 'Debitor-kreditorlar', 'accountant', 0.25, -0.25, 'checkbox', 'automation', 17, false, true)
    ON CONFLICT (name, role) DO UPDATE SET is_active = true, is_global = false, reward_percent = 0.25, penalty_percent = -0.25;

    -- PnL
    INSERT INTO kpi_rules (name, name_uz, role, reward_percent, penalty_percent, input_type, category, sort_order, is_global, is_active)
    VALUES ('acc_pnl', 'Foyda va zarar hisoboti', 'accountant', 0.25, -0.25, 'checkbox', 'automation', 18, false, true)
    ON CONFLICT (name, role) DO UPDATE SET is_active = true, is_global = false, reward_percent = 0.25, penalty_percent = -0.25;

    -- Payroll
    INSERT INTO kpi_rules (name, name_uz, role, reward_percent, penalty_percent, input_type, category, sort_order, is_global, is_active)
    VALUES ('acc_payroll', 'Ish haqini hisoblash', 'accountant', 0.25, -0.25, 'checkbox', 'automation', 19, false, true)
    ON CONFLICT (name, role) DO UPDATE SET is_active = true, is_global = false, reward_percent = 0.25, penalty_percent = -0.25;

END $$;

-- 5. Final check: Delete rules that are NOT in our names list and NOT active
-- Optional: instead of delete, we keep them as is_active = false for historical data integrity.
