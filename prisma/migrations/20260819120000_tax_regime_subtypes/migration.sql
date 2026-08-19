-- SOLIQ REJIMI: TO'LIQ TAKSONOMIYA (O'ZBEKISTON SOLIQ QONUNCHILIGI)
--
-- MUAMMO: `TaxRegime` enumi 5 qiymatdan iborat edi (vat, turnover, fixed,
-- yatt, income) — bu haqiqiy soliq rejimlarini to'liq aks ettirmaydi.
-- Xususan "Aylanmadan soliq" ikki xil to'lov shaklida bo'lishi mumkin
-- (foiz stavkasi / qat'iy summa), YaTT esa aylanmasiga qarab uch xil ichki
-- rejimda ishlaydi, va norezident/doimiy muassasalar uchun alohida tartib
-- bor. Eski `fixed`/`income` qiymatlari noaniq edi — ular endi YaTT ostiga
-- qat'iy ma'noli qiymatlar bilan almashtiriladi.
--
-- QO'SHIMCHA (ADDITIVE) MIGRATSIYA: eski qiymatlar (`vat`, `turnover`,
-- `fixed`, `yatt`, `income`) OLIB TASHLANMAYDI — mavjud firmalar va
-- majburiyat dvigateli (`reportApplicability.ts`, `taxRegime = 'vat'`/
-- `'turnover'` filtrlari) ular bilan ishlashda davom etadi.
-- `ALTER TYPE ... ADD VALUE` Postgres'da bitta trans blokida bir nechta
-- boshqa DDL bilan aralashmasligi kerak, shuning uchun bu migratsiya FAQAT
-- enumni kengaytiradi.

ALTER TYPE "TaxRegime" ADD VALUE IF NOT EXISTS 'turnover_percent';
ALTER TYPE "TaxRegime" ADD VALUE IF NOT EXISTS 'turnover_fixed';
ALTER TYPE "TaxRegime" ADD VALUE IF NOT EXISTS 'yatt_fixed';
ALTER TYPE "TaxRegime" ADD VALUE IF NOT EXISTS 'yatt_turnover';
ALTER TYPE "TaxRegime" ADD VALUE IF NOT EXISTS 'yatt_vat';
ALTER TYPE "TaxRegime" ADD VALUE IF NOT EXISTS 'nonresident';
