-- ASOS Accounting Manager - Supabase Database Schema
-- Complete schema with RBAC, KPI tracking, and audit capabilities

-- =====================================================
-- ENUMS
-- =====================================================

CREATE TYPE user_role AS ENUM ('super_admin', 'manager', 'accountant', 'auditor');
CREATE TYPE tax_regime AS ENUM ('vat', 'turnover', 'fixed', 'yatt', 'income');
CREATE TYPE report_status AS ENUM ('accepted', 'not_submitted', 'not_required', 'in_progress', 'blocked', 'error', 'unknown', 'rejected', 'submitted');
CREATE TYPE stats_type AS ENUM ('kb1', 'micro', 'mehnat1', 'small');
CREATE TYPE notification_type AS ENUM ('deadline', 'status_change', 'kpi_alert', 'system');
CREATE TYPE audit_action AS ENUM ('create', 'update', 'delete', 'login', 'logout');

-- =====================================================
-- PROFILES TABLE (extends Supabase Auth)
-- =====================================================

CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'accountant',
  avatar_url TEXT,
  avatar_color TEXT DEFAULT 'hsl(200, 50%, 50%)',
  phone TEXT,
  department TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies for profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins and managers can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'manager')
    )
  );

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Only super admins can insert profiles"
  ON profiles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'super_admin'
    )
  );

-- =====================================================
-- COMPANIES TABLE
-- =====================================================

CREATE TABLE companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  inn TEXT NOT NULL,
  tax_regime tax_regime NOT NULL,
  stats_type stats_type,
  department TEXT NOT NULL,
  accountant_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  login TEXT,
  password_encrypted TEXT, -- Encrypted password
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  updated_by UUID REFERENCES profiles(id)
);

-- Indexes for performance
CREATE INDEX idx_companies_accountant ON companies(accountant_id);
CREATE INDEX idx_companies_inn ON companies(inn);
CREATE INDEX idx_companies_active ON companies(is_active);

-- RLS Policies for companies
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Accountants can view their own companies"
  ON companies FOR SELECT
  USING (
    accountant_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'manager', 'auditor')
    )
  );

CREATE POLICY "Accountants can update their own companies"
  ON companies FOR UPDATE
  USING (
    accountant_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'manager')
    )
  );

CREATE POLICY "Admins and managers can insert companies"
  ON companies FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'manager')
    )
  );

-- =====================================================
-- OPERATIONS TABLE
-- =====================================================

CREATE TABLE operations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  period TEXT NOT NULL, -- e.g., "2024 Yillik"
  profit_tax_status report_status NOT NULL DEFAULT 'not_submitted',
  form1_status report_status NOT NULL DEFAULT 'not_submitted',
  form2_status report_status NOT NULL DEFAULT 'not_submitted',
  stats_status report_status NOT NULL DEFAULT 'not_submitted',
  comment TEXT,
  deadline_profit_tax DATE,
  deadline_stats DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  updated_by UUID REFERENCES profiles(id),
  UNIQUE(company_id, period)
);

-- Indexes
CREATE INDEX idx_operations_company ON operations(company_id);
CREATE INDEX idx_operations_period ON operations(period);
CREATE INDEX idx_operations_deadlines ON operations(deadline_profit_tax, deadline_stats);

-- RLS Policies for operations
ALTER TABLE operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view operations for accessible companies"
  ON operations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM companies
      WHERE companies.id = operations.company_id
      AND (
        companies.accountant_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('super_admin', 'manager', 'auditor')
        )
      )
    )
  );

CREATE POLICY "Users can update operations for their companies"
  ON operations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM companies
      WHERE companies.id = operations.company_id
      AND (
        companies.accountant_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('super_admin', 'manager')
        )
      )
    )
  );

CREATE POLICY "Users can insert operations for accessible companies"
  ON operations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM companies
      WHERE companies.id = operations.company_id
      AND (
        companies.accountant_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('super_admin', 'manager')
        )
      )
    )
  );

-- =====================================================
-- KPI METRICS TABLE
-- =====================================================

CREATE TABLE kpi_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  accountant_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  period TEXT NOT NULL, -- e.g., "2024-Q1", "2024-01", "2024"
  total_companies INTEGER NOT NULL DEFAULT 0,
  annual_completed INTEGER NOT NULL DEFAULT 0,
  annual_pending INTEGER NOT NULL DEFAULT 0,
  annual_blocked INTEGER NOT NULL DEFAULT 0,
  stats_completed INTEGER NOT NULL DEFAULT 0,
  annual_progress DECIMAL(5,2) NOT NULL DEFAULT 0, -- Percentage
  stats_progress DECIMAL(5,2) NOT NULL DEFAULT 0, -- Percentage
  quality_score DECIMAL(5,2) NOT NULL DEFAULT 0, -- Based on rejections
  timeliness_score DECIMAL(5,2) NOT NULL DEFAULT 0, -- Based on deadlines
  overall_score DECIMAL(5,2) NOT NULL DEFAULT 0,
  zone TEXT NOT NULL DEFAULT 'red', -- 'green', 'yellow', 'red'
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(accountant_id, period)
);

-- Indexes
CREATE INDEX idx_kpi_accountant ON kpi_metrics(accountant_id);
CREATE INDEX idx_kpi_period ON kpi_metrics(period);
CREATE INDEX idx_kpi_zone ON kpi_metrics(zone);

-- RLS Policies
ALTER TABLE kpi_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own KPI metrics"
  ON kpi_metrics FOR SELECT
  USING (
    accountant_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'manager', 'auditor')
    )
  );

CREATE POLICY "System can insert/update KPI metrics"
  ON kpi_metrics FOR ALL
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- KPI HISTORY TABLE
-- =====================================================

CREATE TABLE kpi_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  accountant_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value DECIMAL(10,2) NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_kpi_history_accountant ON kpi_history(accountant_id);
CREATE INDEX idx_kpi_history_date ON kpi_history(recorded_at);

-- RLS Policies
ALTER TABLE kpi_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own KPI history"
  ON kpi_history FOR SELECT
  USING (
    accountant_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'manager', 'auditor')
    )
  );

-- =====================================================
-- AUDIT LOGS TABLE
-- =====================================================

CREATE TABLE audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action audit_action NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_table ON audit_logs(table_name);
CREATE INDEX idx_audit_date ON audit_logs(created_at);

-- RLS Policies
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view audit logs"
  ON audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'manager')
    )
  );

-- =====================================================
-- NOTIFICATIONS TABLE
-- =====================================================

CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_notifications_date ON notifications(created_at);

-- RLS Policies
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- =====================================================
-- DOCUMENTS TABLE (for Supabase Storage references)
-- =====================================================

CREATE TABLE documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL, -- Supabase Storage path
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by UUID REFERENCES profiles(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_documents_company ON documents(company_id);

-- RLS Policies
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view documents for accessible companies"
  ON documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM companies
      WHERE companies.id = documents.company_id
      AND (
        companies.accountant_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('super_admin', 'manager', 'auditor')
        )
      )
    )
  );

CREATE POLICY "Users can upload documents for their companies"
  ON documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM companies
      WHERE companies.id = documents.company_id
      AND (
        companies.accountant_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('super_admin', 'manager')
        )
      )
    )
  );

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_operations_updated_at BEFORE UPDATE ON operations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to create audit log
CREATE OR REPLACE FUNCTION create_audit_log()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (user_id, action, table_name, record_id, new_data)
    VALUES (auth.uid(), 'create', TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (user_id, action, table_name, record_id, old_data, new_data)
    VALUES (auth.uid(), 'update', TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (user_id, action, table_name, record_id, old_data)
    VALUES (auth.uid(), 'delete', TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Audit triggers
CREATE TRIGGER audit_companies AFTER INSERT OR UPDATE OR DELETE ON companies
  FOR EACH ROW EXECUTE FUNCTION create_audit_log();

CREATE TRIGGER audit_operations AFTER INSERT OR UPDATE OR DELETE ON operations
  FOR EACH ROW EXECUTE FUNCTION create_audit_log();

-- Function to calculate KPI metrics
CREATE OR REPLACE FUNCTION calculate_kpi_metrics(
  p_accountant_id UUID,
  p_period TEXT
)
RETURNS void AS $$
DECLARE
  v_total INTEGER;
  v_annual_completed INTEGER;
  v_annual_pending INTEGER;
  v_annual_blocked INTEGER;
  v_stats_completed INTEGER;
  v_annual_progress DECIMAL(5,2);
  v_stats_progress DECIMAL(5,2);
  v_zone TEXT;
BEGIN
  -- Get company count
  SELECT COUNT(*) INTO v_total
  FROM companies
  WHERE accountant_id = p_accountant_id AND is_active = true;

  -- Get annual report stats
  SELECT
    COUNT(*) FILTER (WHERE profit_tax_status IN ('accepted', 'not_required')),
    COUNT(*) FILTER (WHERE profit_tax_status IN ('not_submitted', 'rejected')),
    COUNT(*) FILTER (WHERE profit_tax_status = 'blocked' OR form1_status = 'blocked')
  INTO v_annual_completed, v_annual_pending, v_annual_blocked
  FROM operations o
  JOIN companies c ON c.id = o.company_id
  WHERE c.accountant_id = p_accountant_id
    AND o.period = p_period
    AND c.is_active = true;

  -- Get stats completion
  SELECT COUNT(*) FILTER (WHERE stats_status = 'accepted')
  INTO v_stats_completed
  FROM operations o
  JOIN companies c ON c.id = o.company_id
  WHERE c.accountant_id = p_accountant_id
    AND o.period = p_period
    AND c.is_active = true;

  -- Calculate progress
  v_annual_progress := CASE WHEN v_total > 0 THEN (v_annual_completed::DECIMAL / v_total * 100) ELSE 0 END;
  v_stats_progress := CASE WHEN v_total > 0 THEN (v_stats_completed::DECIMAL / v_total * 100) ELSE 0 END;

  -- Determine zone
  v_zone := CASE
    WHEN v_annual_progress >= 90 THEN 'green'
    WHEN v_annual_progress >= 60 THEN 'yellow'
    ELSE 'red'
  END;

  -- Upsert KPI metrics
  INSERT INTO kpi_metrics (
    accountant_id, period, total_companies,
    annual_completed, annual_pending, annual_blocked,
    stats_completed, annual_progress, stats_progress, zone
  )
  VALUES (
    p_accountant_id, p_period, v_total,
    v_annual_completed, v_annual_pending, v_annual_blocked,
    v_stats_completed, v_annual_progress, v_stats_progress, v_zone
  )
  ON CONFLICT (accountant_id, period)
  DO UPDATE SET
    total_companies = EXCLUDED.total_companies,
    annual_completed = EXCLUDED.annual_completed,
    annual_pending = EXCLUDED.annual_pending,
    annual_blocked = EXCLUDED.annual_blocked,
    stats_completed = EXCLUDED.stats_completed,
    annual_progress = EXCLUDED.annual_progress,
    stats_progress = EXCLUDED.stats_progress,
    zone = EXCLUDED.zone,
    calculated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check deadline and create notifications
CREATE OR REPLACE FUNCTION check_deadlines()
RETURNS void AS $$
DECLARE
  v_operation RECORD;
  v_company RECORD;
  v_days_until INTEGER;
BEGIN
  FOR v_operation IN
    SELECT o.*, c.name as company_name, c.accountant_id
    FROM operations o
    JOIN companies c ON c.id = o.company_id
    WHERE c.is_active = true
      AND (
        (o.deadline_profit_tax IS NOT NULL AND o.profit_tax_status NOT IN ('accepted', 'not_required'))
        OR (o.deadline_stats IS NOT NULL AND o.stats_status NOT IN ('accepted', 'not_required'))
      )
  LOOP
    -- Check profit tax deadline
    IF v_operation.deadline_profit_tax IS NOT NULL THEN
      v_days_until := v_operation.deadline_profit_tax - CURRENT_DATE;
      IF v_days_until <= 3 AND v_days_until >= 0 THEN
        INSERT INTO notifications (user_id, type, title, message, link)
        VALUES (
          v_operation.accountant_id,
          'deadline',
          'Muddat yaqinlashmoqda',
          format('%s - Foyda solig''i hisoboti %s kunda topshirilishi kerak', v_operation.company_name, v_days_until),
          '/reports?company=' || v_operation.company_id
        )
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;

    -- Check stats deadline
    IF v_operation.deadline_stats IS NOT NULL THEN
      v_days_until := v_operation.deadline_stats - CURRENT_DATE;
      IF v_days_until <= 3 AND v_days_until >= 0 THEN
        INSERT INTO notifications (user_id, type, title, message, link)
        VALUES (
          v_operation.accountant_id,
          'deadline',
          'Muddat yaqinlashmoqda',
          format('%s - Statistika hisoboti %s kunda topshirilishi kerak', v_operation.company_name, v_days_until),
          '/reports?company=' || v_operation.company_id
        )
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- STORAGE BUCKETS (run these via Supabase Dashboard or API)
-- =====================================================

-- Create storage bucket for documents
-- INSERT INTO storage.buckets (id, name, public) VALUES ('company-documents', 'company-documents', false);

-- Storage policies (example)
-- CREATE POLICY "Users can upload documents for their companies"
-- ON storage.objects FOR INSERT
-- WITH CHECK (
--   bucket_id = 'company-documents'
--   AND auth.uid() IN (
--     SELECT accountant_id FROM companies WHERE id::text = (storage.foldername(name))[1]
--   )
-- );

-- =====================================================
-- INITIAL DATA
-- =====================================================

-- Create default super admin (update with your email)
-- This should be done after first user signs up via Supabase Auth
-- UPDATE profiles SET role = 'super_admin' WHERE email = 'your-email@example.com';

COMMENT ON TABLE profiles IS 'User profiles with role-based access control';
COMMENT ON TABLE companies IS 'Company/firm information';
COMMENT ON TABLE operations IS 'Tax and statistical reporting operations';
COMMENT ON TABLE kpi_metrics IS 'KPI metrics for accountants';
COMMENT ON TABLE kpi_history IS 'Historical KPI data for trend analysis';
COMMENT ON TABLE audit_logs IS 'Audit trail for all data changes';
COMMENT ON TABLE notifications IS 'User notifications';
COMMENT ON TABLE documents IS 'Document metadata (files stored in Supabase Storage)';
