-- Migration: Create Employee Salaries
-- Date: 2026-02-25
-- Description: Create employee_salaries table to persist approved drafted salaries permanently.

CREATE TABLE IF NOT EXISTS employee_salaries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    month VARCHAR(7) NOT NULL, -- Format: YYYY-MM
    base_salary NUMERIC NOT NULL DEFAULT 0,
    kpi_bonus NUMERIC NOT NULL DEFAULT 0,
    kpi_penalty NUMERIC NOT NULL DEFAULT 0,
    total_salary NUMERIC NOT NULL DEFAULT 0,
    breakdown JSONB, -- Stored array of CompanyBreakdown
    is_approved BOOLEAN DEFAULT true,
    approved_by UUID REFERENCES profiles(id),
    approved_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(employee_id, month)
);

-- RLS
ALTER TABLE employee_salaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON employee_salaries
    FOR SELECT USING (true);

CREATE POLICY "Enable all for authenticated users" ON employee_salaries
    FOR ALL USING (auth.role() = 'authenticated');
