-- Create table for company-specific KPI rule overrides
CREATE TABLE IF NOT EXISTS public.company_kpi_rules (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES public.kpi_rules(id) ON DELETE CASCADE,
    reward_percent NUMERIC, -- Override value (can be null if only penalty is overridden, but usually set both)
    penalty_percent NUMERIC, -- Override value
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(company_id, rule_id)
);

-- RLS Policies
ALTER TABLE public.company_kpi_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all authenticated users" ON public.company_kpi_rules
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert/update/delete for admins and chief accountants" ON public.company_kpi_rules
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('super_admin', 'chief_accountant', 'admin')
        )
    );
