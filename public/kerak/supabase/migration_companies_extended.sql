-- KORXONALAR MODULI - Extended Companies Schema
-- Migration for 6-tab company profile system
-- Created: 2026-02-05

-- =====================================================
-- EXTENDED COMPANY FIELDS
-- =====================================================

-- Tab 1: PASPORT (Passport) fields
ALTER TABLE companies ADD COLUMN IF NOT EXISTS brand_name TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS director_name TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS director_phone TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS legal_address TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS founder_name TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS certificate_file_path TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS charter_file_path TEXT;

-- Tab 2: SOLIQ (Tax & Obligations) fields
ALTER TABLE companies ADD COLUMN IF NOT EXISTS vat_certificate_date DATE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS has_land_tax BOOLEAN DEFAULT FALSE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS has_water_tax BOOLEAN DEFAULT FALSE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS has_property_tax BOOLEAN DEFAULT FALSE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS has_excise_tax BOOLEAN DEFAULT FALSE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS has_auction_tax BOOLEAN DEFAULT FALSE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS one_c_status TEXT DEFAULT 'none'; -- 'cloud', 'local', 'server', 'none'
ALTER TABLE companies ADD COLUMN IF NOT EXISTS one_c_location TEXT;

-- Tab 5: SHARTNOMA (Contract) fields
ALTER TABLE companies ADD COLUMN IF NOT EXISTS contract_number TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS contract_date DATE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS payment_day INTEGER DEFAULT 5;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS firma_share_percent DECIMAL(5,2) DEFAULT 50.00;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS current_balance DECIMAL(15,2) DEFAULT 0;

-- Tab 6: XAVF (Risk) fields
ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_status TEXT DEFAULT 'active'; -- 'active', 'suspended', 'debtor', 'problem', 'bankrupt'
ALTER TABLE companies ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'low'; -- 'low', 'medium', 'high'
ALTER TABLE companies ADD COLUMN IF NOT EXISTS risk_notes TEXT;

-- Create indexes for new fields
CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(company_status);
CREATE INDEX IF NOT EXISTS idx_companies_risk ON companies(risk_level);
CREATE INDEX IF NOT EXISTS idx_companies_director ON companies(director_name);

-- =====================================================
-- CLIENT CREDENTIALS TABLE (Tab 3: LOGINLAR)
-- Encrypted vault for service credentials
-- =====================================================

CREATE TABLE IF NOT EXISTS client_credentials (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    service_name TEXT NOT NULL, -- 'soliq', 'didox', 'my_mehnat', 'bank_client'
    login_id TEXT,
    encrypted_password TEXT,
    key_file_path TEXT, -- For .pfx files (e-imzo)
    notes TEXT,
    updated_by UUID REFERENCES profiles(id),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, service_name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_credentials_company ON client_credentials(company_id);

-- RLS Policies
ALTER TABLE client_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view credentials for accessible companies"
  ON client_credentials FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM companies
      WHERE companies.id = client_credentials.company_id
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

CREATE POLICY "Admins can manage credentials"
  ON client_credentials FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'manager')
    )
  );

-- =====================================================
-- CREDENTIAL ACCESS LOG TABLE
-- Audit log for password views
-- =====================================================

CREATE TABLE IF NOT EXISTS credential_access_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    credential_id UUID REFERENCES client_credentials(id) ON DELETE CASCADE NOT NULL,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    accessed_by UUID REFERENCES profiles(id) NOT NULL,
    accessed_at TIMESTAMPTZ DEFAULT NOW(),
    ip_address INET,
    action TEXT DEFAULT 'view' -- 'view', 'copy', 'export'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_access_log_credential ON credential_access_log(credential_id);
CREATE INDEX IF NOT EXISTS idx_access_log_company ON credential_access_log(company_id);
CREATE INDEX IF NOT EXISTS idx_access_log_user ON credential_access_log(accessed_by);
CREATE INDEX IF NOT EXISTS idx_access_log_date ON credential_access_log(accessed_at);

-- RLS Policies
ALTER TABLE credential_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view access logs"
  ON credential_access_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'manager')
    )
  );

CREATE POLICY "System can insert access logs"
  ON credential_access_log FOR INSERT
  WITH CHECK (true);

-- =====================================================
-- CLIENT HISTORY TABLE (Tab 4: JAMOA & General Audit)
-- Tracks all company changes including team assignments
-- =====================================================

CREATE TABLE IF NOT EXISTS client_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    change_type TEXT NOT NULL, -- 'accountant_change', 'bank_manager_change', 'supervisor_change', 'tax_change', 'status_change', 'contract_change'
    field_name TEXT, -- Specific field that changed
    old_value TEXT,
    new_value TEXT,
    changed_by UUID REFERENCES profiles(id),
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_history_company ON client_history(company_id);
CREATE INDEX IF NOT EXISTS idx_history_type ON client_history(change_type);
CREATE INDEX IF NOT EXISTS idx_history_date ON client_history(changed_at);

-- RLS Policies
ALTER TABLE client_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view history for accessible companies"
  ON client_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM companies
      WHERE companies.id = client_history.company_id
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

CREATE POLICY "System can insert history"
  ON client_history FOR INSERT
  WITH CHECK (true);

-- =====================================================
-- TRIGGERS FOR AUTOMATIC HISTORY LOGGING
-- =====================================================

-- Function to log company changes
CREATE OR REPLACE FUNCTION log_company_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Log accountant changes
  IF OLD.accountant_id IS DISTINCT FROM NEW.accountant_id THEN
    INSERT INTO client_history (company_id, change_type, field_name, old_value, new_value, changed_by)
    VALUES (NEW.id, 'accountant_change', 'accountant_id', OLD.accountant_id::TEXT, NEW.accountant_id::TEXT, auth.uid());
  END IF;
  
  -- Log bank manager changes
  IF OLD.bank_client_id IS DISTINCT FROM NEW.bank_client_id THEN
    INSERT INTO client_history (company_id, change_type, field_name, old_value, new_value, changed_by)
    VALUES (NEW.id, 'bank_manager_change', 'bank_client_id', OLD.bank_client_id::TEXT, NEW.bank_client_id::TEXT, auth.uid());
  END IF;
  
  -- Log supervisor changes
  IF OLD.supervisor_id IS DISTINCT FROM NEW.supervisor_id THEN
    INSERT INTO client_history (company_id, change_type, field_name, old_value, new_value, changed_by)
    VALUES (NEW.id, 'supervisor_change', 'supervisor_id', OLD.supervisor_id::TEXT, NEW.supervisor_id::TEXT, auth.uid());
  END IF;
  
  -- Log status changes
  IF OLD.company_status IS DISTINCT FROM NEW.company_status THEN
    INSERT INTO client_history (company_id, change_type, field_name, old_value, new_value, changed_by)
    VALUES (NEW.id, 'status_change', 'company_status', OLD.company_status, NEW.company_status, auth.uid());
  END IF;
  
  -- Log tax regime changes
  IF OLD.tax_regime IS DISTINCT FROM NEW.tax_regime THEN
    INSERT INTO client_history (company_id, change_type, field_name, old_value, new_value, changed_by)
    VALUES (NEW.id, 'tax_change', 'tax_regime', OLD.tax_regime::TEXT, NEW.tax_regime::TEXT, auth.uid());
  END IF;
  
  -- Log contract amount changes
  IF OLD.contract_amount IS DISTINCT FROM NEW.contract_amount THEN
    INSERT INTO client_history (company_id, change_type, field_name, old_value, new_value, changed_by)
    VALUES (NEW.id, 'contract_change', 'contract_amount', OLD.contract_amount::TEXT, NEW.contract_amount::TEXT, auth.uid());
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for company changes
DROP TRIGGER IF EXISTS trigger_log_company_changes ON companies;
CREATE TRIGGER trigger_log_company_changes
  AFTER UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION log_company_changes();

-- =====================================================
-- VIEWS FOR EASY QUERYING
-- =====================================================

-- Company risk summary view
CREATE OR REPLACE VIEW company_risk_summary AS
SELECT 
    c.id,
    c.name,
    c.inn,
    c.company_status,
    c.risk_level,
    c.accountant_id,
    COUNT(CASE WHEN o.profit_tax_status = 'blocked' THEN 1 END) as blocked_reports,
    COUNT(CASE WHEN o.profit_tax_status = 'not_submitted' THEN 1 END) as pending_reports,
    CASE 
        WHEN COUNT(CASE WHEN o.profit_tax_status = 'blocked' THEN 1 END) > 0 THEN 'high'
        WHEN COUNT(CASE WHEN o.profit_tax_status = 'not_submitted' THEN 1 END) > 2 THEN 'medium'
        ELSE 'low'
    END as calculated_risk
FROM companies c
LEFT JOIN operations o ON c.id = o.company_id
WHERE c.is_active = true
GROUP BY c.id, c.name, c.inn, c.company_status, c.risk_level, c.accountant_id;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE client_credentials IS 'Encrypted vault for company login credentials (Soliq.uz, Didox, Bank, etc.)';
COMMENT ON TABLE credential_access_log IS 'Audit log tracking who viewed passwords and when';
COMMENT ON TABLE client_history IS 'Change history for company data including team assignments';
COMMENT ON COLUMN companies.one_c_status IS '1C accounting software status: cloud, local, server, or none';
COMMENT ON COLUMN companies.risk_level IS 'AI-calculated risk level: low (green), medium (yellow), high (red)';
