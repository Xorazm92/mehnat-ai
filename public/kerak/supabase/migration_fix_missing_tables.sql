-- Migration to fix 404 errors and add missing tables

-- 1. Payments (Moliya - To'lovlar)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  amount NUMERIC DEFAULT 0,
  period TEXT,
  payment_date DATE,
  status TEXT DEFAULT 'pending', -- paid, pending, partial, overdue
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Expenses (Moliya - Xarajatlar)
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  amount NUMERIC DEFAULT 0,
  date DATE,
  category TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Documents (Hujjatlar - Firmalar va Xodimlar uchun)
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id), -- Agar firma hujjati bo'lsa
  staff_id UUID REFERENCES profiles(id),    -- Agar xodim hujjati bo'lsa
  name TEXT,
  type TEXT, -- PDF, DOCX, JPG
  url TEXT,
  size TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON payments FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON expenses FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON documents FOR ALL USING (auth.role() = 'authenticated');

-- Grant permissions (if needed for public/anon, usually not)
GRANT ALL ON payments TO authenticated;
GRANT ALL ON expenses TO authenticated;
GRANT ALL ON documents TO authenticated;
