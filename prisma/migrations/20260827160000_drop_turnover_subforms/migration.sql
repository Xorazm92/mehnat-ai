-- Aylanmadan olinadigan soliqning "foiz stavkasida" / "qat'iy summada" degan
-- ikki shakli amalda YO'Q — tanlagichga xato kiritilgan edi va filtrda uch xil
-- "aylanma" qatori paydo bo'lgandi. Mavjud yozuvlar bitta rejimga keltiriladi.
-- Enum qiymatlari o'chirilmaydi: eski migratsiyalar va zaxira nusxalari ularga
-- tayanadi, kod esa `normalizeTaxRegime` orqali baribir `turnover` ga o'giradi.
UPDATE "Company"
   SET "taxRegime" = 'turnover'
 WHERE "taxRegime" IN ('turnover_percent', 'turnover_fixed');
