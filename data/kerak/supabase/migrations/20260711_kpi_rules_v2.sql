-- =====================================================
-- KPI QOIDALARI V2 MIGRATSIYASI
-- Uch holat tizimi: bonus / neytral / jarima
-- Sana: 2026-07-11
-- =====================================================

-- 1. kpi_rules jadvaliga yangi ustunlar qo'shish
ALTER TABLE kpi_rules ADD COLUMN IF NOT EXISTS options JSONB DEFAULT '[]';
ALTER TABLE kpi_rules ADD COLUMN IF NOT EXISTS input_type_v2 TEXT DEFAULT 'select'
    CHECK (input_type_v2 IN ('select', 'counter', 'checkbox_bonus', 'checkbox_penalty', 'amount_penalty'));
ALTER TABLE kpi_rules ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'global'
    CHECK (scope IN ('global', 'per_company', 'per_group'));
ALTER TABLE kpi_rules ADD COLUMN IF NOT EXISTS max_bonus DECIMAL(6,2);
ALTER TABLE kpi_rules ADD COLUMN IF NOT EXISTS max_penalty DECIMAL(6,2);
ALTER TABLE kpi_rules ADD COLUMN IF NOT EXISTS description_uz TEXT;

-- 2. Eski qoidalarni o'chirish va yangilarini qo'shish
TRUNCATE TABLE kpi_rules RESTART IDENTITY CASCADE;

-- =====================================================
-- BUXGALTER QOIDALARI (20% + max 5% KPI)
-- =====================================================

INSERT INTO kpi_rules (name, name_uz, description_uz, role, input_type, input_type_v2, category, sort_order, scope, max_bonus, max_penalty, options) VALUES

('acc_attendance', 'Ishga kelish (08:30 gacha)', 
 'Har kuni 08:30 gacha kelish +0.04%/kun (max +1%). Uzrsiz 09:00 dan kech kelish har 5 daqiqa uchun -0.1%.',
 'accountant', 'counter', 'counter', 'attendance', 1, 'global', 1.0, NULL,
 '[
   {"key":"early_days","label_uz":"08:30 gacha kelgan kunlar","color":"green","coeff_per_unit":0.04,"max_coeff":1.0},
   {"key":"late_5min","label_uz":"Kechikkan har 5 daqiqa (09:00 dan)","color":"red","coeff_per_unit":-0.1,"max_coeff":null}
 ]'::jsonb),

('acc_group_response', 'Guruhda javob berish (10 daqiqa)',
 'Oy davomida uzluksiz 10 daqiqada javob berish. Topshiriq bajarish max 30 daqiqa.',
 'accountant', 'counter', 'select', 'communication', 2, 'per_company', 1.0, -0.5,
 '[
   {"key":"full","label_uz":"Oy davomida uzluksiz bajarildi","color":"green","coeff":1.0},
   {"key":"partial","label_uz":"Ba''zi holatlar o''tkazildi","color":"yellow","coeff":0.0},
   {"key":"failed","label_uz":"Tizimli kechikish — har saf -0.5%","color":"red","coeff":-0.5}
 ]'::jsonb),

('acc_1c_base', '1C Baza (o''tgan oy)',
 'O''tgan oyning 1C bazasi 5-sanagacha tayyor bo''lishi kerak.',
 'accountant', 'checkbox', 'select', 'automation', 3, 'per_company', 1.0, -1.0,
 '[
   {"key":"by_5th","label_uz":"5-sanagacha tayyor","color":"green","coeff":1.0},
   {"key":"by_15th","label_uz":"5–15 sana orasida tayyor","color":"yellow","coeff":0.0},
   {"key":"after_15th","label_uz":"15-dan keyin yoki yo''q","color":"red","coeff":-1.0}
 ]'::jsonb),

('acc_mehnat', 'my.mehnat.uz (xodimlar vaqtida)',
 'my.mehnat.uz da qabul qilingan/bo''shagan xodimlar vaqtida kiritilishi.',
 'accountant', 'checkbox', 'select', 'automation', 4, 'per_company', 0.33, -0.33,
 '[
   {"key":"ok","label_uz":"Hammasi vaqtida kiritildi","color":"green","coeff":0.33},
   {"key":"partial","label_uz":"Ba''zilari kechikdi","color":"yellow","coeff":0.0},
   {"key":"failed","label_uz":"Vaqtida kiritilmagan bor","color":"red","coeff":-0.33}
 ]'::jsonb),

('acc_didox', 'Didox.uz (shartnomalar, s/f)',
 'Didox.uz da sababsiz qabul qilinmagan shartnoma, s/f va boshqa hujjatlar yo''qligi.',
 'accountant', 'checkbox', 'select', 'automation', 5, 'per_company', 0.33, -0.33,
 '[
   {"key":"ok","label_uz":"Hammasi qabul qilindi","color":"green","coeff":0.33},
   {"key":"partial","label_uz":"Ba''zilari qoldi","color":"yellow","coeff":0.0},
   {"key":"failed","label_uz":"Qabul qilinmagan hujjatlar bor","color":"red","coeff":-0.33}
 ]'::jsonb),

('acc_soliq_xat', 'my.soliq.uz (xatlar va javoblar)',
 'my.soliq.uz da o''qilmagan va javob berilmagan xatlar yo''qligi.',
 'accountant', 'checkbox', 'select', 'automation', 6, 'per_company', 0.34, -0.34,
 '[
   {"key":"ok","label_uz":"Barcha xatlar o''qildi/javob berildi","color":"green","coeff":0.34},
   {"key":"partial","label_uz":"Ba''zilari qolgan","color":"yellow","coeff":0.0},
   {"key":"failed","label_uz":"O''qilmagan xatlar bor","color":"red","coeff":-0.34}
 ]'::jsonb),

('acc_cashflow', 'Pul oqimi hisoboti',
 'Pul oqimi hisoboti guruhga vaqtida yuborilishi.',
 'accountant', 'checkbox', 'select', 'reports', 10, 'per_company', 0.2, -0.2,
 '[
   {"key":"on_time","label_uz":"Vaqtida yuborildi","color":"green","coeff":0.2},
   {"key":"partial","label_uz":"Kechikib yuborildi","color":"yellow","coeff":0.0},
   {"key":"failed","label_uz":"Yuborilmadi","color":"red","coeff":-0.2}
 ]'::jsonb),

('acc_debitor', 'Debitor-kreditor hisoboti',
 'Debitor-kreditor hisoboti guruhga vaqtida yuborilishi.',
 'accountant', 'checkbox', 'select', 'reports', 11, 'per_company', 0.2, -0.2,
 '[
   {"key":"on_time","label_uz":"Vaqtida yuborildi","color":"green","coeff":0.2},
   {"key":"partial","label_uz":"Kechikib yuborildi","color":"yellow","coeff":0.0},
   {"key":"failed","label_uz":"Yuborilmadi","color":"red","coeff":-0.2}
 ]'::jsonb),

('acc_taxes_report', 'Soliqlar hisobi',
 'Soliqlar hisobi guruhga vaqtida yuborilishi va soliqlar o''z vaqtida to''langan bo''lishi.',
 'accountant', 'checkbox', 'select', 'reports', 12, 'per_company', 0.2, -0.2,
 '[
   {"key":"on_time","label_uz":"Vaqtida to''landi va yuborildi","color":"green","coeff":0.2},
   {"key":"partial","label_uz":"Kechikdi","color":"yellow","coeff":0.0},
   {"key":"failed","label_uz":"To''lanmadi yoki yuborilmadi","color":"red","coeff":-0.2}
 ]'::jsonb),

('acc_payroll_report', 'Ish haqi rasчёти',
 'Ish haqi rasчёти hisoboti guruhga vaqtida yuborilishi.',
 'accountant', 'checkbox', 'select', 'reports', 13, 'per_company', 0.2, -0.2,
 '[
   {"key":"on_time","label_uz":"Vaqtida yuborildi","color":"green","coeff":0.2},
   {"key":"partial","label_uz":"Kechikib yuborildi","color":"yellow","coeff":0.0},
   {"key":"failed","label_uz":"Yuborilmadi","color":"red","coeff":-0.2}
 ]'::jsonb),

('acc_pnl_report', 'Foyda va zarar hisoboti',
 'Foyda va zarar hisoboti guruhga vaqtida yuborilishi.',
 'accountant', 'checkbox', 'select', 'reports', 14, 'per_company', 0.1, -0.1,
 '[
   {"key":"on_time","label_uz":"Vaqtida yuborildi","color":"green","coeff":0.1},
   {"key":"partial","label_uz":"Kechikib yuborildi","color":"yellow","coeff":0.0},
   {"key":"failed","label_uz":"Yuborilmadi","color":"red","coeff":-0.1}
 ]'::jsonb),

('acc_materials_report', 'Material hisobotlari',
 'Material hisobotlari guruhga vaqtida yuborilishi.',
 'accountant', 'checkbox', 'select', 'reports', 15, 'per_company', 0.1, -0.1,
 '[
   {"key":"on_time","label_uz":"Vaqtida yuborildi","color":"green","coeff":0.1},
   {"key":"partial","label_uz":"Kechikib yuborildi","color":"yellow","coeff":0.0},
   {"key":"failed","label_uz":"Yuborilmadi","color":"red","coeff":-0.1}
 ]'::jsonb),

('acc_critical_error', 'Tuzatib bo''lmaydigan xato',
 'Firmaga tuzatib bo''lmaydigan zarar keltiruvchi xatolar.',
 'accountant', 'checkbox', 'checkbox_penalty', 'penalty_only', 16, 'per_company', 0.0, -1.0,
 '[
   {"key":"none","label_uz":"Xato yo''q","color":"green","coeff":0.0},
   {"key":"occurred","label_uz":"Xato bo''ldi","color":"red","coeff":-1.0}
 ]'::jsonb),

('acc_absence', 'Ish kuni kelmay qolish (uzrsiz)',
 'Uzrsiz kelmagan har kun uchun -1%. O''sha kunda ish qilgan nazoratchi maoshiga qo''shiladi.',
 'accountant', 'counter', 'counter', 'attendance', 17, 'global', 0.0, NULL,
 '[
   {"key":"absent_days","label_uz":"Kelmagan kunlar soni","color":"red","coeff_per_unit":-1.0,"max_coeff":null}
 ]'::jsonb),

-- =====================================================
-- BANK-KLIENT QOIDALARI (5% + max 2.5% KPI)
-- =====================================================

('bank_attendance', 'Ishga kelish (08:30 gacha)',
 'Har kuni 08:30 gacha kelish +0.04%/kun (max +1%). Uzrsiz 09:00 dan kech kelish har 5 daqiqa uchun -0.2%.',
 'bank_client', 'counter', 'counter', 'attendance', 30, 'global', 1.0, NULL,
 '[
   {"key":"early_days","label_uz":"08:30 gacha kelgan kunlar","color":"green","coeff_per_unit":0.04,"max_coeff":1.0},
   {"key":"late_5min","label_uz":"Kechikkan har 5 daqiqa (09:00 dan)","color":"red","coeff_per_unit":-0.2,"max_coeff":null}
 ]'::jsonb),

('bank_group_response', 'Guruhda javob berish (5 daqiqa)',
 'Oy davomida uzluksiz 5 daqiqada javob berish. Topshiriq max 30 daqiqa (Swift bundan mustasno).',
 'bank_client', 'counter', 'select', 'communication', 31, 'per_company', 1.0, -0.5,
 '[
   {"key":"full","label_uz":"Oy davomida uzluksiz bajarildi","color":"green","coeff":1.0},
   {"key":"partial","label_uz":"Ba''zi holatlar o''tkazildi","color":"yellow","coeff":0.0},
   {"key":"failed","label_uz":"Tizimli kechikish — har saf -0.5%","color":"red","coeff":-0.5}
 ]'::jsonb),

('bank_personal_resp', 'Shaxsiy mas''uliyat (bosh hisob-kitobchi tavsiyasi)',
 'Vypisklarni vaqtida olish, muammoga yechim topish, buxgalter bilan aloqa. Bosh hisob-kitobchi tavsiya etadi.',
 'bank_client', 'checkbox', 'checkbox_bonus', 'bonus_only', 32, 'global', 0.5, 0.0,
 '[
   {"key":"recommended","label_uz":"Bosh hisob-kitobchi tavsiyasi bor","color":"green","coeff":0.5},
   {"key":"not_given","label_uz":"Tavsiya berilmagan","color":"yellow","coeff":0.0}
 ]'::jsonb),

('bank_wrong_transfer', 'Noto''g''ri pul o''tkazma',
 'Noto''g''ri pul o''tkazma uchun xatoni bartaraf etish uchun ketgan xarajat miqdorida jarima.',
 'bank_client', 'number', 'amount_penalty', 'penalty_only', 33, 'per_company', 0.0, NULL,
 '[
   {"key":"no_error","label_uz":"Xato yo''q","color":"green","coeff":0.0},
   {"key":"error_amount","label_uz":"Xato miqdori (so''mda)","color":"red","coeff":null,"note":"Qo''lda summa kiritiladi"}
 ]'::jsonb),

('bank_absence', 'Ish kuni kelmay qolish (uzrsiz)',
 'Uzrsiz kelmagan har kun uchun -0.25%. O''sha kunda ish qilgan xodimga o''tkaziladi.',
 'bank_client', 'counter', 'counter', 'attendance', 34, 'global', 0.0, NULL,
 '[
   {"key":"absent_days","label_uz":"Kelmagan kunlar soni","color":"red","coeff_per_unit":-0.25,"max_coeff":null}
 ]'::jsonb),

-- =====================================================
-- NAZORATCHI QOIDALARI (5% + max 1% KPI)
-- =====================================================

('sup_group_response', 'Guruhda javob berish (5-10 daqiqa)',
 'Buxgalter va bank-klient bilan birga 5-10 daqiqada javob berish reglamentini ushlab turish.',
 'supervisor', 'checkbox', 'select', 'communication', 50, 'per_group', 0.5, -0.5,
 '[
   {"key":"full","label_uz":"Oy davomida ushlab turildi","color":"green","coeff":0.5},
   {"key":"partial","label_uz":"Ba''zi o''tkazishlar bo''ldi","color":"yellow","coeff":0.0},
   {"key":"failed","label_uz":"Tizimli muammolar","color":"red","coeff":-0.5}
 ]'::jsonb),

('sup_reports_deadline', 'Oy/kvartal hisobotlar 12 va 18-sanada',
 'Oylik hisobotlar 12-sanada, kvartal hisobotlar 18-sanada tugallanishi kerak.',
 'supervisor', 'checkbox', 'select', 'reports', 51, 'per_group', 0.5, -0.5,
 '[
   {"key":"on_time","label_uz":"12/18-sanada tugatildi","color":"green","coeff":0.5},
   {"key":"partial","label_uz":"Ba''zilari kechikdi","color":"yellow","coeff":0.0},
   {"key":"late","label_uz":"Ko''pchiligi kechikdi","color":"red","coeff":-0.5}
 ]'::jsonb),

('sup_tax_reports', 'Guruhda soliqlar va hisobotlar vaqtida',
 'Guruhidagi firmalarda soliqlar to''lanmasa yoki hisobotlar kechiksa jarima.',
 'supervisor', 'checkbox', 'select', 'reports', 52, 'per_group', 0.0, -0.5,
 '[
   {"key":"all_ok","label_uz":"Hammasi vaqtida","color":"green","coeff":0.0},
   {"key":"failed","label_uz":"Guruhda kechikish bo''ldi","color":"red","coeff":-0.5}
 ]'::jsonb),

('sup_attendance', 'Ishga kelish (09:00 gacha)',
 'Uzrsiz 09:00 dan kech kelish: har 5 daqiqa uchun -0.1%.',
 'supervisor', 'counter', 'counter', 'attendance', 53, 'global', 0.0, NULL,
 '[
   {"key":"late_5min","label_uz":"Kechikkan har 5 daqiqa","color":"red","coeff_per_unit":-0.1,"max_coeff":null}
 ]'::jsonb),

('sup_unresolved', 'Muammolarni yechimisiz qoldirish',
 'Guruhida vaqtida javob bermaslik yoki muammolarni yechimisiz qoldirish.',
 'supervisor', 'checkbox', 'select', 'communication', 54, 'per_group', 0.0, -0.5,
 '[
   {"key":"all_resolved","label_uz":"Barcha muammolar hal qilindi","color":"green","coeff":0.0},
   {"key":"some_pending","label_uz":"Ba''zilari yechilmadi","color":"red","coeff":-0.5}
 ]'::jsonb),

('sup_absence', 'Ish kuni kelmay qolish (uzrsiz)',
 'Uzrsiz kelmagan har kun uchun -0.25%. O''sha kunda ish qilgan bosh hisob-kitobchiga o''tkaziladi.',
 'supervisor', 'counter', 'counter', 'attendance', 55, 'global', 0.0, NULL,
 '[
   {"key":"absent_days","label_uz":"Kelmagan kunlar soni","color":"red","coeff_per_unit":-0.25,"max_coeff":null}
 ]'::jsonb)

ON CONFLICT (name) DO UPDATE SET
  name_uz = EXCLUDED.name_uz,
  description_uz = EXCLUDED.description_uz,
  input_type_v2 = EXCLUDED.input_type_v2,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order,
  scope = EXCLUDED.scope,
  max_bonus = EXCLUDED.max_bonus,
  max_penalty = EXCLUDED.max_penalty,
  options = EXCLUDED.options,
  updated_at = NOW();

-- =====================================================
-- 3. monthly_performance ga yangi ustun: selected_option
-- Nazoratchi "select" dan qaysi variantni tanlagani
-- =====================================================
ALTER TABLE monthly_performance ADD COLUMN IF NOT EXISTS selected_option TEXT;
ALTER TABLE monthly_performance ADD COLUMN IF NOT EXISTS late_minutes INTEGER DEFAULT 0;
ALTER TABLE monthly_performance ADD COLUMN IF NOT EXISTS absent_days INTEGER DEFAULT 0;
ALTER TABLE monthly_performance ADD COLUMN IF NOT EXISTS penalty_amount DECIMAL(12,2) DEFAULT 0;

-- =====================================================
-- 4. KPI holat view — UI uchun qulay ko'rinish
-- =====================================================
CREATE OR REPLACE VIEW kpi_rules_summary AS
SELECT
  id,
  name,
  name_uz,
  description_uz,
  role,
  category,
  input_type_v2,
  scope,
  max_bonus,
  max_penalty,
  options,
  sort_order,
  is_active
FROM kpi_rules
WHERE is_active = true
ORDER BY role, sort_order;

COMMENT ON VIEW kpi_rules_summary IS 'KPI qoidalari — UI uchun uchun uch holat tizimi bilan';

-- =====================================================
-- 5. Maosh hisoblash funksiyasini yangilash
-- options asosida coeff olish
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_kpi_score_v2(
  p_rule_id UUID,
  p_selected_option TEXT,
  p_counter_value INTEGER DEFAULT 0,
  p_base DECIMAL DEFAULT 0
)
RETURNS DECIMAL AS $$
DECLARE
  v_rule kpi_rules%ROWTYPE;
  v_options JSONB;
  v_option JSONB;
  v_coeff DECIMAL := 0;
  v_coeff_per_unit DECIMAL := 0;
  v_max_coeff DECIMAL;
BEGIN
  SELECT * INTO v_rule FROM kpi_rules WHERE id = p_rule_id;
  v_options := v_rule.options;

  -- Counter turi: early_days yoki late_5min
  IF v_rule.input_type_v2 = 'counter' THEN
    FOR v_option IN SELECT * FROM jsonb_array_elements(v_options)
    LOOP
      IF v_option->>'key' = p_selected_option THEN
        v_coeff_per_unit := (v_option->>'coeff_per_unit')::DECIMAL;
        IF v_option->>'max_coeff' IS NOT NULL THEN
          v_max_coeff := (v_option->>'max_coeff')::DECIMAL;
          v_coeff := LEAST(p_counter_value * v_coeff_per_unit, v_max_coeff);
        ELSE
          v_coeff := p_counter_value * v_coeff_per_unit;
        END IF;
        RETURN ROUND(v_coeff * p_base / 100, 2);
      END IF;
    END LOOP;
  END IF;

  -- Select / checkbox turi: coeff to'g'ridan-to'g'ri
  FOR v_option IN SELECT * FROM jsonb_array_elements(v_options)
  LOOP
    IF v_option->>'key' = p_selected_option THEN
      IF v_option->>'coeff' IS NOT NULL THEN
        v_coeff := (v_option->>'coeff')::DECIMAL;
        RETURN ROUND(v_coeff * p_base / 100, 2);
      END IF;
    END IF;
  END LOOP;

  RETURN 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION calculate_kpi_score_v2 IS 'V2 KPI: tanlangan holat va counter asosida hisoblash';
