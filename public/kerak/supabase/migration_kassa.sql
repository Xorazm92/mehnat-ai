-- ASOS Accounting Manager - Kassa and Expenses Schema
-- Implementation of Kassa Moduli and Expense Tracking

-- =====================================================
-- ENUMS
-- =====================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
        CREATE TYPE payment_status AS ENUM ('paid', 'pending', 'partial', 'overdue');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_type') THEN
        CREATE TYPE transaction_type AS ENUM ('income', 'expense');
    END IF;
END$$;

-- =====================================================
-- PAYMENTS TABLE (Income from Companies)
-- =====================================================

CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  period TEXT NOT NULL, -- e.g., "2024-01"
  payment_date DATE DEFAULT CURRENT_DATE,
  status payment_status NOT NULL DEFAULT 'pending',
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payments_company ON payments(company_id);
CREATE INDEX IF NOT EXISTS idx_payments_period ON payments(period);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- RLS Policies
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and managers can view all payments"
  ON payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'manager')
    )
  );

CREATE POLICY "Admins and managers can insert/update payments"
  ON payments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'manager')
    )
  );

-- =====================================================
-- EXPENSES TABLE (General Business Expenses)
-- =====================================================

CREATE TABLE IF NOT EXISTS expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  date DATE DEFAULT CURRENT_DATE,
  category TEXT NOT NULL, -- e.g., "Office", "Salary", "Tax", "Furniture"
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

-- RLS Policies
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and managers can view all expenses"
  ON expenses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'manager')
    )
  );

CREATE POLICY "Admins and managers can insert/update expenses"
  ON expenses FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'manager')
    )
  );

-- =====================================================
-- TRIGGERS for updated_at
-- =====================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_payments_updated_at') THEN
        CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_expenses_updated_at') THEN
        CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END$$;

-- Audit triggers
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_payments') THEN
        CREATE TRIGGER audit_payments AFTER INSERT OR UPDATE OR DELETE ON payments
          FOR EACH ROW EXECUTE FUNCTION create_audit_log();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_expenses') THEN
        CREATE TRIGGER audit_expenses AFTER INSERT OR UPDATE OR DELETE ON expenses
          FOR EACH ROW EXECUTE FUNCTION create_audit_log();
    END IF;
END$$;
