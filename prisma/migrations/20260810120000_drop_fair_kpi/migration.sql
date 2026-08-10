-- Adolatli KPI (Fair KPI v2) olib tashlandi.
--
-- Faza E "shadow mode" qatlami hech qachon ishga tushmadi: `FairKpiScore` 0
-- qator, `Company.complexity` hech bir firmada standartdan boshqa qiymatga
-- o'rnatilmagan, `shadowMode` tufayli oylikka ta'siri ham yo'q edi. Ya'ni u
-- foydalanuvchi uchun yana bitta KPI ekrani bo'lib turgan, lekin ortida na
-- ma'lumot, na qaror bor edi. Amaldagi KPI (`KpiEvent`/`MonthlyPerformance`)
-- tegilmaydi.
--
-- Ma'lumot yo'qolmaydi: jadval bo'sh, `complexity` esa faqat shu hisob uchun
-- ishlatilardi.

DROP TABLE IF EXISTS "FairKpiScore";

ALTER TABLE "Company" DROP COLUMN IF EXISTS "complexity";

DROP TYPE IF EXISTS "CompanyComplexity";
