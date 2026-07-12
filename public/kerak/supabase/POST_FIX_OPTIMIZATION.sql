-- 1. CREATE MISSING ENUMS (SELF-CONTAINED & EXHAUSTIVE)
DO $$ BEGIN
    CREATE TYPE public.tax_regime AS ENUM ('vat', 'turnover', 'fixed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.stats_type AS ENUM ('1-KB', 'Micro', '1-Mehnat', 'Small');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.tax_type_v2 AS ENUM ('nds_profit', 'turnover', 'fixed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.server_info_type AS ENUM ('CR1', 'CR2', 'CR3', 'srv1c1', 'srv1c2', 'srv1c3', 'srv2');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.contract_role AS ENUM ('accountant', 'controller', 'bank_manager');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.salary_calculation_type AS ENUM ('percent', 'fixed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. DROP ALL TRIGGERS ON COMPANIES (TOTAL RESET)
DROP TRIGGER IF EXISTS trigger_log_company_changes ON companies;
DROP TRIGGER IF EXISTS trigger_validate_inn ON companies;
DROP TRIGGER IF EXISTS audit_companies ON companies;
DROP TRIGGER IF EXISTS update_companies_updated_at ON companies;
DROP TRIGGER IF EXISTS trigger_log_company_changes_v2 ON companies;
DROP TRIGGER IF EXISTS trigger_validate_inn_v2 ON companies;
DROP TRIGGER IF EXISTS update_companies_updated_at_v2 ON companies;

-- 3. DROP POTENTIALLY CONFLICTING POLICIES
DROP POLICY IF EXISTS "Profiles access policy" ON profiles;
DROP POLICY IF EXISTS "Profiles update policy" ON profiles;
DROP POLICY IF EXISTS "Companies select policy" ON companies;
DROP POLICY IF EXISTS "Companies update policy" ON companies;
DROP POLICY IF EXISTS "Companies insert policy" ON companies;
DROP POLICY IF EXISTS "Operations select policy" ON operations;
DROP POLICY IF EXISTS "Operations update policy" ON operations;
DROP POLICY IF EXISTS "Operations insert policy" ON operations;
DROP POLICY IF EXISTS "History select policy" ON client_history;
DROP POLICY IF EXISTS "Audit select policy" ON audit_logs;
DROP POLICY IF EXISTS "Documents access policy" ON documents;
DROP POLICY IF EXISTS "Documents upload policy" ON documents;
DROP POLICY IF EXISTS "KPI access policy" ON kpi_history;

-- 4. ENHANCED SECURITY DEFINER FUNCTIONS (RLS BYPASS)
CREATE OR REPLACE FUNCTION public.check_is_manager()
RETURNS BOOLEAN AS $$
DECLARE v_role public.user_role;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN v_role IN ('super_admin', 'manager');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.check_is_auditor()
RETURNS BOOLEAN AS $$
DECLARE v_role public.user_role;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN v_role IN ('super_admin', 'manager', 'auditor');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_access_company(c_id UUID)
RETURNS BOOLEAN AS $$
DECLARE v_is_auditor BOOLEAN; v_acc_id UUID;
BEGIN
  v_is_auditor := public.check_is_auditor();
  IF v_is_auditor THEN RETURN TRUE; END IF;
  SELECT accountant_id INTO v_acc_id FROM public.companies WHERE id = c_id;
  RETURN v_acc_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. RE-IMPLEMENT BUSINESS LOGIC AS SECURITY DEFINER (AVOIDS RECURSION)
CREATE OR REPLACE FUNCTION public.validate_unique_inn_v2()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.companies WHERE inn = NEW.inn AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)) THEN
        RAISE EXCEPTION 'Ushbu INN (% ) allaqachon mavjud!', NEW.inn;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.log_company_changes_v2()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.accountant_id IS DISTINCT FROM NEW.accountant_id OR 
      OLD.company_status IS DISTINCT FROM NEW.company_status OR
      OLD.risk_level IS DISTINCT FROM NEW.risk_level) THEN
      INSERT INTO client_history (company_id, change_type, field_name, old_value, new_value, changed_by)
      VALUES (NEW.id, 'batch_update', 'multiple', 'multi', 'multi', auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.update_updated_at_column_v2()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. APPLY ULTRA-FAST POLICIES
CREATE POLICY "Profiles access policy" ON profiles FOR SELECT USING (id = auth.uid() OR check_is_auditor());
CREATE POLICY "Profiles update policy" ON profiles FOR UPDATE USING (id = auth.uid() OR check_is_manager());
CREATE POLICY "Companies select policy" ON companies FOR SELECT USING (can_access_company(id));
CREATE POLICY "Companies update policy" ON companies FOR UPDATE USING (accountant_id = auth.uid() OR check_is_manager());
CREATE POLICY "Companies insert policy" ON companies FOR INSERT WITH CHECK (check_is_manager());
CREATE POLICY "Operations select policy" ON operations FOR SELECT USING (can_access_company(company_id));
CREATE POLICY "Operations update policy" ON operations FOR UPDATE USING (can_access_company(company_id));
CREATE POLICY "Operations insert policy" ON operations FOR INSERT WITH CHECK (can_access_company(company_id));
CREATE POLICY "History select policy" ON client_history FOR SELECT USING (can_access_company(company_id));
CREATE POLICY "Audit select policy" ON audit_logs FOR SELECT USING (check_is_manager());
CREATE POLICY "Documents access policy" ON documents FOR SELECT USING (can_access_company(company_id));
CREATE POLICY "Documents upload policy" ON documents FOR INSERT WITH CHECK (can_access_company(company_id));
CREATE POLICY "KPI access policy" ON kpi_history FOR SELECT USING (accountant_id = auth.uid() OR check_is_manager());

-- 7. RE-CREATE TRIGGERS (NOW WITH SECURITY DEFINER)
CREATE TRIGGER trigger_validate_inn_v2 BEFORE INSERT OR UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION validate_unique_inn_v2();
CREATE TRIGGER trigger_log_company_changes_v2 AFTER UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION log_company_changes_v2();
CREATE TRIGGER update_companies_updated_at_v2 BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column_v2();

-- 1. REDESIGN: ENUM TO TEXT (Avoids 22P01 and 55P04 errors)
ALTER TABLE public.companies ALTER COLUMN server_info TYPE TEXT;
ALTER TABLE public.contract_assignments ALTER COLUMN role TYPE TEXT;

-- 8. THE ATOMIC RPC (PERFECTION)
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
        (p_company->>'server_info')::TEXT, -- REDESIGN
        p_company->>'base_name_1c',
        COALESCE((p_company->>'kpi_enabled')::BOOLEAN, true),
        COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(p_company->'stat_reports') x), '{}'),
        COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(p_company->'service_scope') x), '{}'),
        COALESCE(p_company->'active_services', '[]'::jsonb),
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

    IF p_assignments IS NOT NULL AND jsonb_array_length(p_assignments) > 0 THEN
        DELETE FROM public.contract_assignments WHERE client_id = v_company_id;
        INSERT INTO public.contract_assignments (client_id, user_id, role, salary_type, salary_value, created_by)
        SELECT v_company_id, (elem->>'userId')::UUID, (elem->>'role')::TEXT, (elem->>'salaryType')::public.salary_calculation_type, (elem->>'salaryValue')::FLOAT, auth.uid() FROM jsonb_array_elements(p_assignments) AS elem WHERE elem->>'userId' IS NOT NULL;
    END IF;

    RETURN jsonb_build_object('success', true, 'company_id', v_company_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. INDEXES (FINAL PASS)
CREATE INDEX IF NOT EXISTS idx_companies_acc_id ON companies(accountant_id);
CREATE INDEX IF NOT EXISTS idx_client_history_company_id ON client_history(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record_id ON audit_logs(record_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_operations_company_id ON operations(company_id);
