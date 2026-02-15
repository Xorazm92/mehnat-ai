-- 1. Agar eski jadval bo'lsa, uni tozalash (ixtiyoriy, ehtiyot bo'ling)
-- DROP TABLE IF EXISTS company_monthly_reports;

-- 2. Asosiy hisobotlar jadvalini yaratish
CREATE TABLE IF NOT EXISTS company_monthly_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  period TEXT NOT NULL, -- Masalan: "2024-03" yoki "2024-Q1"

  -- OPERATSION VISKOLA (Eski CSV dan)
  bank_klient TEXT,
  didox TEXT,
  xatlar TEXT,
  avtokameral TEXT,
  my_mehnat TEXT,
  one_c TEXT,                 -- 1C
  pul_oqimlari TEXT,
  chiqadigan_soliqlar TEXT,
  hisoblangan_oylik TEXT,
  debitor_kreditor TEXT,
  tovar_ostatka TEXT,
  nds_bekor_qilish TEXT,

  -- ASOSIY SOLIQLAR VA MOLIYAVIY HISOBOTLAR (Rasmdan)
  moliyaviy_natija TEXT,      -- Moliyaviy natija
  buxgalteriya_balansi TEXT,  -- Balans
  daromad_soligi TEXT,        -- Daromad Solig’i (15 sanagacha)
  aylanma_soligi TEXT,        -- Aylanma soliq (15 sana)
  nds TEXT,                   -- NDS (20 sana)
  inps TEXT,                  -- INPS (10 sanagacha)
  foyda_soligi TEXT,          -- Foyda Solig’i (har kvartalda 20 sana)
  
  -- AVANS TO'LOVLARI
  avans_foyda_soligi TEXT,    -- 20 mlrd oshganlar avansi otchyoti va to'lovi (23 sanagacha)

  -- RESURS SOLIQLARI
  mol_mulk_soligi TEXT,       -- Mol-mulk (10 sana)
  yer_soligi TEXT,            -- Yer soliq
  suv_soligi TEXT,            -- Suv soliq
  aksiz_soligi TEXT,          -- AKSIZ soliqi (har oy 10 sana)
  nedro_soligi TEXT,          -- NEDRO soliq (Yer qa'ridan foydalanish)

  -- NOREZIDENTLAR
  norezident_foyda_soligi TEXT, -- Norezident foyda
  norezident_nds TEXT,          -- Norezident NDS

  -- STATISTIKA HISOBOTLARI
  statistika_1kb_yillik TEXT,       -- 1 KB yillik
  statistika_4kb_choraklik TEXT,    -- 4 kb Choraklik
  statistika_1_mehnat TEXT,         -- 1 Mehnat
  statistika_4_mehnat_choraklik TEXT, -- 4 mehnat choraklik
  statistika_1_korxona TEXT,        -- 1 korxona
  statistika_1_moliya TEXT,         -- 1 Moliya
  statistika_4_invest_xorijiy TEXT, -- 4 invest horijiy
  statistika_4_invest_mahalliy TEXT, -- 4 invest mahalliy
  statistika_1kx_yillik TEXT,       -- 1kx yillik
  statistika_4kx_choraklik TEXT,    -- 4kx choraklik
  statistika_1nnt TEXT,             -- 1 nnt

  -- QO'SHIMCHA STATUSLAR
  it_park_rezidenti TEXT,     -- IT PARK Rezidenti
  
  comment TEXT,               -- Qo'shimcha izohlar uchun
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Bir firma bir oyda/davrda faqat bitta hisobot qatoriga ega bo'lishi kerak
  UNIQUE(company_id, period)
);

-- 3. Indekslar (Tez ishlashi uchun)
CREATE INDEX IF NOT EXISTS idx_monthly_reports_company ON company_monthly_reports(company_id);
CREATE INDEX IF NOT EXISTS idx_monthly_reports_period ON company_monthly_reports(period);

-- 4. Kompaniyalar jadvaliga login/parol va buxgalter ismini qo'shish (Agar yo'q bo'lsa)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='accountant_name') THEN
    ALTER TABLE companies ADD COLUMN accountant_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='login') THEN
    ALTER TABLE companies ADD COLUMN login TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='password') THEN
    ALTER TABLE companies ADD COLUMN password TEXT;
  END IF;
END $$;

-- 5. Xavfsizlik qoidalari (RLS)
ALTER TABLE company_monthly_reports ENABLE ROW LEVEL SECURITY;

-- Barcha login qilgan foydalanuvchilar ko'ra oladi
CREATE POLICY "Authenticated users can view monthly reports"
  ON company_monthly_reports FOR SELECT
  USING (auth.role() = 'authenticated');

-- Faqat adminlar va managerlar o'zgartira oladi (yoki hamma o'zgartira olsin desangiz pastdagini ishlating)
CREATE POLICY "Users can insert/update monthly reports"
  ON company_monthly_reports FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 6. Trigger: Updated_at vaqtini avtomatik yangilash
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_company_monthly_reports_modtime
    BEFORE UPDATE ON company_monthly_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();