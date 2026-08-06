-- Operation modelini olib tashlash.
--
-- Jadvalda 0 qator bor edi va butun repo'da bironta yozuvchisi yo'q edi:
-- yagona o'quvchi dashboard plitkasi bo'lib, u har doim nol ko'rsatgan.
-- Uning o'rnini `Obligation` egalladi (Konstitutsiya, Modda 2 — yagona ish
-- birligi; ADR-0009).
--
-- ReportStatus enum'i faqat shu model tomonidan ishlatilgan, shuning uchun u
-- ham ketadi. `FinancialReport.status` alohida — u String, tegilmaydi.

DROP TABLE IF EXISTS "Operation";
DROP TYPE IF EXISTS "ReportStatus";
