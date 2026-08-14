-- =====================================================================
-- FINFO INFO BEST — IKKI QATORNI BITTAGA BIRLASHTIRISH
-- 2026-08-14
-- =====================================================================
-- HOLAT
--   Bitta yuridik shaxs bazada ikki marta turibdi:
--
--   QOLADI  22faa9dd… "HOME SPOT STORY", INN 310844581 (haqiqiy)
--           isOwnFirm=true — 16 shartnoma (ownFirmId), 1 bank hisobi,
--           1 to'lov kanali; buxgalter yo'q, hisobot yo'q, 24 ta 'planned'
--           majburiyat.
--
--   KETADI  a3ce9b41… "FINFO INFO BEST", INN NO-STIR-004 (vaqtinchalik)
--           buxgalteriya ishi shu yerda: 4 biriktiruv (Ruslan/Go'zaloy/
--           Yorqinoy), 2026-08 hisoboti, 6 dalil, 2 ta 'accepted' majburiyat.
--
--   Firma tugatilib qayta ro'yxatdan o'tgan: nomi FINFO bo'lgan, INN qolgan.
--
-- QAROR (rahbariyat): HOME SPOT STORY qatori qoladi, nomi "FINFO INFO BEST"
-- bo'ladi. Sababi — o'z firma bog'liqliklari (shartnoma/bank/kanal) o'sha
-- qatorda va ularni ko'chirish eng katta xavf.
--
-- MAJBURIYATLAR ALOHIDA E'TIBOR TALAB QILADI
--   `Obligation` da UNIQUE (companyId, templateId, periodStart, periodEnd) bor
--   va IKKALA qatorda ham AYNAN SHU shablon+davr juftliklari mavjud. Ya'ni
--   ko'chirish cheklovni buzadi. Shuning uchun majburiyat KO'CHIRILMAYDI —
--   ketadigan qatordagi tugallangan holat qoladigan qatordagi MOS
--   majburiyatga KO'CHIRILADI (status, sana, mas'ul), keyin manbadagilari
--   bekor qilinadi. Natijada bajarilgan ish izi saqlanadi, dublikat hosil
--   bo'lmaydi.
--
-- ESLATMA: id'lar `_finfo` vaqtinchalik jadvalida. psql o'zgaruvchisi
-- (`:'qoladi'`) `DO $$…$$` bloki ICHIDA almashtirilmaydi — dollar-tirnoq
-- serverga xom holda uzatiladi — shuning uchun qo'riqchilar jadvaldan o'qiydi.
--
-- ISHLATISH:
--   psql "$DB" -v ON_ERROR_STOP=1 -v apply=0 -f .../2026-08-finfo-birlashtirish.sql
--   psql "$DB" -v ON_ERROR_STOP=1 -v apply=1 -f .../2026-08-finfo-birlashtirish.sql
-- =====================================================================

\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;

CREATE TEMP TABLE _finfo (qoladi text, ketadi text, yangi_nom text) ON COMMIT DROP;
INSERT INTO _finfo VALUES (
  '22faa9dd-eb3a-4b45-beed-038adf62e85f',  -- HOME SPOT STORY, INN 310844581
  'a3ce9b41-a2cb-4a9e-8e60-7c498e74c306',  -- FINFO INFO BEST, INN NO-STIR-004
  'FINFO INFO BEST'
);

-- =====================================================================
-- 1. QO'RIQCHILAR
-- =====================================================================

-- 1.1 Ikkala qator ham mavjud va FAOL bo'lsin. Skript qayta ishga tushirilsa
--     manba allaqachon arxivlangan bo'ladi va shu yerda to'xtaydi — bu ataylab,
--     chunki ikkinchi yugurish hisobotni qayta ko'chirmasligi kerak.
DO $$
DECLARE v_q int; v_k int; f record;
BEGIN
  SELECT * INTO f FROM _finfo;
  SELECT count(*) INTO v_q FROM "Company" WHERE id = f.qoladi AND "isActive";
  SELECT count(*) INTO v_k FROM "Company" WHERE id = f.ketadi AND "isActive";
  IF v_q <> 1 THEN RAISE EXCEPTION 'Qoladigan qator topilmadi yoki faol emas (%)', f.qoladi; END IF;
  IF v_k <> 1 THEN RAISE EXCEPTION 'Ketadigan qator topilmadi yoki allaqachon arxivlangan (%)', f.ketadi; END IF;
END $$;

-- 1.2 Qoladigan qatorda shu davr hisoboti bo'lmasin — aks holda manbadagini
--     ko'chirish UNIQUE (companyId, period) ni buzadi va ish jimgina yo'qoladi.
DO $$
DECLARE v_bad text; f record;
BEGIN
  SELECT * INTO f FROM _finfo;
  SELECT string_agg(m.period, ', ') INTO v_bad
  FROM "MonthlyReport" m
  WHERE m."companyId" = f.qoladi
    AND m.period IN (SELECT s.period FROM "MonthlyReport" s WHERE s."companyId" = f.ketadi);

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Ikkala qatorda ham shu davr hisoboti bor: % — qo''lda birlashtiring', v_bad;
  END IF;
END $$;

-- 1.3 Qoladigan qatorda faol biriktiruv bo'lmasin (manbadagilari ko'chiriladi,
--     ikkitasi qo'shilib qolsa firmada ikkita faol buxgalter bo'lardi).
DO $$
DECLARE v int; f record;
BEGIN
  SELECT * INTO f FROM _finfo;
  SELECT count(*) INTO v FROM "ContractAssignment" WHERE "companyId" = f.qoladi AND "isActive";
  IF v > 0 THEN
    RAISE EXCEPTION 'Qoladigan qatorda % ta faol biriktiruv bor — qo''lda ko''rib chiqing', v;
  END IF;
END $$;

\echo ''
\echo '=== 1.4 Boshlang''ich holat ==='
SELECT CASE WHEN c.id = f.qoladi THEN 'QOLADI' ELSE 'KETADI' END AS rol,
       c.name, c.inn, c."isOwnFirm" AS oz_firma, c."contractAmount" AS summa,
       a."fullName" AS bux, s."fullName" AS naz,
       (SELECT count(*) FROM "Obligation"    x WHERE x."companyId"=c.id) AS majb,
       (SELECT count(*) FROM "MonthlyReport" x WHERE x."companyId"=c.id) AS hisobot,
       (SELECT count(*) FROM "ReportProof"   x WHERE x."companyId"=c.id) AS dalil,
       (SELECT count(*) FROM "Contract"      x WHERE x."ownFirmId"=c.id) AS ozfirma_shartnoma
FROM "Company" c
CROSS JOIN _finfo f
LEFT JOIN "User" a ON a.id=c."accountantId"
LEFT JOIN "User" s ON s.id=c."supervisorId"
WHERE c.id IN (f.qoladi, f.ketadi) ORDER BY 1;

-- =====================================================================
-- 2. QOLADIGAN QATORNI TO'LDIRISH
-- =====================================================================
-- Nomi + buxgalteriya profili manbadan olinadi; INN, isOwnFirm va o'z firma
-- bog'liqliklari o'zgarmaydi. `COALESCE` — qoladigan qatordagi mavjud qiymat
-- ustunlik qiladi, faqat BO'SH joylar to'ldiriladi (nomdan tashqari).
UPDATE "Company" q
SET name                  = f.yangi_nom,
    "accountantId"        = COALESCE(q."accountantId",        k."accountantId"),
    "supervisorId"        = COALESCE(q."supervisorId",        k."supervisorId"),
    "chiefAccountantId"   = COALESCE(q."chiefAccountantId",   k."chiefAccountantId"),
    "bankClientId"        = COALESCE(q."bankClientId",        k."bankClientId"),
    "accountantPerc"      = COALESCE(q."accountantPerc",      k."accountantPerc"),
    "supervisorPerc"      = COALESCE(q."supervisorPerc",      k."supervisorPerc"),
    "chiefAccountantPerc" = COALESCE(q."chiefAccountantPerc", k."chiefAccountantPerc"),
    "bankClientPerc"      = COALESCE(q."bankClientPerc",      k."bankClientPerc"),
    "accountantSum"       = COALESCE(q."accountantSum",       k."accountantSum"),
    "supervisorSum"       = COALESCE(q."supervisorSum",       k."supervisorSum"),
    "chiefAccountantSum"  = COALESCE(q."chiefAccountantSum",  k."chiefAccountantSum"),
    "bankClientSum"       = COALESCE(q."bankClientSum",       k."bankClientSum"),
    "contractAmount"      = COALESCE(q."contractAmount",      k."contractAmount"),
    "departmentId"        = COALESCE(q."departmentId",        k."departmentId"),
    "taxRegime"           = k."taxRegime",
    notes = concat_ws(E'\n', NULLIF(q.notes, ''),
                      '2026-08-14: "FINFO INFO BEST" (NO-STIR-004) qatori shu yerga birlashtirildi. '
                      || 'Eski nom: HOME SPOT STORY (tugatilgan, INN saqlangan).'),
    "updatedAt" = now()
FROM _finfo f
JOIN "Company" k ON k.id = f.ketadi
WHERE q.id = f.qoladi;

-- =====================================================================
-- 3. BUXGALTERIYA IZINI KO'CHIRISH
-- =====================================================================
UPDATE "MonthlyReport" m SET "companyId" = f.qoladi FROM _finfo f WHERE m."companyId" = f.ketadi;
UPDATE "ReportProof"   p SET "companyId" = f.qoladi FROM _finfo f WHERE p."companyId" = f.ketadi;
UPDATE "ContractAssignment" ca SET "companyId" = f.qoladi FROM _finfo f WHERE ca."companyId" = f.ketadi;

-- =====================================================================
-- 4. MAJBURIYAT HOLATINI KO'ZGU QILISH
-- =====================================================================
-- KO'CHIRMAYMIZ (UNIQUE cheklovi) — mos majburiyatga holatni yozamiz.
-- Faqat OLDINGA: qoladigan qatordagi 'planned' majburiyat manbadagi
-- tugallangan holatni oladi. Teskarisi hech qachon sodir bo'lmaydi.
UPDATE "Obligation" q
SET status              = k.status,
    "sentAt"            = COALESCE(q."sentAt",            k."sentAt"),
    "acceptedAt"        = COALESCE(q."acceptedAt",        k."acceptedAt"),
    "completedAt"       = COALESCE(q."completedAt",       k."completedAt"),
    "responsibleUserId" = COALESCE(q."responsibleUserId", k."responsibleUserId"),
    "updatedAt"         = now()
FROM _finfo f
JOIN "Obligation" k ON k."companyId" = f.ketadi
WHERE q."companyId"  = f.qoladi
  AND q."templateId"  = k."templateId"
  AND q."periodStart" = k."periodStart"
  AND q."periodEnd"   = k."periodEnd"
  AND q.status = 'planned'
  AND k.status NOT IN ('planned', 'cancelled');

-- =====================================================================
-- 5. MANBANI ARXIVLASH
-- =====================================================================
UPDATE "Obligation" o
SET status = 'cancelled', "completedAt" = now(), "updatedAt" = now()
FROM _finfo f
WHERE o."companyId" = f.ketadi
  AND o.status IN ('planned', 'in_progress', 'ready', 'sent', 'rejected');

UPDATE "Company" c
SET "isActive" = false,
    "companyStatus" = 'archived_duplicate',
    "isOwnFirm" = false,
    "updatedAt" = now()
FROM _finfo f
WHERE c.id = f.ketadi;

-- =====================================================================
-- 6. TEKSHIRUV
-- =====================================================================
\echo ''
\echo '=== 6.1 Yakuniy holat ==='
SELECT CASE WHEN c.id = f.qoladi THEN 'QOLDI' ELSE 'ARXIV' END AS rol,
       c.name, c.inn, c."isActive" AS faol, c."companyStatus", c."isOwnFirm" AS oz_firma,
       c."contractAmount" AS summa,
       a."fullName" AS bux, s."fullName" AS naz, b."fullName" AS bank,
       (SELECT count(*) FROM "MonthlyReport" x WHERE x."companyId"=c.id) AS hisobot,
       (SELECT count(*) FROM "ReportProof"   x WHERE x."companyId"=c.id) AS dalil,
       (SELECT count(*) FROM "ContractAssignment" x WHERE x."companyId"=c.id AND x."isActive") AS biriktiruv,
       (SELECT count(*) FROM "Contract" x WHERE x."ownFirmId"=c.id) AS ozfirma_shartnoma
FROM "Company" c
CROSS JOIN _finfo f
LEFT JOIN "User" a ON a.id=c."accountantId"
LEFT JOIN "User" s ON s.id=c."supervisorId"
LEFT JOIN "User" b ON b.id=c."bankClientId"
WHERE c.id IN (f.qoladi, f.ketadi) ORDER BY 1;

\echo ''
\echo '=== 6.2 Majburiyat holati (bajarilgan ish saqlandimi) ==='
SELECT CASE WHEN o."companyId" = f.qoladi THEN 'QOLDI' ELSE 'ARXIV' END AS rol,
       o.status, count(*)
FROM "Obligation" o CROSS JOIN _finfo f
WHERE o."companyId" IN (f.qoladi, f.ketadi)
GROUP BY 1,2 ORDER BY 1,2;

\echo ''
\echo '=== 6.3 QO''RIQ: arxivlangan qatorga qolgan ishora (hammasi 0) ==='
SELECT 'MonthlyReport' AS joy, count(*) FROM "MonthlyReport" m, _finfo f WHERE m."companyId" = f.ketadi
UNION ALL SELECT 'ReportProof',         count(*) FROM "ReportProof" x, _finfo f        WHERE x."companyId" = f.ketadi
UNION ALL SELECT 'ContractAssignment',  count(*) FROM "ContractAssignment" x, _finfo f WHERE x."companyId" = f.ketadi
UNION ALL SELECT 'Contract.ownFirmId',  count(*) FROM "Contract" x, _finfo f           WHERE x."ownFirmId" = f.ketadi
UNION ALL SELECT 'Contract.companyId',  count(*) FROM "Contract" x, _finfo f           WHERE x."companyId" = f.ketadi
UNION ALL SELECT 'Payment',             count(*) FROM "Payment" x, _finfo f            WHERE x."companyId" = f.ketadi
UNION ALL SELECT 'BankAccount',         count(*) FROM "BankAccount" x, _finfo f        WHERE x."ownerCompanyId" = f.ketadi
UNION ALL SELECT 'DisbursementChannel', count(*) FROM "DisbursementChannel" x, _finfo f WHERE x."ownFirmId" = f.ketadi
ORDER BY 1;

\echo ''
\echo '=== 6.4 QO''RIQ: umumiy holat ==='
SELECT (SELECT count(*) FROM (SELECT inn FROM "Company" WHERE "isActive" GROUP BY inn HAVING count(*)>1) t) AS faol_dublikat,
       (SELECT count(*) FROM "Company" WHERE "isOwnFirm" AND NOT "isActive") AS nofaol_ozfirma,
       (SELECT count(*) FROM "Company" WHERE "isActive") AS jami_faol,
       (SELECT count(*) FROM "Company" WHERE "isOwnFirm") AS oz_firma,
       (SELECT count(*) FROM "Company" WHERE "isActive" AND "accountantId" IS NULL) AS buxgaltersiz;

-- =====================================================================
-- 7. YAKUN
-- =====================================================================
\if :apply
  \echo ''
  \echo '>>> COMMIT — o''zgarishlar bazaga yozildi.'
  COMMIT;
\else
  \echo ''
  \echo '>>> ROLLBACK — quruq ishlash, hech narsa yozilmadi.'
  \echo '>>> Yozish uchun: -v apply=1'
  ROLLBACK;
\endif
