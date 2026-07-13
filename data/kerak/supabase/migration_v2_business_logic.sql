-- Migration V2: Business Logic (Payroll & KPI)
-- Date: 2026-02-06

-- 1. UTILITY: Calculate days in month
CREATE OR REPLACE FUNCTION get_days_in_month(p_date DATE) 
RETURNS INTEGER AS $$
BEGIN
    RETURN EXTRACT(DAY FROM (date_trunc('month', p_date) + interval '1 month' - interval '1 day'))::INTEGER;
END;
$$ LANGUAGE plpgsql;

-- 2. UTILITY: Calculate active days in period
CREATE OR REPLACE FUNCTION get_active_days_in_month(p_start DATE, p_end DATE, p_month DATE)
RETURNS INTEGER AS $$
DECLARE
    v_month_start DATE := date_trunc('month', p_month)::DATE;
    v_month_end DATE := (date_trunc('month', p_month) + interval '1 month' - interval '1 day')::DATE;
    v_eff_start DATE;
    v_eff_end DATE;
BEGIN
    v_eff_start := GREATEST(v_month_start, p_start);
    v_eff_end := LEAST(v_month_end, COALESCE(p_end, v_month_end));
    
    IF v_eff_start <= v_eff_end THEN
        RETURN (v_eff_end - v_eff_start + 1);
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 3. PAYROLL ENGINE: Calculate Employee Salary
CREATE OR REPLACE FUNCTION calculate_employee_salary_v2(p_employee_id UUID, p_month DATE)
RETURNS TABLE (
  base_salary NUMERIC,
  kpi_bonus_total NUMERIC,
  kpi_penalty_total NUMERIC,
  adjustments NUMERIC,
  total_salary NUMERIC,
  details JSONB
) LANGUAGE plpgsql AS $$
DECLARE
    v_month_days INTEGER := get_days_in_month(p_month);
    v_base_salary NUMERIC := 0;
    v_kpi_bonus NUMERIC := 0;
    v_kpi_penalty NUMERIC := 0;
    v_adjustments NUMERIC := 0;
    v_total_salary NUMERIC := 0;
    v_details JSONB := '[]'::JSONB;
BEGIN
    -- A. Calculate Base Salary from Contract Assignments (Pro-rata)
    SELECT 
        COALESCE(SUM(
            CASE 
                WHEN ca.salary_type = 'fixed' THEN 
                    (ca.salary_value / v_month_days) * get_active_days_in_month(ca.start_date, ca.end_date, p_month)
                WHEN ca.salary_type = 'percent' THEN 
                    ((c.contract_amount * (ca.salary_value / 100)) / v_month_days) * get_active_days_in_month(ca.start_date, ca.end_date, p_month)
                ELSE 0
            END
        ), 0)
    INTO v_base_salary
    FROM contract_assignments ca
    JOIN companies c ON c.id = ca.client_id
    WHERE ca.user_id = p_employee_id
      AND ca.start_date <= (date_trunc('month', p_month) + interval '1 month' - interval '1 day')::DATE
      AND (ca.end_date IS NULL OR ca.end_date >= date_trunc('month', p_month)::DATE);

    -- B. Calculate KPI Bonuses/Penalties (Convert percents to money, only approved KPI)
    -- calculated_score is stored as percent, convert to monetary value
    SELECT 
        COALESCE(SUM(CASE WHEN mp.calculated_score > 0 THEN v_base_salary * (mp.calculated_score / 100) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN mp.calculated_score < 0 THEN v_base_salary * (mp.calculated_score / 100) ELSE 0 END), 0)
    INTO v_kpi_bonus, v_kpi_penalty
    FROM monthly_performance mp
    WHERE mp.employee_id = p_employee_id AND mp.month = date_trunc('month', p_month)::DATE
      AND mp.status = 'approved';

    -- C. Adjustments (Manual Bonus/Fine)
    SELECT COALESCE(SUM(amount), 0)
    INTO v_adjustments
    FROM payroll_adjustments
    WHERE employee_id = p_employee_id AND month = date_trunc('month', p_month)::DATE AND is_approved = true;

    -- D. Final Result
    v_total_salary := v_base_salary + v_kpi_bonus + v_kpi_penalty + v_adjustments;

    RETURN QUERY SELECT 
        v_base_salary::NUMERIC, 
        v_kpi_bonus::NUMERIC, 
        v_kpi_penalty::NUMERIC, 
        v_adjustments::NUMERIC, 
        v_total_salary::NUMERIC,
        v_details;
END;
$$;

-- 4. SUPER ADMIN PAYROLL: Yorqinoy Opa (7%)
CREATE OR REPLACE FUNCTION calculate_super_admin_payroll(p_month DATE)
RETURNS NUMERIC AS $$
DECLARE
    v_total_contracts NUMERIC := 0;
BEGIN
    -- Sum of all active contract amounts in that month
    SELECT SUM(contract_amount)
    INTO v_total_contracts
    FROM companies
    WHERE is_active = true 
      AND created_at <= (date_trunc('month', p_month) + interval '1 month' - interval '1 day')::TIMESTAMPTZ;

    RETURN COALESCE(v_total_contracts * 0.07, 0);
END;
$$ LANGUAGE plpgsql;

-- 5. AUTOMATION: Deadline Control (Auto-KPI)
-- This function checks if reports are submitted by deadline.
-- If not, it sets KPI = -1 for the responsible accountant.
CREATE OR REPLACE FUNCTION check_deadlines_autokpi()
RETURNS void AS $$
DECLARE
    v_op RECORD;
    v_rule_id UUID;
BEGIN
    -- Get the KPI rule for reports/tax (example name)
    SELECT id INTO v_rule_id FROM kpi_rules WHERE name = 'acc_tax_info' LIMIT 1;
    
    FOR v_op IN 
        SELECT o.company_id, c.accountant_id, o.period
        FROM operations o
        JOIN companies c ON c.id = o.company_id
        WHERE (o.deadline_profit_tax < CURRENT_DATE AND o.profit_tax_status NOT IN ('accepted', 'submitted'))
           OR (o.deadline_stats < CURRENT_DATE AND o.stats_status NOT IN ('accepted', 'submitted'))
    LOOP
        IF v_op.accountant_id IS NOT NULL AND v_rule_id IS NOT NULL THEN
            INSERT INTO monthly_performance (month, company_id, employee_id, rule_id, value, notes)
            VALUES (
                date_trunc('month', CURRENT_DATE)::DATE, 
                v_op.company_id, 
                v_op.accountant_id, 
                v_rule_id, 
                -1, 
                'Avtomatik: Muddat o''tib ketgan (' || v_op.period || ')'
            )
            ON CONFLICT (month, company_id, employee_id, rule_id) 
            DO UPDATE SET value = -1, notes = EXCLUDED.notes;
        END IF;
    LOOP;
END;
$$ LANGUAGE plpgsql;

-- 6. VALIDATION: Unique INN check before insert
CREATE OR REPLACE FUNCTION validate_unique_inn()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM companies WHERE inn = NEW.inn AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)) THEN
        RAISE EXCEPTION 'Ushbu INN (% ) allaqachon mavjud!', NEW.inn;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_inn
    BEFORE INSERT OR UPDATE ON companies
    FOR EACH ROW
    EXECUTE FUNCTION validate_unique_inn();
