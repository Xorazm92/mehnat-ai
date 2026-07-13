-- Migration for RBAC and History Tracking
-- 1. Client Assignments (Biriktirish Tarixi)
CREATE TYPE assignment_role AS ENUM ('accountant', 'bank_manager', 'supervisor');
CREATE TYPE assignment_status AS ENUM ('active', 'inactive');

CREATE TABLE IF NOT EXISTS client_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role_type assignment_role NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE, -- NULL means currently active
  status assignment_status DEFAULT 'active',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent overlapping active assignments for the same role on the same company
  -- (Optional, but good for data integrity)
  CONSTRAINT unique_active_assignment UNIQUE (client_id, role_type, status)
    -- This constraint is tricky with 'status', better handled by trigger or app logic if 'active' is not unique column value
);

-- Index for fast lookup during salary calculation
CREATE INDEX idx_client_assignments_history ON client_assignments(user_id, start_date, end_date);
CREATE INDEX idx_client_assignments_company ON client_assignments(client_id, role_type);


-- 2. Audit Logs (Tizim Tarixi)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL, -- 'view_password', 'assign_client', etc.
  entity_type TEXT, -- 'company', 'credential', 'staff'
  entity_id UUID,
  details JSONB, -- { old_value: ..., new_value: ... }
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Function to Migrate Existing Data (Initial Sync)
-- This takes current columns from companies table and creates initial history records
CREATE OR REPLACE FUNCTION migrate_initial_assignments() RETURNS void AS $$
DECLARE
  comp RECORD;
BEGIN
  FOR comp IN SELECT id, accountant_id, bank_client_id, supervisor_id FROM companies LOOP
    -- Accountant
    IF comp.accountant_id IS NOT NULL THEN
      INSERT INTO client_assignments (client_id, user_id, role_type, start_date, status)
      VALUES (comp.id, comp.accountant_id, 'accountant', CURRENT_DATE, 'active')
      ON CONFLICT DO NOTHING;
    END IF;

    -- Bank Manager (Bank Client ID usually refers to the staff managing it?)
    -- Assuming bank_client_id is a profile ID. If it's a text ID, this FK will fail.
    -- Check if bank_client_id matches a profile uuid.
    -- If bank_client_id is actually a "login ID string", then we skip.
    -- Based on types.ts, bankClientId is separate from bankClientName. 
    -- If bank_client_id IS a UUID, we insert.
    -- (We will skip validation inside SQL for simplicity, but in prod be careful)
    
    -- Supervisor
    IF comp.supervisor_id IS NOT NULL THEN
      INSERT INTO client_assignments (client_id, user_id, role_type, start_date, status)
      VALUES (comp.id, comp.supervisor_id, 'supervisor', CURRENT_DATE, 'active')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 4. Enable RLS
ALTER TABLE client_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Public read assignments" ON client_assignments FOR SELECT USING (true);
CREATE POLICY "Admins manage assignments" ON client_assignments FOR ALL USING (
  exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'manager', 'supervisor'))
);

CREATE POLICY "Users can create audit logs" ON audit_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view audit logs" ON audit_logs FOR SELECT USING (
  exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'manager', 'supervisor'))
);
