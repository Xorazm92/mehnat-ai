-- =====================================================================
-- TO'LDIRISH: "nol" katagi bor, majburiyati qotib qolgan yozuvlar
-- 2026-08-14
-- =====================================================================
-- NIMA UCHUN
--   `lib/obligationBridge.ts` → `cellValueToStatus` da 'nol' hech qayerda
--   ushlanmasdi va oxirgi "erkin matn" tarmog'iga tushib `in_progress`
--   qaytarardi. Ya'ni buxgalter nol deklaratsiyani topshirib katakka Ø
--   qo'yardi, majburiyat esa OCHIQ qolaverardi va unga kechikish
--   ogohlantirishi ketaverardi.
--
--   Funksiya tuzatildi ('nol' → 'sent'), lekin u faqat YANGI yozuvlarda
--   ishlaydi. Bu skript allaqachon qotib qolganlarini to'ldiradi.
--
-- QAMROV
--   Faqat majburiyatga BOG'LANGAN ustunlar. `COL_KEY_TO_TEMPLATE_CODES` da
--   `_tolov` juftliklari YO'Q — to'lov ustunidagi 'nol' hech qachon
--   majburiyatga tegmagan, shuning uchun ular bu yerda ham qatnashmaydi.
--
--   Xarita (lib/obligationBridge.ts dan, DB ustun nomlarida):
--     aylanmaQqs      → QQS_DECL, AYLANMA_SOLIQ
--     daromadSoliq    → DAROMAD_AGENT
--     inps            → INPS_IJTIMOIY
--     debitorKreditor → AR_AP
--
-- FAQAT OLDINGA
--   `planned` va `in_progress` majburiyatlargina `sent` ga ko'tariladi.
--   `sent` / `accepted` / `rejected` / `cancelled` ga TEGILMAYDI — ular
--   nazoratchi qarori yoki keyingi ish natijasi.
--
--   `sentAt` sanasi `now()` emas, katakning o'z `updatedAt` idan olinadi —
--   ish o'shanda bajarilgan, bugun emas.
--
-- ISHLATISH:
--   psql "$DB" -v ON_ERROR_STOP=1 -v apply=0 -f .../2026-08-nol-majburiyat-toldirish.sql
--   psql "$DB" -v ON_ERROR_STOP=1 -v apply=1 -f .../2026-08-nol-majburiyat-toldirish.sql
--
-- QAYTA ISHGA TUSHIRISH XAVFSIZ: ikkinchi yugurishda mos qator qolmaydi.
-- =====================================================================

\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;

-- =====================================================================
-- 1. NOMZODLARNI TOPISH
-- =====================================================================
CREATE TEMP TABLE _nomzod ON COMMIT DROP AS
WITH nol AS (
  SELECT m.id AS report_id, m."companyId", m.period, m."updatedAt", kv.key AS db_ustun
  FROM "MonthlyReport" m, jsonb_each_text(to_jsonb(m)) AS kv(key, value)
  WHERE lower(trim(kv.value)) = 'nol'
    AND kv.key IN ('aylanmaQqs', 'daromadSoliq', 'inps', 'debitorKreditor')
),
xarita(db_ustun, kod) AS (VALUES
  ('aylanmaQqs',      'QQS_DECL'),
  ('aylanmaQqs',      'AYLANMA_SOLIQ'),
  ('daromadSoliq',    'DAROMAD_AGENT'),
  ('inps',            'INPS_IJTIMOIY'),
  ('debitorKreditor', 'AR_AP')
)
SELECT DISTINCT
  o.id             AS obligation_id,
  c.name           AS firma,
  n.db_ustun,
  n.period,
  dt.code          AS shablon,
  o.status::text   AS eski_holat,
  n."updatedAt"    AS katak_sanasi,
  c."accountantId" AS bux_id
FROM nol n
JOIN xarita x   ON x.db_ustun = n.db_ustun
JOIN "DeadlineTemplate" dt ON dt.code = x.kod AND dt.active
JOIN "Company" c ON c.id = n."companyId"
JOIN "Obligation" o
  ON o."companyId" = n."companyId"
 AND o."templateId" = dt.id
 AND o."periodKey"  = replace(n.period, '-', '-M')
WHERE o.status IN ('planned', 'in_progress');

\echo ''
\echo '=== 1.1 To''ldiriladigan majburiyatlar ==='
SELECT firma, db_ustun, period, shablon, eski_holat, katak_sanasi FROM _nomzod ORDER BY firma;

\echo ''
\echo '=== 1.2 Jami ==='
SELECT count(*) AS nechta FROM _nomzod;

-- =====================================================================
-- 2. TO'LDIRISH
-- =====================================================================
UPDATE "Obligation" o
SET status              = 'sent',
    "sentAt"            = COALESCE(o."sentAt", n.katak_sanasi, now()),
    "responsibleUserId" = COALESCE(o."responsibleUserId", n.bux_id),
    "updatedAt"         = now()
FROM _nomzod n
WHERE o.id = n.obligation_id;

-- =====================================================================
-- 3. TEKSHIRUV
-- =====================================================================
\echo ''
\echo '=== 3.1 Natija ==='
SELECT n.firma, n.db_ustun, n.shablon, n.eski_holat, o.status AS yangi_holat, o."sentAt",
       u."fullName" AS mas_ul
FROM _nomzod n
JOIN "Obligation" o ON o.id = n.obligation_id
LEFT JOIN "User" u ON u.id = o."responsibleUserId"
ORDER BY n.firma;

\echo ''
\echo '=== 3.2 QO''RIQ: "nol" katagi bor, majburiyati hali ochiq (bo''sh bo''lishi kerak) ==='
WITH nol AS (
  SELECT m."companyId", m.period, kv.key AS db_ustun
  FROM "MonthlyReport" m, jsonb_each_text(to_jsonb(m)) AS kv(key, value)
  WHERE lower(trim(kv.value)) = 'nol'
    AND kv.key IN ('aylanmaQqs', 'daromadSoliq', 'inps', 'debitorKreditor')
),
xarita(db_ustun, kod) AS (VALUES
  ('aylanmaQqs','QQS_DECL'), ('aylanmaQqs','AYLANMA_SOLIQ'),
  ('daromadSoliq','DAROMAD_AGENT'), ('inps','INPS_IJTIMOIY'), ('debitorKreditor','AR_AP')
)
SELECT c.name, n.db_ustun, o.status
FROM nol n
JOIN xarita x ON x.db_ustun = n.db_ustun
JOIN "DeadlineTemplate" dt ON dt.code = x.kod AND dt.active
JOIN "Company" c ON c.id = n."companyId"
JOIN "Obligation" o ON o."companyId" = n."companyId" AND o."templateId" = dt.id
                   AND o."periodKey" = replace(n.period, '-', '-M')
WHERE o.status IN ('planned', 'in_progress');

-- =====================================================================
-- 4. YAKUN
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
