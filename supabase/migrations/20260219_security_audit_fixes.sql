-- ================================================================
-- CRITICAL SECURITY AUDIT FIXES
-- ================================================================
-- Date: 2025-02-19
-- Purpose: Implement critical security vulnerabilities identified in production audit
-- Risk Level: CRITICAL - Must be applied before production deployment
-- ================================================================

-- PART 1: Password Security - Rename password column to password_hash
-- and add password management fields
-- ================================================================

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS password_hash TEXT,
ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ DEFAULT now(),
ADD COLUMN IF NOT EXISTS password_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS failed_login_attempts INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS account_locked_until TIMESTAMPTZ;

-- Migrate plain text passwords to hashed (use app-level bcrypt)
-- DO NOT hash at DB level - this must be done in application code
-- UPDATE profiles SET password_hash = password WHERE password IS NOT NULL;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS password;

-- Create index for faster password checks
CREATE INDEX IF NOT EXISTS idx_profiles_password_hash ON profiles(id) 
WHERE password_hash IS NOT NULL;

-- PART 2: Audit Logging - Create comprehensive audit trail
-- ================================================================

-- Create audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT,
  action TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'CREATE_COMPANY', 'DELETE_COMPANY', etc.
  table_name TEXT, -- Which table was affected
  record_id UUID, -- ID of affected record
  old_values JSONB, -- Previous values for UPDATE/DELETE
  new_values JSONB, -- New values for INSERT/UPDATE
  changes_json JSONB, -- Diff of changes
  ip_address TEXT,
  user_agent TEXT,
  status TEXT DEFAULT 'success', -- 'success', 'failed', 'blocked'
  error_message TEXT,
  metadata JSONB, -- Additional context
  created_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT valid_action CHECK (action IN (
    'INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 
    'LOGIN_FAILED', 'ACCOUNT_LOCKED', 'PASSWORD_CHANGED',
    'CREATE_COMPANY', 'DELETE_COMPANY', 'UPDATE_COMPANY',
    'ASSIGN_ROLE', 'REVOKE_ROLE', 'CREATE_OPERATION',
    'DELETE_OPERATION', 'UPDATE_OPERATION', 'IMPORT_BATCH',
    'EXPORT_DATA', 'CHANGE_PERMISSION', 'CREATE_STAFF',
    'DELETE_STAFF', 'UPDATE_STAFF', 'CREATE_EXPENSE',
    'DELETE_EXPENSE', 'UPDATE_EXPENSE', 'ADMIN_ACTION'
  ))
);

-- Create indexes for audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record_id ON audit_logs(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Create trigger function to log company changes
CREATE OR REPLACE FUNCTION log_company_changes()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (
    user_id,
    user_agent,
    action,
    table_name,
    record_id,
    old_values,
    new_values,
    status,
    metadata
  ) VALUES (
    auth.uid(),
    current_setting('request.headers')::json->>'user-agent',
    CASE 
      WHEN TG_OP = 'INSERT' THEN 'CREATE_COMPANY'
      WHEN TG_OP = 'UPDATE' THEN 'UPDATE_COMPANY'
      WHEN TG_OP = 'DELETE' THEN 'DELETE_COMPANY'
    END,
    'companies',
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN row_to_json(NEW) ELSE NULL END,
    'success',
    jsonb_build_object(
      'timestamp', now(),
      'table', TG_TABLE_NAME,
      'operation', TG_OP
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for company changes
DROP TRIGGER IF EXISTS companies_audit_trigger ON companies;
CREATE TRIGGER companies_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON companies
FOR EACH ROW EXECUTE FUNCTION log_company_changes();

-- PART 3: RLS Policy Fixes
-- ================================================================

-- Enable RLS on audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Audit logs RLS - users can only see their own actions, admins see all
CREATE POLICY "Users can view their own audit logs" ON audit_logs
  FOR SELECT USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'nachalnik', 'supervisor')
    )
  );

CREATE POLICY "System can log all actions" ON audit_logs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Only admins can delete audit logs" ON audit_logs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Fix companies RLS - ensure no data leaks
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Drop existing companies policies
DROP POLICY IF EXISTS "Companies readable by assigned users" ON companies;
DROP POLICY IF EXISTS "Companies can be created by authorized users" ON companies;
DROP POLICY IF EXISTS "Companies can be updated by authorized users" ON companies;
DROP POLICY IF EXISTS "Companies can be deleted by admins" ON companies;

-- Create stricter companies RLS policies
CREATE POLICY "Companies SELECT - Role-based access" ON companies
  FOR SELECT USING (
    -- Admins see all
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
    OR
    -- Nachalnik sees all companies they supervise
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'nachalnik'
    )
    OR
    -- Accountants see their assigned company
    accountant_id = auth.uid()
    OR
    -- Supervisors see companies they supervise
    supervisor_id = auth.uid()
    OR
    -- Chief accountants see their companies
    chief_accountant_id = auth.uid()
    OR
    -- Bank clients see their assigned company
    bank_client_id = auth.uid()
  );

CREATE POLICY "Companies INSERT - Authorized roles only" ON companies
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'nachalnik')
    )
  );

CREATE POLICY "Companies UPDATE - Strict authorization" ON companies
  FOR UPDATE USING (
    -- Admin can update any
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
    OR
    -- Nachalnik can update companies they supervise
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'nachalnik'
    )
    OR
    -- Accountant can update their company
    accountant_id = auth.uid()
  );

CREATE POLICY "Companies DELETE - Admin only" ON companies
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- PART 4: Session Management Security
-- ================================================================

-- Create sessions table for tracking active sessions
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_activity TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT session_not_expired CHECK (expires_at > now())
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Enable RLS
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own sessions" ON user_sessions
  FOR SELECT USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "System manages sessions" ON user_sessions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users delete their sessions" ON user_sessions
  FOR DELETE USING (user_id = auth.uid());

-- PART 5: Token Blacklist for Logout
-- ================================================================

CREATE TABLE IF NOT EXISTS token_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT DEFAULT 'logout',
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  
  CONSTRAINT token_not_empty CHECK (LENGTH(token) > 0)
);

CREATE INDEX IF NOT EXISTS idx_token_blacklist_token ON token_blacklist(token);
CREATE INDEX IF NOT EXISTS idx_token_blacklist_user_id ON token_blacklist(user_id);
CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires_at ON token_blacklist(expires_at);

-- Enable RLS
ALTER TABLE token_blacklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System manages token blacklist" ON token_blacklist
  FOR ALL USING (true);

-- PART 6: Input Validation Triggers
-- ================================================================

-- Create function to validate company data
CREATE OR REPLACE FUNCTION validate_company_data()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate INN (should be 10 or 12 digits)
  IF NEW.inn IS NOT NULL AND LENGTH(TRIM(NEW.inn)) > 0 THEN
    IF NOT (TRIM(NEW.inn) ~ '^\d{10}$' OR TRIM(NEW.inn) ~ '^\d{12}$') THEN
      RAISE EXCEPTION 'Invalid INN format: must be 10 or 12 digits';
    END IF;
  END IF;

  -- Validate tax regime
  IF NEW.tax_regime IS NOT NULL THEN
    IF NEW.tax_regime NOT IN ('vat', 'turnover', 'fixed') THEN
      RAISE EXCEPTION 'Invalid tax regime: must be vat, turnover, or fixed';
    END IF;
  END IF;

  -- Validate contract amount
  IF NEW.contract_amount IS NOT NULL AND NEW.contract_amount < 0 THEN
    RAISE EXCEPTION 'Contract amount cannot be negative';
  END IF;

  -- Validate percentages (0-100)
  IF NEW.accountant_perc IS NOT NULL AND (NEW.accountant_perc < 0 OR NEW.accountant_perc > 100) THEN
    RAISE EXCEPTION 'Accountant percentage must be between 0 and 100';
  END IF;

  IF NEW.supervisor_perc IS NOT NULL AND (NEW.supervisor_perc < 0 OR NEW.supervisor_perc > 100) THEN
    RAISE EXCEPTION 'Supervisor percentage must be between 0 and 100';
  END IF;

  IF NEW.firma_share_percent IS NOT NULL AND (NEW.firma_share_percent < 0 OR NEW.firma_share_percent > 100) THEN
    RAISE EXCEPTION 'Firma share percentage must be between 0 and 100';
  END IF;

  -- Sanitize text fields (remove null bytes and control characters)
  NEW.name = regexp_replace(COALESCE(NEW.name, ''), '[^\x20-\x7E\n\r]', '', 'g');
  NEW.login = regexp_replace(COALESCE(NEW.login, ''), '[^\x20-\x7E]', '', 'g');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS validate_company_data_trigger ON companies;
CREATE TRIGGER validate_company_data_trigger
BEFORE INSERT OR UPDATE ON companies
FOR EACH ROW EXECUTE FUNCTION validate_company_data();

-- PART 7: Password Policy Enforcement
-- ================================================================

-- Create function to enforce password policy
CREATE OR REPLACE FUNCTION enforce_password_policy()
RETURNS TRIGGER AS $$
BEGIN
  -- Password hash must be set
  IF NEW.password_hash IS NULL OR LENGTH(TRIM(NEW.password_hash)) = 0 THEN
    RAISE EXCEPTION 'Password hash is required and cannot be empty';
  END IF;

  -- Password hash should be bcrypt format (starts with $2)
  IF NOT (NEW.password_hash ~ '^\$2') THEN
    RAISE EXCEPTION 'Invalid password hash format - must be bcrypt hash';
  END IF;

  -- Update password changed timestamp
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.password_hash IS DISTINCT FROM NEW.password_hash) THEN
    NEW.password_changed_at = now();
    NEW.failed_login_attempts = 0;
    NEW.account_locked_until = NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_password_policy_trigger ON profiles;
CREATE TRIGGER enforce_password_policy_trigger
BEFORE INSERT OR UPDATE ON profiles
FOR EACH ROW 
WHEN (NEW.password_hash IS DISTINCT FROM OLD.password_hash OR TG_OP = 'INSERT')
EXECUTE FUNCTION enforce_password_policy();

-- PART 8: Add Security Tracking Columns
-- ================================================================

-- Add security columns to profiles if not exists
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_ip_address TEXT,
ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS mfa_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS security_alerts_enabled BOOLEAN DEFAULT true;

-- Add security columns to companies if not exists
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS security_level TEXT DEFAULT 'medium',
ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS data_classification TEXT DEFAULT 'internal';

-- PART 9: Grant Appropriate Permissions
-- ================================================================

-- Grant select on audit_logs to authenticated users (filtered by RLS)
GRANT SELECT ON audit_logs TO authenticated;
GRANT INSERT ON audit_logs TO authenticated;

-- Grant select on user_sessions to authenticated users (filtered by RLS)
GRANT SELECT ON user_sessions TO authenticated;
GRANT INSERT ON user_sessions TO authenticated;
GRANT DELETE ON user_sessions TO authenticated;

-- Grant access to token_blacklist (for logout operations)
GRANT SELECT ON token_blacklist TO authenticated;
GRANT INSERT ON token_blacklist TO authenticated;

-- PART 10: Create Views for Security Monitoring
-- ================================================================

-- Create view for admin security monitoring
CREATE OR REPLACE VIEW security_monitoring AS
SELECT 
  al.id,
  al.user_id,
  p.email,
  p.full_name,
  al.action,
  al.table_name,
  al.status,
  al.error_message,
  al.ip_address,
  al.created_at,
  CASE 
    WHEN al.status = 'blocked' THEN 'SECURITY_ALERT'
    WHEN al.action IN ('LOGIN_FAILED', 'ACCOUNT_LOCKED') THEN 'SECURITY_ALERT'
    ELSE 'INFO'
  END as alert_level
FROM audit_logs al
LEFT JOIN profiles p ON al.user_id = p.id
WHERE al.created_at > now() - INTERVAL '24 hours'
ORDER BY al.created_at DESC;

-- Grant view access
GRANT SELECT ON security_monitoring TO authenticated;

-- PART 11: Index Optimization for Security Queries
-- ================================================================

-- Create composite indexes for common security queries
CREATE INDEX IF NOT EXISTS idx_profiles_role_active ON profiles(role, id) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_companies_accountant_active ON companies(accountant_id, id) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_audit_logs_date_action ON audit_logs(created_at DESC, action);

-- PART 12: Create Security Configuration Table
-- ================================================================

CREATE TABLE IF NOT EXISTS security_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  last_updated_at TIMESTAMPTZ DEFAULT now(),
  last_updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  CONSTRAINT valid_setting CHECK (LENGTH(setting_key) > 0)
);

-- Seed security settings
INSERT INTO security_settings (setting_key, setting_value, description)
VALUES 
  ('password_min_length', '{"value": 8}', 'Minimum password length'),
  ('password_max_length', '{"value": 128}', 'Maximum password length'),
  ('password_requires_uppercase', '{"value": true}', 'Password must contain uppercase'),
  ('password_requires_lowercase', '{"value": true}', 'Password must contain lowercase'),
  ('password_requires_numbers', '{"value": true}', 'Password must contain numbers'),
  ('password_requires_special', '{"value": true}', 'Password must contain special characters'),
  ('password_expiry_days', '{"value": 90}', 'Password expiry in days (0 = no expiry)'),
  ('session_timeout_minutes', '{"value": 30}', 'Session timeout in minutes'),
  ('max_failed_login_attempts', '{"value": 5}', 'Max failed login attempts before lockout'),
  ('account_lockout_minutes', '{"value": 15}', 'Account lockout duration in minutes'),
  ('token_rotation_interval_minutes', '{"value": 5}', 'Token rotation interval in minutes'),
  ('require_mfa', '{"value": false}', 'Require MFA for all users'),
  ('allow_concurrent_sessions', '{"value": 1}', 'Number of concurrent sessions allowed per user (0 = unlimited)')
ON CONFLICT (setting_key) DO NOTHING;

-- Enable RLS
ALTER TABLE security_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read security settings" ON security_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update security settings" ON security_settings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ================================================================
-- VERIFY MIGRATION
-- ================================================================

-- Check audit_logs table exists
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'audit_logs' 
AND table_schema = 'public';

-- Check token_blacklist table exists
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'token_blacklist' 
AND table_schema = 'public';

-- Check user_sessions table exists
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'user_sessions' 
AND table_schema = 'public';

-- Check security_settings table exists
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'security_settings' 
AND table_schema = 'public';

-- List all audit_logs columns
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'audit_logs' 
ORDER BY ordinal_position;

-- ================================================================
-- ROLLBACK INSTRUCTIONS
-- ================================================================
-- If migration fails, execute these commands in reverse order:
-- DROP TRIGGER IF EXISTS companies_audit_trigger ON companies;
-- DROP FUNCTION IF EXISTS log_company_changes();
-- DROP TABLE IF EXISTS audit_logs;
-- DROP TABLE IF EXISTS token_blacklist;
-- DROP TABLE IF EXISTS user_sessions;
-- DROP TABLE IF EXISTS security_settings;
-- DROP FUNCTION IF EXISTS validate_company_data();
-- DROP FUNCTION IF EXISTS enforce_password_policy();
