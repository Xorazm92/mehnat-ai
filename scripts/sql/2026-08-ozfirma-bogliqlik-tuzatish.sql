-- =====================================================================
-- TUZATISH: O'Z FIRMA BOG'LIQLIGINI QOLADIGAN QATORGA KO'CHIRISH
-- 2026-08-14
-- =====================================================================
-- NIMA BO'LDI
--   `2026-08-dublikat-va-bank-tozalash.sql` 10 ta dublikatni birlashtirdi:
--   eng yangi qator qoldi, eskisi `archived_duplicate` bo'ldi. Skript bog'liq
--   yozuvlarni ko'chirishda FAQAT `companyId` ustunini ko'zda tutgan edi.
--
--   Ammo 9 ta ESKI qator ASROning O'Z firmasi (`isOwnFirm = true`) edi va
--   ularga BOSHQA NOMDAGI ustunlar orqali ishora qilinadi:
--       Contract.ownFirmId               105 ta
--       DisbursementChannel.ownFirmId     28 ta
--       BankAccount.ownerCompanyId         9 ta
--       BankTransaction.matchedCompanyId   1 ta
--   Natijada bu yozuvlar arxivlangan firmaga qarab qoldi va `isOwnFirm`
--   bayrog'i ham arxiv bilan birga "yo'qoldi" — qoladigan qatorlarda u `false`.
--
-- NIMA QILADI
--   1. `isOwnFirm` bayrog'ini qoladigan qatorga ko'chiradi;
--   2. yuqoridagi to'rt ustunni arxivlangan qatordan qoladiganiga qaratadi;
--   3. arxivlangan qatorda `isOwnFirm` ni o'chiradi (bitta yuridik shaxs
--      ikki marta "o'z firma" bo'lib turmasin).
--
-- DIQQAT: `archived_left` (ketgan mijozlar) qatorlari tekshirildi — ularda
-- bunday ishora YO'Q, shuning uchun bu skript faqat `archived_duplicate` bilan
-- ishlaydi.
--
-- ISHLATISH:
--   psql "$DB" -v ON_ERROR_STOP=1 -v apply=0 -f .../2026-08-ozfirma-bogliqlik-tuzatish.sql
--   psql "$DB" -v ON_ERROR_STOP=1 -v apply=1 -f .../2026-08-ozfirma-bogliqlik-tuzatish.sql
-- =====================================================================

\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;

-- =====================================================================
-- 1. XARITA: arxivlangan qator → qoladigan qator (INN bo'yicha)
-- =====================================================================
CREATE TEMP TABLE _map ON COMMIT DROP AS
SELECT
  arx.id        AS eski_id,
  arx.name      AS eski_nom,
  arx."isOwnFirm" AS eski_ozfirma,
  yangi.id      AS yangi_id,
  yangi.name    AS yangi_nom,
  arx.inn
FROM "Company" arx
JOIN LATERAL (
  SELECT c.id, c.name FROM "Company" c
  WHERE c.inn = arx.inn AND c."isActive"
  ORDER BY c."createdAt" DESC
  LIMIT 1
) yangi ON true
WHERE arx."companyStatus" = 'archived_duplicate';

\echo ''
\echo '=== 1.1 Xarita ==='
SELECT inn, eski_nom AS arxivlangan, eski_ozfirma AS oz_firma, yangi_nom AS qoladigan FROM _map ORDER BY inn;

-- 1.2 Qo'riqchi: har bir arxivlangan qatorga aynan BITTA faol qator to'g'ri kelsin.
DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(format('%s (%s)', eski_nom, inn), ', ')
    INTO v_bad
  FROM _map WHERE yangi_id IS NULL OR yangi_id = eski_id;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Qoladigan qator topilmadi yoki o''zi bilan bir xil: %', v_bad;
  END IF;
END $$;

\echo ''
\echo '=== 1.3 Ko''chiriladigan ishoralar (o''zgarishdan OLDIN) ==='
SELECT 'Contract.ownFirmId'               AS ustun, count(*) FROM "Contract"            x JOIN _map m ON m.eski_id = x."ownFirmId"
UNION ALL SELECT 'DisbursementChannel.ownFirmId',    count(*) FROM "DisbursementChannel" x JOIN _map m ON m.eski_id = x."ownFirmId"
UNION ALL SELECT 'BankAccount.ownerCompanyId',       count(*) FROM "BankAccount"         x JOIN _map m ON m.eski_id = x."ownerCompanyId"
UNION ALL SELECT 'BankTransaction.matchedCompanyId', count(*) FROM "BankTransaction"     x JOIN _map m ON m.eski_id = x."matchedCompanyId"
ORDER BY 2 DESC;

-- =====================================================================
-- 2. `isOwnFirm` BAYROG'INI KO'CHIRISH
-- =====================================================================
-- Yuridik shaxs bitta — "o'z firma" bo'lish uning xususiyati, qaysi qatorda
-- yozilgani emas.
UPDATE "Company" c
SET "isOwnFirm" = true, "updatedAt" = now()
FROM _map m
WHERE c.id = m.yangi_id AND m.eski_ozfirma AND NOT c."isOwnFirm";

-- Arxivlangan qatorda bayroq qolmasin: aks holda `isOwnFirm` bo'yicha
-- so'rovlar bitta firmani ikki marta qaytaradi.
UPDATE "Company" c
SET "isOwnFirm" = false, "updatedAt" = now()
FROM _map m
WHERE c.id = m.eski_id AND c."isOwnFirm";

-- =====================================================================
-- 3. ISHORALARNI QOLADIGAN QATORGA QARATISH
-- =====================================================================
UPDATE "Contract" x
SET "ownFirmId" = m.yangi_id, "updatedAt" = now()
FROM _map m WHERE x."ownFirmId" = m.eski_id;

UPDATE "DisbursementChannel" x
SET "ownFirmId" = m.yangi_id
FROM _map m WHERE x."ownFirmId" = m.eski_id;

UPDATE "BankAccount" x
SET "ownerCompanyId" = m.yangi_id
FROM _map m WHERE x."ownerCompanyId" = m.eski_id;

UPDATE "BankTransaction" x
SET "matchedCompanyId" = m.yangi_id
FROM _map m WHERE x."matchedCompanyId" = m.eski_id;

-- =====================================================================
-- 4. TEKSHIRUV
-- =====================================================================
\echo ''
\echo '=== 4.1 QO''RIQ: arxivlangan qatorga qolgan ishora (hammasi 0 bo''lishi kerak) ==='
SELECT 'Contract.ownFirmId'               AS ustun, count(*) FROM "Contract"            x JOIN _map m ON m.eski_id = x."ownFirmId"
UNION ALL SELECT 'DisbursementChannel.ownFirmId',    count(*) FROM "DisbursementChannel" x JOIN _map m ON m.eski_id = x."ownFirmId"
UNION ALL SELECT 'BankAccount.ownerCompanyId',       count(*) FROM "BankAccount"         x JOIN _map m ON m.eski_id = x."ownerCompanyId"
UNION ALL SELECT 'BankTransaction.matchedCompanyId', count(*) FROM "BankTransaction"     x JOIN _map m ON m.eski_id = x."matchedCompanyId"
ORDER BY 1;

\echo ''
\echo '=== 4.2 O''z firmalar — hammasi FAOL bo''lishi kerak ==='
SELECT c.name, c.inn, c."isActive" AS faol, c."companyStatus",
       (SELECT count(*) FROM "Contract"            x WHERE x."ownFirmId"      = c.id) AS shartnoma,
       (SELECT count(*) FROM "DisbursementChannel" x WHERE x."ownFirmId"      = c.id) AS kanal,
       (SELECT count(*) FROM "BankAccount"         x WHERE x."ownerCompanyId" = c.id) AS bank_hisob
FROM "Company" c WHERE c."isOwnFirm" ORDER BY c."isActive" DESC, c.name;

\echo ''
\echo '=== 4.3 QO''RIQ: NOFAOL o''z firma qoldimi? (bo''sh bo''lishi kerak) ==='
SELECT name, inn, "companyStatus" FROM "Company" WHERE "isOwnFirm" AND NOT "isActive";

-- =====================================================================
-- 5. YAKUN
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
