-- =====================================================
-- PERFECT SCHEMA SYNC: COMPANIES TABLE
-- This script ensures all columns expected by the frontend 
-- exist in the 'companies' table to prevent PGRST204 errors.
-- =====================================================

DO $$ 
BEGIN
    -- 1. Assignment UUID Columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='chief_accountant_id') THEN
        ALTER TABLE public.companies ADD COLUMN chief_accountant_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='supervisor_id') THEN
        ALTER TABLE public.companies ADD COLUMN supervisor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='bank_client_id') THEN
        ALTER TABLE public.companies ADD COLUMN bank_client_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
    END IF;

    -- 2. Percentage and Sum Columns (NUMERIC)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='chief_accountant_sum') THEN
        ALTER TABLE public.companies ADD COLUMN chief_accountant_sum NUMERIC DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='chief_accountant_perc') THEN
        ALTER TABLE public.companies ADD COLUMN chief_accountant_perc NUMERIC DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='supervisor_perc') THEN
        ALTER TABLE public.companies ADD COLUMN supervisor_perc NUMERIC DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='bank_client_sum') THEN
        ALTER TABLE public.companies ADD COLUMN bank_client_sum NUMERIC DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='accountant_perc') THEN
        ALTER TABLE public.companies ADD COLUMN accountant_perc NUMERIC DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='contract_amount') THEN
        ALTER TABLE public.companies ADD COLUMN contract_amount NUMERIC DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='firma_share_percent') THEN
        ALTER TABLE public.companies ADD COLUMN firma_share_percent NUMERIC DEFAULT 50;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='current_balance') THEN
        ALTER TABLE public.companies ADD COLUMN current_balance NUMERIC DEFAULT 0;
    END IF;

    -- 3. Boolean Metadata
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='it_park_resident') THEN
        ALTER TABLE public.companies ADD COLUMN it_park_resident BOOLEAN DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='kpi_enabled') THEN
        ALTER TABLE public.companies ADD COLUMN kpi_enabled BOOLEAN DEFAULT true;
    END IF;

    -- 4. Text/Metadata Columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='brand_name') THEN
        ALTER TABLE public.companies ADD COLUMN brand_name TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='director_name') THEN
        ALTER TABLE public.companies ADD COLUMN director_name TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='director_phone') THEN
        ALTER TABLE public.companies ADD COLUMN director_phone TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='legal_address') THEN
        ALTER TABLE public.companies ADD COLUMN legal_address TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='founder_name') THEN
        ALTER TABLE public.companies ADD COLUMN founder_name TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='logo_url') THEN
        ALTER TABLE public.companies ADD COLUMN logo_url TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='certificate_file_path') THEN
        ALTER TABLE public.companies ADD COLUMN certificate_file_path TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='charter_file_path') THEN
        ALTER TABLE public.companies ADD COLUMN charter_file_path TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='one_c_location') THEN
        ALTER TABLE public.companies ADD COLUMN one_c_location TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='contract_number') THEN
        ALTER TABLE public.companies ADD COLUMN contract_number TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='company_status') THEN
        ALTER TABLE public.companies ADD COLUMN company_status TEXT DEFAULT 'active';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='risk_level') THEN
        ALTER TABLE public.companies ADD COLUMN risk_level TEXT DEFAULT 'low';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='risk_notes') THEN
        ALTER TABLE public.companies ADD COLUMN risk_notes TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='tax_type_new') THEN
        ALTER TABLE public.companies ADD COLUMN tax_type_new TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='server_info') THEN
        ALTER TABLE public.companies ADD COLUMN server_info TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='base_name_1c') THEN
        ALTER TABLE public.companies ADD COLUMN base_name_1c TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='accountant_name') THEN
        ALTER TABLE public.companies ADD COLUMN accountant_name TEXT;
    END IF;

    -- 5. Special Types
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='payment_day') THEN
        ALTER TABLE public.companies ADD COLUMN payment_day INTEGER DEFAULT 5;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='vat_certificate_date') THEN
        ALTER TABLE public.companies ADD COLUMN vat_certificate_date DATE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='contract_date') THEN
        ALTER TABLE public.companies ADD COLUMN contract_date DATE;
    END IF;

    -- 6. Array Columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='active_services') THEN
        ALTER TABLE public.companies ADD COLUMN active_services TEXT[] DEFAULT '{}';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='stat_reports') THEN
        ALTER TABLE public.companies ADD COLUMN stat_reports TEXT[] DEFAULT '{}';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='service_scope') THEN
        ALTER TABLE public.companies ADD COLUMN service_scope TEXT[] DEFAULT '{}';
    END IF;

END $$;
