-- =====================================================================
-- DUBLIKAT FIRMALARNI BIRLASHTIRISH + BANK-KLIENT SLOTINI BO'SHATISH
-- 2026-08-14
-- =====================================================================
-- Portfel qayta taqsimlashdan (2026-08-portfel-qayta-taqsimlash.sql) keyin
-- qolgan uchta ish.
--
--   A) 10 ta dublikat firmani birlashtirish.
--      Prodda 10 ta INN ikki marta uchraydi. Naqsh bir xil: firma 06/07-oyda
--      yaratilgan, keyin 11.08.2026 da QAYTADAN yaratilgan (tahrirlash o'rniga).
--      Tekshiruv natijasi:
--        * ESKI qatorlar: 230 ta majburiyat, HAMMASI 'planned' — ya'ni ular
--          ustida hech qanday ish qilinmagan; hisobot va dalil ham yo'q;
--        * YANGI qatorlar: 15 tasdiqlangan + 9 yuborilgan + 1 rad etilgan
--          majburiyat, 10 ta hisobot, 60+ dalil — butun ish shu yerda.
--      Shuning uchun YANGI qator qoladi, ESKISI arxivlanadi. Yagona istisno —
--      AVVITAL'ning eski qatoridagi to'lov va shartnoma: ular yo'qolmasligi
--      uchun avval yangi qatorga KO'CHIRILADI.
--
--   B) AVVITAL NATURALS nazoratchisini to'g'rilash.
--      Yangi qatorni yaratgan odam nazoratchi qilib Muslimbekni qo'ygan —
--      izohdagi "Muslimbekdan olasiz" (u BUXGALTER edi) noto'g'ri tushunilgan.
--      Uch "singlisi" (BADEX LIFE, MAX NUTRITION, VITAMIN PHARM SERVIS) da
--      nazoratchi Go'zaloy, AVVITAL ham shunday bo'lishi kerak.
--
--   C) AMIRBEK-RUXSHONA PHARM va NIGINA FARM da bank-klient sloti bo'shatiladi.
--      Ikkalasida ham Zamira turgan edi; rahbariyat qarori — bo'sh qolsin.
--
-- ISHLATISH (portfel skripti bilan bir xil):
--   psql "$DB" -v ON_ERROR_STOP=1 -v apply=0 -f .../2026-08-dublikat-va-bank-tozalash.sql
--   psql "$DB" -v ON_ERROR_STOP=1 -v apply=1 -f .../2026-08-dublikat-va-bank-tozalash.sql
--
-- QAYTA ISHGA TUSHIRISH XAVFSIZ: arxivlangan qator dublikat qidiruviga
-- tushmaydi (faqat faol qatorlar solishtiriladi), qolgan UPDATE'lar idempotent.
-- =====================================================================

\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;

-- =====================================================================
-- 1. DUBLIKAT JUFTLIKLARNI ANIQLASH
-- =====================================================================
-- ATAYLAB faqat FAOL qatorlar solishtiriladi — shu sabab skript qayta
-- ishga tushirilganda allaqachon arxivlangan qator ikkinchi marta tanlanmaydi.
CREATE TEMP TABLE _juft ON COMMIT DROP AS
WITH dup AS (
  SELECT inn FROM "Company" WHERE "isActive" GROUP BY inn HAVING count(*) > 1
)
SELECT
  d.inn,
  (SELECT c.id   FROM "Company" c WHERE c.inn = d.inn AND c."isActive" ORDER BY c."createdAt" DESC LIMIT 1) AS qoladi_id,
  (SELECT c.name FROM "Company" c WHERE c.inn = d.inn AND c."isActive" ORDER BY c."createdAt" DESC LIMIT 1) AS qoladi_nom,
  (SELECT c.id   FROM "Company" c WHERE c.inn = d.inn AND c."isActive" ORDER BY c."createdAt" ASC  LIMIT 1) AS ketadi_id,
  (SELECT c.name FROM "Company" c WHERE c.inn = d.inn AND c."isActive" ORDER BY c."createdAt" ASC  LIMIT 1) AS ketadi_nom
FROM dup d;

\echo ''
\echo '=== 1.1 Topilgan dublikatlar ==='
SELECT inn, ketadi_nom AS arxivlanadi, qoladi_nom AS qoladi FROM _juft ORDER BY inn;

-- =====================================================================
-- 2. QO'RIQCHILAR
-- =====================================================================

-- 2.1 Har bir INN aynan IKKI marta bo'lsin. Uchtasi bo'lsa yuqoridagi
--     "eng eski / eng yangi" mantiq o'rtadagini jimgina qoldirib ketardi.
DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(format('%s → %s ta faol yozuv', inn, cnt), E'\n    ')
    INTO v_bad
  FROM (
    SELECT inn, count(*) AS cnt FROM "Company" WHERE "isActive" GROUP BY inn HAVING count(*) > 2
  ) t;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION E'INN ikkitadan ko''p takrorlangan — qo''lda ko''rib chiqing:\n    %', v_bad;
  END IF;
END $$;

-- 2.2 ARXIVLANADIGAN qatorda YO'QOTIB BO'LMAYDIGAN ish bo'lmasin.
--     Ya'ni: tugallangan majburiyat, hisobot yoki dalil. Ular bo'lsa "eng
--     yangisini qoldirish" qoidasi noto'g'ri bo'ladi va birlashtirishni qo'lda
--     ko'rib chiqish kerak. (To'lov va shartnoma bu ro'yxatda YO'Q — ular
--     4-bo'limda ko'chiriladi.)
DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(
           format('%s (%s): %s ta tugallangan majburiyat, %s hisobot, %s dalil',
                  j.ketadi_nom, j.inn, k.tugallangan, k.hisobot, k.dalil),
           E'\n    ')
    INTO v_bad
  FROM _juft j
  CROSS JOIN LATERAL (
    SELECT
      (SELECT count(*) FROM "Obligation" o
        WHERE o."companyId" = j.ketadi_id
          AND o.status NOT IN ('planned', 'cancelled')) AS tugallangan,
      (SELECT count(*) FROM "MonthlyReport" m WHERE m."companyId" = j.ketadi_id) AS hisobot,
      (SELECT count(*) FROM "ReportProof"   p WHERE p."companyId" = j.ketadi_id) AS dalil
  ) k
  WHERE k.tugallangan > 0 OR k.hisobot > 0 OR k.dalil > 0;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION E'Arxivlanadigan qatorda ish izi bor — qo''lda ko''rib chiqing:\n    %', v_bad;
  END IF;
END $$;

-- 2.3 Kerakli xodimlar bor bo'lsin (B bo'limi uchun).
DO $$
BEGIN
  IF (SELECT count(*) FROM "User" WHERE "fullName" = 'Go''zaloy' AND "isActive") <> 1 THEN
    RAISE EXCEPTION 'Go''zaloy topilmadi yoki bittadan ko''p';
  END IF;
END $$;

-- =====================================================================
-- 3. ARXIVLANADIGAN QATORDAGI PUL YOZUVLARINI KO'CHIRISH
-- =====================================================================
-- To'lov va shartnoma firmaning MOLIYAVIY tarixi: ular arxivlangan qatorda
-- qolsa, balans va qarzdorlik hisobidan tushib qoladi. Shuning uchun avval
-- qoladigan qatorga o'tkaziladi.
--
-- Payment'da UNIQUE (companyId, period) bor — qoladigan qatorda o'sha davr
-- uchun to'lov bo'lsa ko'chirish yiqilardi. `NOT EXISTS` shuni oldini oladi;
-- ko'chirilmay qolganlari 6-bo'limdagi tekshiruvda ko'rinadi.
UPDATE "Payment" p
SET "companyId" = j.qoladi_id, "updatedAt" = now()
FROM _juft j
WHERE p."companyId" = j.ketadi_id
  AND NOT EXISTS (
    SELECT 1 FROM "Payment" q
    WHERE q."companyId" = j.qoladi_id AND q.period = p.period
  );

UPDATE "Contract" ct
SET "companyId" = j.qoladi_id, "updatedAt" = now()
FROM _juft j
WHERE ct."companyId" = j.ketadi_id;

-- Qolgan bog'liq jadvallar: dublikatlarda ular bo'sh (tekshirildi), lekin
-- kelajakda bo'lsa ham yo'qolmasin.
UPDATE "KassaEntry"   x SET "companyId" = j.qoladi_id FROM _juft j WHERE x."companyId" = j.ketadi_id;
UPDATE "DebtSnapshot" x SET "companyId" = j.qoladi_id FROM _juft j WHERE x."companyId" = j.ketadi_id;
UPDATE "Task"         x SET "companyId" = j.qoladi_id FROM _juft j WHERE x."companyId" = j.ketadi_id;

-- =====================================================================
-- 4. ESKI QATORNI ARXIVLASH
-- =====================================================================
-- `archived_duplicate` — scripts/dedupe-companies.ts dagi bilan bir xil sabab.
UPDATE "Company" c
SET "isActive" = false,
    "companyStatus" = 'archived_duplicate',
    "updatedAt" = now()
FROM _juft j
WHERE c.id = j.ketadi_id;

UPDATE "Obligation" o
SET status = 'cancelled', "completedAt" = now(), "updatedAt" = now()
FROM _juft j
WHERE o."companyId" = j.ketadi_id
  AND o.status IN ('planned', 'in_progress', 'ready', 'sent', 'rejected');

UPDATE "ContractAssignment" ca
SET "isActive" = false, "endDate" = now()
FROM _juft j
WHERE ca."companyId" = j.ketadi_id AND ca."isActive";

-- =====================================================================
-- 5. B — AVVITAL NATURALS NAZORATCHISI → GO'ZALOY
-- =====================================================================
-- Qoladigan qatorda nazoratchi Muslimbek turibdi. Lekin izohda Muslimbek
-- BUXGALTER edi ("Muslimbekdan olasiz"), nazoratchi esa Go'zaloy — uch
-- singlisida ham shunday.
UPDATE "Company" c
SET "supervisorId" = g.id, "updatedAt" = now()
FROM (SELECT id FROM "User" WHERE "fullName" = 'Go''zaloy' AND "isActive") g
WHERE c.inn = '311824130'
  AND c."isActive"
  AND c."supervisorId" IS DISTINCT FROM g.id;

UPDATE "ContractAssignment" ca
SET "isActive" = false, "endDate" = now()
FROM "Company" c, (SELECT id FROM "User" WHERE "fullName" = 'Go''zaloy' AND "isActive") g
WHERE ca."companyId" = c.id
  AND c.inn = '311824130' AND c."isActive"
  AND ca."isActive"
  AND ca.role IN ('controller', 'supervisor')
  AND ca."userId" <> g.id;

INSERT INTO "ContractAssignment" (id, "companyId", "userId", role, "salaryType", "salaryValue", "startDate", "isActive", "createdAt")
SELECT gen_random_uuid(), c.id, g.id, 'controller',
       COALESCE(old."salaryType", 'percent'), COALESCE(old."salaryValue", 5.00),
       now(), true, now()
FROM "Company" c
CROSS JOIN (SELECT id FROM "User" WHERE "fullName" = 'Go''zaloy' AND "isActive") g
LEFT JOIN LATERAL (
  SELECT x."salaryType", x."salaryValue" FROM "ContractAssignment" x
  WHERE x."companyId" = c.id AND x.role IN ('controller', 'supervisor')
  ORDER BY x."isActive" DESC, x."createdAt" DESC LIMIT 1
) old ON true
WHERE c.inn = '311824130' AND c."isActive"
  AND NOT EXISTS (
    SELECT 1 FROM "ContractAssignment" x
    WHERE x."companyId" = c.id AND x."userId" = g.id
      AND x.role IN ('controller', 'supervisor') AND x."isActive"
  );

-- =====================================================================
-- 6. C — BANK-KLIENT SLOTINI BO'SHATISH
-- =====================================================================
-- AMIRBEK-RUXSHONA PHARM (303328933) va NIGINA FARM (205150295) da Zamira
-- turgan edi. Rahbariyat qarori: slot bo'sh qolsin.
--
-- `bankClientName` ham tozalanadi. Sababi: lib/kpiLogic.ts:350 va
-- PayrollTable bo'sh `bankClientId` da NOM bo'yicha moslashtiradi
-- (`!c.bankClientId && c.bankClientName === ...`). Faqat id'ni tozalasak,
-- Zamira NIGINA FARM'dan 300 000 so'mni NOM orqali olishda davom etardi.
--
-- `bankClientPerc` / `bankClientSum` ATAYLAB TEGILMAYDI — ular slotning
-- TARIFI, egasi emas. Yangi odam biriktirilganda shart tayyor turadi.
UPDATE "Company" c
SET "bankClientId" = NULL,
    "bankClientName" = NULL,
    "updatedAt" = now()
WHERE c.inn IN ('303328933', '205150295')
  AND (c."bankClientId" IS NOT NULL OR c."bankClientName" IS NOT NULL);

UPDATE "ContractAssignment" ca
SET "isActive" = false, "endDate" = now()
FROM "Company" c
WHERE ca."companyId" = c.id
  AND c.inn IN ('303328933', '205150295')
  AND ca."isActive"
  AND ca.role IN ('bank_manager', 'bank_client');

-- =====================================================================
-- 7. TEKSHIRUV
-- =====================================================================
\echo ''
\echo '=== 7.1 Birlashtirish natijasi ==='
SELECT j.inn,
       j.ketadi_nom AS arxivlandi,
       (SELECT c."companyStatus" FROM "Company" c WHERE c.id = j.ketadi_id) AS holat,
       j.qoladi_nom AS qoldi,
       (SELECT count(*) FROM "Payment"  x WHERE x."companyId" = j.qoladi_id) AS tolov,
       (SELECT count(*) FROM "Contract" x WHERE x."companyId" = j.qoladi_id) AS shartnoma,
       (SELECT count(*) FROM "Obligation" o WHERE o."companyId" = j.ketadi_id AND o.status = 'cancelled') AS bekor
FROM _juft j ORDER BY j.inn;

\echo ''
\echo '=== 7.2 QO''RIQ: faol firmalar orasida dublikat qoldimi? (bo''sh bo''lishi kerak) ==='
SELECT inn, count(*) FROM "Company" WHERE "isActive" GROUP BY inn HAVING count(*) > 1;

\echo ''
\echo '=== 7.3 QO''RIQ: arxivlangan qatorda ko''chirilmagan pul yozuvi qoldimi? ==='
SELECT j.ketadi_nom,
       (SELECT count(*) FROM "Payment"  x WHERE x."companyId" = j.ketadi_id) AS tolov,
       (SELECT count(*) FROM "Contract" x WHERE x."companyId" = j.ketadi_id) AS shartnoma
FROM _juft j
WHERE (SELECT count(*) FROM "Payment"  x WHERE x."companyId" = j.ketadi_id) > 0
   OR (SELECT count(*) FROM "Contract" x WHERE x."companyId" = j.ketadi_id) > 0;

\echo ''
\echo '=== 7.4 AVVITAL yakuniy holati ==='
SELECT c.name, c.inn, c."isActive" AS faol, c."companyStatus",
       a."fullName" AS bux, s."fullName" AS naz, b."fullName" AS bank,
       (SELECT count(*) FROM "Payment" x WHERE x."companyId" = c.id) AS tolov,
       (SELECT count(*) FROM "ContractAssignment" x WHERE x."companyId" = c.id AND x."isActive") AS biriktiruv
FROM "Company" c
LEFT JOIN "User" a ON a.id = c."accountantId"
LEFT JOIN "User" s ON s.id = c."supervisorId"
LEFT JOIN "User" b ON b.id = c."bankClientId"
WHERE c.inn = '311824130' ORDER BY c."createdAt";

\echo ''
\echo '=== 7.5 Bank-kliyenti bo''shatilgan firmalar ==='
SELECT c.name, c.inn, b."fullName" AS bank_klient, c."bankClientName",
       c."bankClientPerc" AS tarif_foiz, c."bankClientSum" AS tarif_summa,
       (SELECT count(*) FROM "ContractAssignment" x
         WHERE x."companyId" = c.id AND x."isActive"
           AND x.role IN ('bank_manager','bank_client')) AS faol_bank_biriktiruv
FROM "Company" c LEFT JOIN "User" b ON b.id = c."bankClientId"
WHERE c.inn IN ('303328933', '205150295');

\echo ''
\echo '=== 7.6 Zamirada qolgan HAR QANDAY faol biriktiruv (bo''sh bo''lishi kerak) ==='
SELECT c.name, ca.role FROM "ContractAssignment" ca
JOIN "User" u ON u.id = ca."userId"
JOIN "Company" c ON c.id = ca."companyId"
WHERE u."fullName" = 'Zamira' AND ca."isActive";

-- =====================================================================
-- 8. YAKUN
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
