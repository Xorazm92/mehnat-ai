-- Update calculate_employee_salary to use client_assignments history
CREATE OR REPLACE FUNCTION calculate_employee_salary(p_employee_id UUID, p_month DATE)
RETURNS TABLE (
  base_salary NUMERIC,
  kpi_bonus NUMERIC,
  kpi_penalty NUMERIC,
  adjustments NUMERIC,
  total_salary NUMERIC,
  details JSONB
) LANGUAGE plpgsql AS $$
DECLARE
  v_base_salary NUMERIC := 0;
  v_kpi_bonus NUMERIC := 0;
  v_kpi_penalty NUMERIC := 0;
  v_adjustments NUMERIC := 0;
  v_total_salary NUMERIC := 0;
  v_start_date DATE := p_month; -- First day of month
  v_end_date DATE := (p_month + INTERVAL '1 month' - INTERVAL '1 day')::DATE; -- Last day
BEGIN
  -- 1. Base Salary from Assigned Companies (Historical from client_assignments)
  -- We sum up contract_amount * (percent / 100) for all companies where this user 
  -- was the ACTIVE (or assigned) person during that month.
  -- Logic: Intersecting time range [start_date, end_date] with [MonthStart, MonthEnd]
  
  SELECT COALESCE(SUM(
    CASE 
      WHEN ca.role_type = 'accountant' THEN c.contract_amount * (c.accountant_perc / 100)
      WHEN ca.role_type = 'supervisor' THEN c.contract_amount * (c.supervisor_perc / 100)
      WHEN ca.role_type = 'bank_manager' THEN c.bank_client_sum
      ELSE 0
    END
  ), 0)
  INTO v_base_salary
  FROM client_assignments ca
  JOIN companies c ON c.id = ca.client_id
  WHERE ca.user_id = p_employee_id
    AND ca.start_date <= v_end_date
    AND (ca.end_date IS NULL OR ca.end_date >= v_start_date)
    AND ca.status = 'active';

  -- 2. KPI Bonus/Penalty (From monthly_performance)
  -- These are already linked to employee_id in the table.
  SELECT 
    COALESCE(SUM(CASE WHEN calculated_score > 0 THEN calculated_score ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN calculated_score < 0 THEN calculated_score ELSE 0 END), 0)
  INTO v_kpi_bonus, v_kpi_penalty
  FROM monthly_performance
  WHERE employee_id = p_employee_id AND month = p_month;

  -- 3. Adjustments
  SELECT COALESCE(SUM(amount), 0)
  INTO v_adjustments
  FROM payroll_adjustments
  WHERE employee_id = p_employee_id AND month = p_month AND is_approved = true;

  -- Total
  v_total_salary := v_base_salary + v_kpi_bonus + v_kpi_penalty + v_adjustments;

  RETURN QUERY SELECT 
    v_base_salary, v_kpi_bonus, v_kpi_penalty, v_adjustments, v_total_salary, '[]'::JSONB;
END;
$$;
