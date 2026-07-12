-- Update check_is_manager() to include chief_accountant
CREATE OR REPLACE FUNCTION public.check_is_manager()
RETURNS BOOLEAN AS $$
DECLARE v_role TEXT;
BEGIN
  SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN v_role IN ('super_admin', 'manager', 'chief_accountant');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update payments RLS
DROP POLICY IF EXISTS "Admins and managers can insert/update payments" ON payments;
CREATE POLICY "Admins and managers can insert/update payments"
  ON payments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role::TEXT IN ('super_admin', 'manager', 'chief_accountant')
    )
  );

DROP POLICY IF EXISTS "Admins and managers can view all payments" ON payments;
CREATE POLICY "Admins and managers can view all payments"
  ON payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role::TEXT IN ('super_admin', 'manager', 'chief_accountant')
    )
  );

-- Update expenses RLS
DROP POLICY IF EXISTS "Admins and managers can insert/update expenses" ON expenses;
CREATE POLICY "Admins and managers can insert/update expenses"
  ON expenses FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role::TEXT IN ('super_admin', 'manager', 'chief_accountant')
    )
  );

DROP POLICY IF EXISTS "Admins and managers can view all expenses" ON expenses;
CREATE POLICY "Admins and managers can view all expenses"
  ON expenses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role::TEXT IN ('super_admin', 'manager', 'chief_accountant')
    )
  );

-- Update upsert_company_perfect check
CREATE OR REPLACE FUNCTION public.upsert_company_perfect(
    p_company jsonb,
    p_assignments jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
AS $$
DECLARE
    v_company_id UUID;
    v_is_manager BOOLEAN;
BEGIN
    -- This now includes chief_accountant due to check_is_manager() update
    v_is_manager := public.check_is_manager(); 
    IF NOT v_is_manager THEN
        RAISE EXCEPTION 'Access Denied: Only managers can perform this operation.';
    END IF;

    v_company_id := (p_company->>'id')::UUID;

    INSERT INTO public.companies (
        id, name, inn, tax_regime, stats_type, department, accountant_id, 
        login, password, accountant_name, notes, is_active,
        brand_name, director_name, director_phone, legal_address, founder_name,
        vat_certificate_date, has_land_tax, has_water_tax, has_property_tax,
        has_excise_tax, has_auction_tax, one_c_status, one_c_location,
        contract_number, contract_date, payment_day, firma_share_percent,
        current_balance, company_status, risk_level, risk_notes,
        internal_contractor, tax_type_new, server_info, base_name_1c, kpi_enabled,
        stat_reports, service_scope, active_services, updated_at, updated_by
    )
    VALUES (
        v_company_id,
        p_company->>'name',
        p_company->>'inn',
        (p_company->>'tax_regime')::public.tax_regime,
        (p_company->>'stats_type')::public.stats_type,
        p_company->>'department',
        (p_company->>'accountant_id')::UUID,
        p_company->>'login',
        p_company->>'password',
        p_company->>'accountant_name',
        p_company->>'notes',
        COALESCE((p_company->>'is_active')::BOOLEAN, true),
        p_company->>'brand_name',
        p_company->>'director_name',
        p_company->>'director_phone',
        p_company->>'legal_address',
        p_company->>'founder_name',
        (p_company->>'vat_certificate_date')::DATE,
        COALESCE((p_company->>'has_land_tax')::BOOLEAN, false),
        COALESCE((p_company->>'has_water_tax')::BOOLEAN, false),
        COALESCE((p_company->>'has_property_tax')::BOOLEAN, false),
        COALESCE((p_company->>'has_excise_tax')::BOOLEAN, false),
        COALESCE((p_company->>'has_auction_tax')::BOOLEAN, false),
        p_company->>'one_c_status',
        p_company->>'one_c_location',
        p_company->>'contract_number',
        (p_company->>'contract_date')::DATE,
        COALESCE((p_company->>'payment_day')::INTEGER, 5),
        COALESCE((p_company->>'firma_share_percent')::DECIMAL, 50.00),
        COALESCE((p_company->>'current_balance')::DECIMAL, 0),
        COALESCE(p_company->>'company_status', 'active'),
        COALESCE(p_company->>'risk_level', 'low'),
        p_company->>'risk_notes',
        p_company->>'internal_contractor',
        (p_company->>'tax_type_new')::public.tax_type_v2,
        p_company->>'server_info',
        p_company->>'base_name_1c',
        COALESCE((p_company->>'kpi_enabled')::BOOLEAN, true),
        (SELECT ARRAY(SELECT jsonb_array_elements_text(p_company->'stat_reports'))),
        (SELECT ARRAY(SELECT jsonb_array_elements_text(p_company->'service_scope'))),
        (SELECT ARRAY(SELECT jsonb_array_elements_text(p_company->'active_services'))),
        NOW(),
        auth.uid()
    )
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        inn = EXCLUDED.inn,
        tax_regime = EXCLUDED.tax_regime,
        stats_type = EXCLUDED.stats_type,
        department = EXCLUDED.department,
        accountant_id = EXCLUDED.accountant_id,
        login = EXCLUDED.login,
        password = EXCLUDED.password,
        accountant_name = EXCLUDED.accountant_name,
        notes = EXCLUDED.notes,
        is_active = EXCLUDED.is_active,
        brand_name = EXCLUDED.brand_name,
        director_name = EXCLUDED.director_name,
        director_phone = EXCLUDED.director_phone,
        legal_address = EXCLUDED.legal_address,
        founder_name = EXCLUDED.founder_name,
        vat_certificate_date = EXCLUDED.vat_certificate_date,
        has_land_tax = EXCLUDED.has_land_tax,
        has_water_tax = EXCLUDED.has_water_tax,
        has_property_tax = EXCLUDED.has_property_tax,
        has_excise_tax = EXCLUDED.has_excise_tax,
        has_auction_tax = EXCLUDED.has_auction_tax,
        one_c_status = EXCLUDED.one_c_status,
        one_c_location = EXCLUDED.one_c_location,
        contract_number = EXCLUDED.contract_number,
        contract_date = EXCLUDED.contract_date,
        payment_day = EXCLUDED.payment_day,
        firma_share_percent = EXCLUDED.firma_share_percent,
        current_balance = EXCLUDED.current_balance,
        company_status = EXCLUDED.company_status,
        risk_level = EXCLUDED.risk_level,
        risk_notes = EXCLUDED.risk_notes,
        internal_contractor = EXCLUDED.internal_contractor,
        tax_type_new = EXCLUDED.tax_type_new,
        server_info = EXCLUDED.server_info,
        base_name_1c = EXCLUDED.base_name_1c,
        kpi_enabled = EXCLUDED.kpi_enabled,
        stat_reports = EXCLUDED.stat_reports,
        service_scope = EXCLUDED.service_scope,
        active_services = EXCLUDED.active_services,
        updated_at = NOW(),
        updated_by = auth.uid();

    -- Assignments handling (unchanged logic)
    IF p_assignments IS NOT NULL AND jsonb_array_length(p_assignments) \> 0 THEN
        UPDATE public.contract_assignments SET is_active = false WHERE client_id = v_company_id;
        INSERT INTO public.contract_assignments (client_id, user_id, role, salary_type, salary_value, is_active)
        SELECT 
            v_company_id,
            (a-\>\>'userId')::UUID,
            a-\>\>'role',
            (a-\>\>'salaryType')::public.salary_calculation_type,
            (a-\>\>'salaryValue')::DECIMAL,
            true
        FROM jsonb_array_elements(p_assignments) AS a;
    END IF;

    RETURN p_company;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
