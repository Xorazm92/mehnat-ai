-- Soddalashtirilgan QQS to'lovchi rejimi: oborotdan 6% QQS, foyda solig'i yo'q.
-- ALTER TYPE ... ADD VALUE alohida migratsiyada bo'lishi kerak (boshqa DDL bilan
-- bitta trans blokida aralashmaydi) — 20260819120000_tax_regime_subtypes bilan bir xil sabab.

ALTER TYPE "TaxRegime" ADD VALUE IF NOT EXISTS 'simplified_vat';
