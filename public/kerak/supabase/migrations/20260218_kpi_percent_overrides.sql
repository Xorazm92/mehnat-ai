-- Adds per-company KPI percent overrides on monthly_performance

ALTER TABLE public.monthly_performance
  ADD COLUMN IF NOT EXISTS reward_percent_override NUMERIC,
  ADD COLUMN IF NOT EXISTS penalty_percent_override NUMERIC;

-- Update trigger to prefer overrides and normalize penalty sign
CREATE OR REPLACE FUNCTION calculate_performance_score()
RETURNS TRIGGER AS $$
DECLARE
  v_rule kpi_rules%ROWTYPE;
  v_reward NUMERIC;
  v_penalty NUMERIC;
BEGIN
  -- Get the rule
  SELECT * INTO v_rule FROM kpi_rules WHERE id = NEW.rule_id;

  v_reward := COALESCE(NEW.reward_percent_override, v_rule.reward_percent);
  v_penalty := COALESCE(NEW.penalty_percent_override, v_rule.penalty_percent);

  -- Calculate score based on value
  IF NEW.value > 0 THEN
    -- Positive: reward
    NEW.calculated_score := NEW.value * COALESCE(v_reward, 0);
  ELSIF NEW.value < 0 THEN
    -- Negative: penalty (value is already negative)
    NEW.calculated_score := ABS(NEW.value) * ABS(COALESCE(v_penalty, 0)) * -1;
  ELSE
    -- Zero: no effect
    NEW.calculated_score := 0;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
