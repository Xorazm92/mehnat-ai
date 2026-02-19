-- =====================================================
-- AVTOMATIK KPI TIZIMI — MIGRATION
-- =====================================================
-- Maqsad: "Oylik hisoblashda inson faktorini 0 ga tushirish"
-- =====================================================

-- =====================================================
-- A. KPI_RULES — Dinamik Qoidalar Jadvali
-- Tizim qanday ishlashini belgilovchi "Qonunlar kitobi"
-- =====================================================

CREATE TABLE IF NOT EXISTS kpi_rules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Identifikatsiya
    name TEXT NOT NULL,                    -- Internal name: "telegram_response"
    name_uz TEXT NOT NULL,                 -- O'zbekcha: "Telegramda javob"
    description TEXT,                      -- Izoh
    
    -- Kimga tegishli
    role TEXT NOT NULL CHECK (role IN ('accountant', 'bank_client', 'supervisor')),
    
    -- Foizlar (Dinamik - kodda hardcode qilinmagan)
    reward_percent DECIMAL(5,2) DEFAULT 0,    -- Bonus: +1.0%
    penalty_percent DECIMAL(5,2) DEFAULT 0,   -- Jarima: -0.5%
    
    -- Input turi
    input_type TEXT NOT NULL DEFAULT 'checkbox' 
        CHECK (input_type IN ('checkbox', 'counter', 'number', 'rating')),
    
    -- Kategoriya (UI da guruhlash uchun)
    category TEXT DEFAULT 'general',  -- 'attendance', 'telegram', 'reports', 'other'
    
    -- Tartib va holat
    sort_order INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT true,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_kpi_rules_role ON kpi_rules(role);
CREATE INDEX IF NOT EXISTS idx_kpi_rules_category ON kpi_rules(category);
CREATE INDEX IF NOT EXISTS idx_kpi_rules_active ON kpi_rules(is_active);

-- RLS
ALTER TABLE kpi_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can view active KPI rules" ON kpi_rules;
CREATE POLICY "Everyone can view active KPI rules"
    ON kpi_rules FOR SELECT
    USING (is_active = true OR EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'manager')
    ));

DROP POLICY IF EXISTS "Only admins can manage KPI rules" ON kpi_rules;
CREATE POLICY "Only admins can manage KPI rules"
    ON kpi_rules FOR ALL
    USING (EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'manager')
    ));

-- =====================================================
-- B. MONTHLY_PERFORMANCE — Oylik Natijalar Jurnali
-- Har oy har bir firma va xodim kesimida to'ldiriladigan
-- =====================================================

CREATE TABLE IF NOT EXISTS monthly_performance (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Vaqt va boglanishlar
    month DATE NOT NULL,                   -- Oy boshi: '2026-02-01'
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    employee_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    rule_id UUID REFERENCES kpi_rules(id) ON DELETE CASCADE NOT NULL,
    
    -- Qiymat va hisob
    value DECIMAL(10,2) NOT NULL DEFAULT 0,  -- 1=Ha, 0=Yo'q, 5=5 ta kechikish
    calculated_score DECIMAL(10,4) DEFAULT 0, -- Avtomat: value * percent
    
    -- Izoh va sabab
    notes TEXT,
    change_reason TEXT,                    -- Agar o'zgartirilsa, sabab
    
    -- Audit
    recorded_by UUID REFERENCES profiles(id),
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint
    UNIQUE(month, company_id, employee_id, rule_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_monthly_perf_month ON monthly_performance(month);
CREATE INDEX IF NOT EXISTS idx_monthly_perf_company ON monthly_performance(company_id);
CREATE INDEX IF NOT EXISTS idx_monthly_perf_employee ON monthly_performance(employee_id);
CREATE INDEX IF NOT EXISTS idx_monthly_perf_rule ON monthly_performance(rule_id);

-- RLS
ALTER TABLE monthly_performance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view performance of their companies" ON monthly_performance;
CREATE POLICY "Users can view performance of their companies"
    ON monthly_performance FOR SELECT
    USING (
        employee_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM companies 
            WHERE companies.id = monthly_performance.company_id
            AND (
                companies.accountant_id = auth.uid()
                OR companies.bank_client_id = auth.uid()
                OR companies.supervisor_id = auth.uid()
            )
        )
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'manager', 'auditor')
        )
    );

DROP POLICY IF EXISTS "Supervisors and admins can record performance" ON monthly_performance;
CREATE POLICY "Supervisors and admins can record performance"
    ON monthly_performance FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role IN ('super_admin', 'manager', 'auditor')
        )
        OR EXISTS (
            SELECT 1 FROM companies 
            WHERE companies.id = monthly_performance.company_id
            AND companies.supervisor_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Supervisors and admins can update performance" ON monthly_performance;
CREATE POLICY "Supervisors and admins can update performance"
    ON monthly_performance FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role IN ('super_admin', 'manager')
        )
    );

-- =====================================================
-- C. PAYROLL_ADJUSTMENTS — Qo'lda To'lovlar
-- Rahbar tomonidan qo'shiladigan bonus/avans/jarima
-- =====================================================

CREATE TABLE IF NOT EXISTS payroll_adjustments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Vaqt va xodim
    month DATE NOT NULL,
    employee_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    
    -- Turi va summa
    adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('bonus', 'avans', 'jarima', 'manual', 'other')),
    amount DECIMAL(12,2) NOT NULL,         -- Musbat yoki manfiy
    
    -- Izoh
    reason TEXT NOT NULL,
    
    -- Tasdiqlash
    approved_by UUID REFERENCES profiles(id),
    approved_at TIMESTAMPTZ,
    is_approved BOOLEAN DEFAULT false,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payroll_adj_month ON payroll_adjustments(month);
CREATE INDEX IF NOT EXISTS idx_payroll_adj_employee ON payroll_adjustments(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_adj_type ON payroll_adjustments(adjustment_type);

-- RLS
ALTER TABLE payroll_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees can view their own adjustments" ON payroll_adjustments;
CREATE POLICY "Employees can view their own adjustments"
    ON payroll_adjustments FOR SELECT
    USING (
        employee_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'manager')
        )
    );

DROP POLICY IF EXISTS "Only admins can manage adjustments" ON payroll_adjustments;
CREATE POLICY "Only admins can manage adjustments"
    ON payroll_adjustments FOR ALL
    USING (EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'manager')
    ));

-- =====================================================
-- D. PERFORMANCE_HISTORY — Tarixiy O'zgarishlar
-- Agar nazoratchi bahoni o'zgartirsa, log saqlanadi
-- =====================================================

CREATE TABLE IF NOT EXISTS performance_change_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    performance_id UUID REFERENCES monthly_performance(id) ON DELETE CASCADE NOT NULL,
    
    old_value DECIMAL(10,2),
    new_value DECIMAL(10,2),
    change_reason TEXT NOT NULL,          -- "Sabab yozing" majburiy
    
    changed_by UUID REFERENCES profiles(id) NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_perf_change_log ON performance_change_log(performance_id);

-- RLS
ALTER TABLE performance_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view change logs" ON performance_change_log;
CREATE POLICY "Admins can view change logs"
    ON performance_change_log FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'manager', 'auditor')
    ));

-- =====================================================
-- E. VIEW: employee_monthly_summary
-- Xodimning oylik umumiy natijasi
-- =====================================================

CREATE OR REPLACE VIEW employee_monthly_summary AS
SELECT 
    mp.month,
    mp.employee_id,
    p.full_name as employee_name,
    p.role as employee_role,
    COUNT(DISTINCT mp.company_id) as company_count,
    SUM(mp.calculated_score) as total_kpi_score,
    COUNT(DISTINCT mp.rule_id) as rules_evaluated,
    (
        SELECT COALESCE(SUM(pa.amount), 0)
        FROM payroll_adjustments pa
        WHERE pa.employee_id = mp.employee_id 
        AND pa.month = mp.month
        AND pa.is_approved = true
    ) as total_adjustments
FROM monthly_performance mp
JOIN profiles p ON p.id = mp.employee_id
GROUP BY mp.month, mp.employee_id, p.full_name, p.role;

-- =====================================================
-- F. TRIGGER: Auto-calculate score on insert/update
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_performance_score()
RETURNS TRIGGER AS $$
DECLARE
    v_rule kpi_rules%ROWTYPE;
BEGIN
    -- Get the rule
    SELECT * INTO v_rule FROM kpi_rules WHERE id = NEW.rule_id;
    
    -- Calculate score based on value
    IF NEW.value > 0 THEN
        -- Positive: reward
        NEW.calculated_score := NEW.value * v_rule.reward_percent;
    ELSIF NEW.value < 0 THEN
        -- Negative: penalty (value is already negative)
        NEW.calculated_score := ABS(NEW.value) * v_rule.penalty_percent * -1;
    ELSE
        -- Zero: no effect
        NEW.calculated_score := 0;
    END IF;
    
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_score
    BEFORE INSERT OR UPDATE ON monthly_performance
    FOR EACH ROW
    EXECUTE FUNCTION calculate_performance_score();

-- =====================================================
-- G. FUNCTION: Calculate total salary for employee
-- =====================================================

DROP FUNCTION IF EXISTS calculate_employee_salary(uuid,date);
CREATE OR REPLACE FUNCTION calculate_employee_salary(
    p_employee_id UUID,
    p_month DATE
)
RETURNS TABLE (
    base_salary DECIMAL(12,2),
    kpi_bonus DECIMAL(12,2),
    kpi_penalty DECIMAL(12,2),
    adjustments DECIMAL(12,2),
    total_salary DECIMAL(12,2)
) AS $$
DECLARE
    v_base DECIMAL(12,2) := 0;
    v_bonus DECIMAL(12,2) := 0;
    v_penalty DECIMAL(12,2) := 0;
    v_adj DECIMAL(12,2) := 0;
BEGIN
    -- Calculate base from all assigned companies
    SELECT COALESCE(SUM(
        CASE 
            WHEN c.accountant_id = p_employee_id THEN c.contract_amount * COALESCE(c.accountant_perc, 20) / 100
            WHEN c.bank_client_id = p_employee_id THEN COALESCE(c.bank_client_sum, c.contract_amount * 5 / 100)
            WHEN c.supervisor_id = p_employee_id THEN c.contract_amount * COALESCE(c.supervisor_perc, 2.5) / 100
            ELSE 0
        END
    ), 0) INTO v_base
    FROM companies c
    WHERE c.is_active = true
    AND (c.accountant_id = p_employee_id OR c.bank_client_id = p_employee_id OR c.supervisor_id = p_employee_id);
    
    -- Calculate KPI bonuses and penalties
    SELECT 
        COALESCE(SUM(CASE WHEN calculated_score > 0 THEN calculated_score ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN calculated_score < 0 THEN calculated_score ELSE 0 END), 0)
    INTO v_bonus, v_penalty
    FROM monthly_performance
    WHERE employee_id = p_employee_id AND month = p_month;
    
    -- Get approved adjustments
    SELECT COALESCE(SUM(amount), 0) INTO v_adj
    FROM payroll_adjustments
    WHERE employee_id = p_employee_id AND month = p_month AND is_approved = true;
    
    -- Return results
    base_salary := v_base;
    kpi_bonus := v_base * v_bonus / 100;  -- Convert percent to amount
    kpi_penalty := v_base * v_penalty / 100;
    adjustments := v_adj;
    total_salary := v_base + (v_base * v_bonus / 100) + (v_base * v_penalty / 100) + v_adj;
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- H. DEFAULT KPI RULES (14 ta standart qoida)
-- =====================================================

INSERT INTO kpi_rules (name, name_uz, role, reward_percent, penalty_percent, input_type, category, sort_order) VALUES
-- Bank Klient qoidalari
('bank_attendance', 'Ishga kelish/ketish', 'bank_client', 1.00, -1.00, 'checkbox', 'manual', 1),
('bank_telegram_ok', 'Telegramda javob berish', 'bank_client', 1.00, 0, 'checkbox', 'manual', 2),
('bank_telegram_missed', 'Telegram kechikish', 'bank_client', 0, -0.50, 'counter', 'manual', 3),

-- Nazoratchi qoidalari
('supervisor_attendance', 'Ishga kelish/ketish', 'supervisor', 0.50, -0.50, 'checkbox', 'manual', 10),

-- Buxgalter qoidalari
('acc_attendance', 'Ishga kelish/ketish', 'accountant', 1.00, -1.00, 'checkbox', 'manual', 19),
('acc_telegram_ok', 'Telegramda javob berish', 'accountant', 1.00, 0, 'checkbox', 'manual', 20),
('acc_telegram_missed', 'Telegram kechikish (soni)', 'accountant', 0, -0.50, 'counter', 'manual', 21),
('acc_1c_base', '1C Baza yuritish', 'accountant', 1.00, 0, 'checkbox', 'automation', 22),
('acc_didox', 'Didox nazorati', 'accountant', 0.25, -0.25, 'checkbox', 'automation', 23),
('acc_letters', 'E-imzo (Xatlar)', 'accountant', 0.25, -0.25, 'checkbox', 'automation', 24),
('acc_my_mehnat', 'my.mehnat.uz', 'accountant', 0.25, -0.25, 'checkbox', 'automation', 25),
('acc_auto_cameral', 'Avtokameral', 'accountant', 0.25, -0.25, 'checkbox', 'automation', 26),
('acc_cashflow', 'Pul oqimi (Cashflow)', 'accountant', 0.20, -0.20, 'checkbox', 'automation', 27),
('acc_tax_info', 'Soliq ma''lumoti', 'accountant', 0.20, -0.20, 'checkbox', 'automation', 28),
('acc_payroll', 'Oylik hisoboti', 'accountant', 0.20, -0.20, 'checkbox', 'automation', 29),
('acc_debt', 'Debitorlar nazorati', 'accountant', 0.20, -0.20, 'checkbox', 'automation', 30),
('acc_pnl', 'Moliyaviy natija (F&Z)', 'accountant', 0.20, -0.20, 'checkbox', 'automation', 31)
ON CONFLICT DO NOTHING;

-- Update categories for existing rules to match new structure
UPDATE kpi_rules SET category = 'manual' WHERE name IN ('bank_attendance', 'bank_telegram_ok', 'bank_telegram_missed', 'supervisor_attendance', 'acc_telegram_ok', 'acc_telegram_missed');
UPDATE kpi_rules SET category = 'automation' WHERE name IN ('acc_1c_base', 'acc_didox', 'acc_letters', 'acc_my_mehnat', 'acc_auto_cameral', 'acc_cashflow', 'acc_tax_info', 'acc_payroll', 'acc_debt', 'acc_pnl');

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE kpi_rules IS 'Dinamik KPI qoidalari - foizlarni o''zgartirish oson';
COMMENT ON TABLE monthly_performance IS 'Oylik xodim baholash jurnali';
COMMENT ON TABLE payroll_adjustments IS 'Qo''lda bonus/avans/jarima';
COMMENT ON TABLE performance_change_log IS 'Baholash o''zgarishlari tarixi (korrupsiya oldini olish)';
COMMENT ON VIEW employee_monthly_summary IS 'Xodimning oylik umumiy natijasi';
COMMENT ON FUNCTION calculate_employee_salary IS 'Xodim oyligini avtomatik hisoblash';
