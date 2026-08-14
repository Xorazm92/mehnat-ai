-- =====================================================================
-- PORTFEL QAYTA TAQSIMLASH — 2026 iyul / avgust
-- =====================================================================
-- Manba: rahbariyat bergan jadval (Zamira portfeli) + qo'lyozma izohlar.
--
-- NIMA QILADI
--   A) Zamiraning 13 ta firmasini yangi buxgalterlarga o'tkazadi (01.08.2026)
--   B) Muslimbekning 4 ta firmasini Sevinchga o'tkazadi (01.07.2026)
--   C) Ketgan 8 ta firmani arxivlaydi + ochiq majburiyatlarini bekor qiladi
--   D) 2 ta firmaning bank-klientini Muxriddinga o'zgartiradi (01.08.2026)
--   E) Bazada bo'lmagan 6 ta yangi firmani yaratadi
--
-- HAR BIR KO'CHIRISH UCH JOYGA TEGADI (aks holda ko'chirish "yarim" bo'ladi):
--   1. "Company".accountantId / supervisorId / bankClientId — asosiy slot
--   2. "ContractAssignment"  — lib/access.ts:84 buni ham OR bilan tekshiradi;
--      yopilmasa ESKI xodim firmani ko'raveradi
--   3. "Obligation".responsibleUserId — ochiq majburiyatlar eski xodimda qolib
--      ketadi (lib/obligations.ts:128 yaratilish paytida snapshot qiladi)
--
-- ISHLATISH
--   DB=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- \
--        | tr -d '"' | sed 's/?schema=public//')     # psql ?schema= ni tushunmaydi
--
--   Quruq (hech narsa yozilmaydi — oxirida ROLLBACK):
--     psql "$DB" -v ON_ERROR_STOP=1 -v apply=0 -f scripts/sql/2026-08-portfel-qayta-taqsimlash.sql
--   Haqiqiy:
--     psql "$DB" -v ON_ERROR_STOP=1 -v apply=1 -f scripts/sql/2026-08-portfel-qayta-taqsimlash.sql
--
-- QAYTA ISHGA TUSHIRISH XAVFSIZ: UPDATE'lar idempotent, INSERT'lar INN
-- bo'yicha NOT EXISTS bilan himoyalangan.
--
-- QABUL QILINGAN QARORLAR
--   * Nomlar mos kelmagan 2 ta firma TASDIQLANDI (D bo'limi):
--       "MASTERCOFE ROOSTERS MCHJ" = Mastercoffee Roaster" MCHJ (311638211)
--       "SHOHRUZ IMRON YTT"        = SHOHRUZ-IMRON-SHERDOR OK   (305578771)
--   * Biriktiruv TARIXI saqlanmaydi — "01 iyuldan/avgustdan" sanalari ustun
--     sifatida yozilmaydi. O'zgarish darhol kuchga kiradi, ya'ni B guruhi
--     IYUL payrolliga ham ta'sir qiladi (izohlarga ko'ra shunday kutilgan).
--   * Ochiq majburiyatlar TO'LIQ yangi xodimga o'tadi (6-bo'limga qarang).
--   * Skript AuditLog yozmaydi — to'g'ridan-to'g'ri SQL, actor yo'q.
--   * Yangi firmalarning taxRegime = 'turnover' (bazada 233/269 shunday) va
--     bank-klienti tayinlanmagan — ikkalasini keyin UI'dan aniqlashtiring.
--   * Zamira bu skriptdan keyin 0 ta firma bilan qoladi, lekin hisobi FAOL
--     turadi — xodimni nofaol qilish alohida qaror, bu yerda qilinmaydi.
-- =====================================================================

\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;

-- =====================================================================
-- 1. REJA JADVALLARI — barcha qaror shu uch jadvalda, quyisi mexanika
-- =====================================================================

-- 1.1 Buxgalter/nazoratchi ko'chirishi (A + B).
--     naz_yangi = NULL  →  nazoratchi O'ZGARMAYDI.
--     "faqat Mardonbekda naz Muslimbek, qolganlarida Go'zaloy" qoidasi shu
--     ustunda moddiylashgan: amalda faqat 2 ta firmada nazoratchi almashadi.
CREATE TEMP TABLE _reja (
  inn       text PRIMARY KEY,
  firma     text NOT NULL,   -- faqat o'qish/tekshiruv uchun
  bux_yangi text NOT NULL,
  naz_yangi text
) ON COMMIT DROP;

-- DIQQAT — INN'lar PROD bazasi bo'yicha. LIDER ELITE va NIGINA FARM'ning
-- INN'i lokal `inbola` bazasida boshqacha (306951197 / 303240349). Prod tizim
-- yozuvi hisoblanadi (lokal baza test ma'lumoti bilan ifloslangan), shuning
-- uchun prod qiymatlari olindi. Lokalda quruq ishlatilsa 1.5-bo'limdagi qamrov
-- hisoboti o'sha ikkitasini "TOPILMADI" deb ko'rsatadi — bu kutilgan.
INSERT INTO _reja (inn, firma, bux_yangi, naz_yangi) VALUES
  -- A) Zamira portfeli — 01.08.2026 dan
  ('303328933',   'AMIRBEK-RUXSHONA PHARM" XK', 'Mardonbek', 'Muslimbek'),
  ('311072198',   'HAYRULLO QAZISI',            'Mardonbek', 'Muslimbek'),
  ('205150295',   'NIGINA FARM',                'Mirahmad',  NULL),
  ('NO-STIR-002', 'MUROD AKA Yatt lari',        'Mirahmad',  NULL),
  ('303917761',   'VENU',                       'Mirahmad',  NULL),
  ('308127887',   'FUTURE IT',                  'Mirahmad',  NULL),
  ('305557853',   'BARQAROR 2018',              'Mirahmad',  NULL),
  ('308108166',   'SOFT COMFORT MK4',           'Mirahmad',  NULL),
  ('310786797',   'LIDER ELITE',                'Sevinch',   NULL),
  ('305953772',   'LIDER BUSINESS',             'Sevinch',   NULL),
  ('306794091',   'CONSTANT GROWTH',            'Sevinch',   NULL),
  ('310169962',   'VT TRAVEL',                  'Sevinch',   NULL),
  -- Prodda ALLAQACHON bor (RUSTAM FOOD BARZON MCHJ, shartnoma 700 000) —
  -- shuning uchun yaratilmaydi, ko'chiriladi.
  ('313092797',   'RUSTAM FOOD BARZON MCHJ',    'Sevinch',   NULL),
  ('311876099',   'DSKP AMUDARYO',              'Humora',    NULL),
  -- B) Muslimbekdan Sevinchga — 01.07.2026 dan (nazoratchi Go'zaloy qoladi)
  --
  -- AVVITAL NATURALS (311824130) ATAYLAB CHIQARILGAN — prodda u IKKI marta bor:
  --   c4104589… "AVVITAL NATURALS"      08.07.2026, Muslimbek, 23 majburiyat, 0 hisobot
  --   63cbb132… "AVVITAL NATURALS MCHJ" 11.08.2026, Sevinch,   24 majburiyat, 1 hisobot
  -- Ya'ni iyul ko'chirishi qo'lda, lekin TAHRIRLASH o'rniga YANGI firma
  -- yaratib bajarilgan. Ikkalasi ham faol va ikkalasi ham majburiyat yaratmoqda.
  -- Qaysi qator qolishi — ma'lumot birlashtirish qarori (majburiyat, hisobot va
  -- oylik hisobiga tegadi), shuning uchun bu skript unga TEGMAYDI. Dublikat
  -- hal qilingach, shu qatorni ochib skriptni qayta ishga tushiring —
  -- u idempotent, qolgan hammasi bo'sh amal bo'ladi.
  -- ('311824130',   'AVVITAL NATURALS',        'Sevinch',   NULL),
  ('302431094',   'BADEX LIFE',                 'Sevinch',   NULL),
  ('311308352',   'MAX NUTRITION',              'Sevinch',   NULL),
  ('312892127',   'VITAMIN PHARM SERVIS',       'Sevinch',   NULL);

-- 1.2 Arxivlanadigan firmalar (C).
--     KO'CHIRISHDAN FARQI: bu yerda firma topilmasligi XATO EMAS — yo'q
--     firmani arxivlash baribir bo'sh amal. Topilmaganlari 1.5-bo'limda
--     ro'yxatlanadi, skript esa davom etadi.
CREATE TEMP TABLE _ketdi (
  inn   text PRIMARY KEY,
  firma text NOT NULL,
  sabab text NOT NULL
) ON COMMIT DROP;

INSERT INTO _ketdi (inn, firma, sabab) VALUES
  ('312516386',   'SIRLY MCHJ',             '01.08.2026 dan ketdi (Mardonbekdan)'),
  ('NO-STIR-003', 'NOSIROV XOJIAKBAR YaTT', '01.08.2026 dan ketdi (Mardonbekdan)'),
  ('309063778',   'BORAN LIDERS',           '01.08.2026 dan ketdi (Mirahmaddan)'),
  ('305624231',   'DARVESHI NAVOI',         '01.08.2026 dan ketdi (Mirahmaddan)'),
  ('310538012',   'LEADERS BARAKA',         '01.08.2026 dan ketdi (Mirahmaddan)'),
  ('313095603',   'ASTRAVITAL',             'umuman o''chirish kerak (Zamirada)'),
  -- Bu ikkitasi FAQAT lokal bazada Zamirada turibdi; prod portfelida yo'q.
  -- Prodda topilmasa — bo'sh amal, qamrov hisobotida ko'rinadi.
  ('311671236',   'DOOS DISTRIBUTION',      'faqat lokalda Zamirada; prod portfelida yo''q'),
  ('310756794',   'ZVEZDA FARM',            'faqat lokalda Zamirada; prod portfelida yo''q');

-- 1.3 Bank-klient almashishi (D) — 01.08.2026 dan.
--     Nomlar izohdagidan farq qiladi, INN bo'yicha moslashtirildi va
--     rahbariyat tomonidan TASDIQLANDI (sarlavhadagi izohga qarang).
CREATE TEMP TABLE _bank (
  inn        text PRIMARY KEY,
  firma      text NOT NULL,
  bank_yangi text NOT NULL
) ON COMMIT DROP;

INSERT INTO _bank (inn, firma, bank_yangi) VALUES
  ('311638211', 'Mastercoffee Roaster" MCHJ', 'Muxriddin'),  -- izohda: MASTERCOFE ROOSTERS MCHJ
  ('305578771', 'SHOHRUZ-IMRON-SHERDOR OK',   'Muxriddin');  -- izohda: SHOHRUZ IMRON YTT

-- 1.4 Yaratiladigan yangi firmalar (E).
--     summa = NULL → izohlarda shartnoma summasi ko'rsatilmagan.
CREATE TEMP TABLE _yangi (
  firma text PRIMARY KEY,
  inn   text NOT NULL,
  summa numeric(12,2),
  bux   text NOT NULL,
  naz   text NOT NULL,
  izoh  text NOT NULL
) ON COMMIT DROP;

-- RUSTAM FOOD BARZON bu ro'yxatdan CHIQARILDI: prodda allaqachon bor
-- (RUSTAM FOOD BARZON MCHJ, 313092797, Zamirada) — u endi `_reja` da.
INSERT INTO _yangi (firma, inn, summa, bux, naz, izoh) VALUES
  ('OKCA MCHJ',            '312217584', NULL,    'Mardonbek', 'Muslimbek', '01.07.2026 dan Mardonbekka qo''shildi'),
  ('GOODWILL NICE',        '313199014', 0,       'Musobek',   'Go''zaloy', '01.07.2026 dan Musobekka qo''shildi; 0 summali firma'),
  ('LALITOUR',             '312310644', 1000000, 'Sevara',    'Go''zaloy', '01.07.2026 dan Sevarada'),
  ('INTER NATION',         '313205109', 0,       'Go''zaloy', 'Muslimbek', '01.07.2026 dan Go''zaloyda; 0 summali firma'),
  ('DILSHOD TABOBAT FARM', '305745144', 2500000, 'Mardonbek', 'Muslimbek', '01.08.2026 dan Mardonbekda');

-- =====================================================================
-- 1.5 QAMROV TEKSHIRUVI — rejadagi har bir satr shu bazada topiladimi?
-- =====================================================================
-- ATAYLAB qo'riqchilardan OLDIN. Qo'riqchi BIRINCHI muammoda tranzaksiyani
-- uzadi, ya'ni qolgan nomuvofiqliklar ko'rinmay qoladi va tuzatish bir necha
-- aylanishga cho'ziladi. Bu hisobot esa hammasini bir yo'la chiqaradi.
--
-- Prod va lokal baza bir xil emas (INN'lar ayrim firmalarda farq qiladi),
-- shuning uchun skriptni HAR BIR bazada avval `-v apply=0` bilan ishlatib,
-- shu jadvalni o'qing.
\echo ''
\echo '=== 1.5 QAMROV: rejadagi firmalar shu bazada bormi? ==='
SELECT
  t.bolim,
  t.firma AS rejada,
  t.inn,
  COALESCE(c.name, '‹TOPILMADI›') AS bazada,
  CASE
    -- Ko'chirish/bank: firma bo'lishi SHART.
    WHEN t.turi = 'kochirish' AND c.id IS NULL THEN '✗ XATO — ko''chirib bo''lmaydi'
    WHEN t.turi = 'kochirish' AND c.name <> t.firma THEN '⚠ nomi boshqacha (INN mos)'
    WHEN t.turi = 'kochirish' THEN '✓ ko''chiriladi'
    -- Arxiv: yo'q bo'lsa bo'sh amal.
    WHEN t.turi = 'arxiv' AND c.id IS NULL THEN '· yo''q — arxivlash o''tkazib yuboriladi'
    WHEN t.turi = 'arxiv' THEN '✓ arxivlanadi'
    -- Yangi: yo'q bo'lishi NORMAL — aynan shuning uchun yaratiladi.
    WHEN t.turi = 'yangi' AND c.id IS NULL THEN '+ yaratiladi'
    WHEN t.turi = 'yangi' AND c.name = t.firma THEN '· allaqachon bor — yaratilmaydi'
    ELSE '✗ XATO — INN boshqa firmada band'
  END AS holat,
  a."fullName" AS bux_hozir
FROM (
  SELECT 'A/B ko''chirish' AS bolim, firma, inn, 'kochirish' AS turi FROM _reja
  UNION ALL SELECT 'C arxiv',        firma, inn, 'arxiv'             FROM _ketdi
  UNION ALL SELECT 'D bank',         firma, inn, 'kochirish'         FROM _bank
  UNION ALL SELECT 'E yangi',        firma, inn, 'yangi'             FROM _yangi
) t
LEFT JOIN "Company" c ON c.inn = t.inn
LEFT JOIN "User" a ON a.id = c."accountantId"
ORDER BY t.bolim, t.firma;

\echo ''
\echo '=== 1.5b QAMROV: rejadagi xodimlar shu bazada bormi? ==='
SELECT x.n AS xodim, k.cnt AS faol_yozuv,
       CASE WHEN k.cnt = 1 THEN '✓' ELSE '✗ XATO' END AS holat
FROM (
  SELECT DISTINCT n FROM (
    SELECT bux_yangi AS n FROM _reja
    UNION SELECT naz_yangi FROM _reja
    UNION SELECT bank_yangi FROM _bank
    UNION SELECT bux FROM _yangi
    UNION SELECT naz FROM _yangi
    UNION SELECT 'Yorqinoy'
  ) q WHERE n IS NOT NULL
) x
CROSS JOIN LATERAL (
  SELECT count(*) AS cnt FROM "User" u WHERE u."fullName" = x.n AND u."isActive"
) k
ORDER BY k.cnt, x.n;

-- =====================================================================
-- 2. QO'RIQCHILAR — noto'g'ri bazada yoki nomlar o'zgargan bo'lsa yiqiladi
-- =====================================================================
-- Xodim nomlari ATAYLAB reja jadvallaridan hosil qilinadi, qo'lda takrorlangan
-- ro'yxatdan emas — rejaga yangi qator qo'shilsa, qo'riqchi uni avtomatik
-- qamrab oladi.

CREATE TEMP TABLE _xodim ON COMMIT DROP AS
SELECT DISTINCT n FROM (
  SELECT bux_yangi AS n FROM _reja
  UNION SELECT naz_yangi FROM _reja
  UNION SELECT bank_yangi FROM _bank
  UNION SELECT bux FROM _yangi
  UNION SELECT naz FROM _yangi
  UNION SELECT 'Yorqinoy'          -- yangi firmalarning bosh buxgalteri
) t WHERE n IS NOT NULL;

-- 2.1 Har bir xodim aynan 1 ta FAOL yozuv bo'lishi shart.
--     (prod va lokalda id'lar boshqacha — shuning uchun hamma joyda nom
--     bo'yicha qidiramiz, id qattiq yozilmaydi.)
DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(format('%s → %s ta faol yozuv', x.n, k.cnt), E'\n    ' ORDER BY x.n)
    INTO v_bad
  FROM _xodim x
  CROSS JOIN LATERAL (
    SELECT count(*) AS cnt FROM "User" u WHERE u."fullName" = x.n AND u."isActive"
  ) k
  WHERE k.cnt <> 1;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION E'Xodim noaniq (aynan 1 ta faol yozuv kutilgandi):\n    %', v_bad;
  END IF;
END $$;

-- 2.2 Yangi firmalar tushadigan bo'lim mavjudmi.
DO $$
BEGIN
  IF (SELECT count(*) FROM "Department" WHERE name = 'Yorqinoy bo''limi') <> 1 THEN
    RAISE EXCEPTION 'Bo''lim topilmadi yoki bittadan ko''p: "Yorqinoy bo''limi"';
  END IF;
END $$;

-- 2.3 KO'CHIRILADIGAN firmalar (A/B va D) bazada aynan 1 marta bo'lsin.
--     Arxiv (`_ketdi`) bu qoidaga KIRMAYDI: yo'q firmani arxivlash bo'sh amal,
--     xato emas. Uning topilmaganlari 1.5-hisobotda ko'rinadi.
DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(format('%s (%s) → %s ta yozuv', t.firma, t.inn, k.cnt), E'\n    ' ORDER BY t.firma)
    INTO v_bad
  FROM (
    SELECT inn, firma FROM _reja
    UNION ALL SELECT inn, firma FROM _bank
  ) t
  CROSS JOIN LATERAL (SELECT count(*) AS cnt FROM "Company" c WHERE c.inn = t.inn) k
  WHERE k.cnt <> 1;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION E'Ko''chiriladigan firma noaniq (aynan 1 ta yozuv kutilgandi):\n    %\n    → 1.5-bo''limdagi qamrov hisobotiga qarang.', v_bad;
  END IF;
END $$;

-- 2.3b Arxiv ro'yxatida bitta INN ikki firmaga tegishli bo'lmasin.
DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(format('%s (%s) → %s ta yozuv', t.firma, t.inn, k.cnt), E'\n    ')
    INTO v_bad
  FROM _ketdi t
  CROSS JOIN LATERAL (SELECT count(*) AS cnt FROM "Company" c WHERE c.inn = t.inn) k
  WHERE k.cnt > 1;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION E'Arxivlanadigan INN bir nechta firmaga to''g''ri keladi:\n    %', v_bad;
  END IF;
END $$;

-- 2.4 Yangi INN allaqachon BOSHQA nom bilan turgan bo'lsa — to'xtatamiz.
--     (Bir xil nom bilan turgan bo'lsa — qayta ishga tushirish, bu normal.)
DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(format('%s (%s) — bazada "%s" nomi bilan bor', n.firma, n.inn, c.name), E'\n    ')
    INTO v_bad
  FROM _yangi n JOIN "Company" c ON c.inn = n.inn
  WHERE c.name <> n.firma;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION E'INN to''qnashuvi:\n    %', v_bad;
  END IF;
END $$;

-- 2.5 Bitta firmada buxgalter va nazoratchi BIR ODAM bo'lmasin.
--     lib/access.ts:113 — o'z-o'zini nazorat bloki: shu firmada accountant
--     bo'lsang, u yerda tasdiqlay olmaysan. Ikkalasi bir odam bo'lsa,
--     majburiyat hech qachon tasdiqlanmaydi (jim qotib qolish).
DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(format('%s → bux va naz ikkalasi ham %s', firma, bux), E'\n    ')
    INTO v_bad
  FROM (
    SELECT k.firma, k.bux_yangi AS bux
    FROM _reja k JOIN "Company" c ON c.inn = k.inn
    LEFT JOIN "User" s ON s.id = c."supervisorId"
    WHERE k.bux_yangi = COALESCE(k.naz_yangi, s."fullName")
    UNION ALL
    SELECT n.firma, n.bux FROM _yangi n WHERE n.bux = n.naz
  ) t;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION E'O''z-o''zini nazorat qiladigan firma:\n    %', v_bad;
  END IF;
END $$;

-- =====================================================================
-- 3. HOZIRGI HOLAT — o'zgarishdan OLDINGI surat
-- =====================================================================
\echo ''
\echo '=== 3.1 Ko''chiriladigan firmalarning hozirgi holati ==='
SELECT c.name AS firma, a."fullName" AS bux_hozir, k.bux_yangi,
       s."fullName" AS naz_hozir, COALESCE(k.naz_yangi, '(o''zgarmaydi)') AS naz_yangi
FROM _reja k
JOIN "Company" c ON c.inn = k.inn
LEFT JOIN "User" a ON a.id = c."accountantId"
LEFT JOIN "User" s ON s.id = c."supervisorId"
ORDER BY a."fullName", c.name;

\echo ''
\echo '=== 3.2 Portfel hajmi (o''zgarishdan oldin) ==='
SELECT u."fullName" AS xodim, count(*) AS faol_firma
FROM "Company" c JOIN "User" u ON u.id = c."accountantId"
WHERE c."isActive"
  AND u."fullName" IN (SELECT n FROM _xodim UNION SELECT 'Zamira')
GROUP BY 1 ORDER BY 2 DESC, 1;

-- =====================================================================
-- 4. ESKI TARIFNI SAQLAB QOLAMIZ
-- =====================================================================
-- Yangi ContractAssignment qatori eski qator bilan BIR XIL tarifda ochiladi —
-- ko'chirish pul shartini o'zgartirmasligi kerak. Eski qator yopilgandan keyin
-- tarifni o'qib bo'lmaydi, shuning uchun oldindan nusxalaymiz.
-- Fallback: bazada faol qator bo'lmasa — percent 20 (buxgalter) / 5 (nazoratchi),
-- bu bazadagi ustun nisbat (269 firmadan 171 tasi 20/5/7/5).
CREATE TEMP TABLE _tarif ON COMMIT DROP AS
SELECT
  c.id                                    AS company_id,
  r.role,
  COALESCE(ca."salaryType", 'percent')    AS salary_type,
  COALESCE(ca."salaryValue", r.fallback)  AS salary_value
FROM _reja k
JOIN "Company" c ON c.inn = k.inn
CROSS JOIN LATERAL (VALUES
  ('accountant', 20.00::numeric),
  ('controller',  5.00::numeric)
) AS r(role, fallback)
LEFT JOIN LATERAL (
  SELECT x."salaryType", x."salaryValue"
  FROM "ContractAssignment" x
  WHERE x."companyId" = c.id
    AND x."isActive"
    AND x.role = ANY (CASE r.role
                        WHEN 'accountant' THEN ARRAY['accountant']
                        ELSE ARRAY['controller', 'supervisor']
                      END)
  ORDER BY x."createdAt" DESC
  LIMIT 1
) ca ON true
WHERE r.role = 'accountant'
   OR k.naz_yangi IS NOT NULL;   -- nazoratchi tarifi faqat almashadiganlarga

-- =====================================================================
-- 5. A + B — SLOT USTUNLARINI KO'CHIRISH
-- =====================================================================
UPDATE "Company" c
SET "accountantId" = a.id,
    "supervisorId" = COALESCE(s.id, c."supervisorId"),
    "updatedAt"    = now()
FROM _reja k
JOIN "User" a ON a."fullName" = k.bux_yangi AND a."isActive"
LEFT JOIN "User" s ON s."fullName" = k.naz_yangi AND s."isActive"
WHERE c.inn = k.inn
  AND (c."accountantId" IS DISTINCT FROM a.id
       OR (s.id IS NOT NULL AND c."supervisorId" IS DISTINCT FROM s.id));

-- =====================================================================
-- 6. A + B — ContractAssignment: eskisini yopib, yangisini ochish
-- =====================================================================
-- server/companies.ts:489-504 dagi naqsh: eski faol qator isActive=false +
-- endDate=now(), keyin yangi qator startDate=now(). Rol imlosi ikki xil
-- ('controller' va 'supervisor') — ikkalasi ham yopiladi, aks holda firmada
-- ikkita faol nazoratchi qolib ketadi (ALIASES_FOR_ROLE).

-- 6.1 Buxgalter qatorlari
UPDATE "ContractAssignment" ca
SET "isActive" = false, "endDate" = now()
FROM _reja k
JOIN "Company" c ON c.inn = k.inn
JOIN "User" a ON a."fullName" = k.bux_yangi AND a."isActive"
WHERE ca."companyId" = c.id
  AND ca."isActive"
  AND ca.role = 'accountant'
  AND ca."userId" <> a.id;

INSERT INTO "ContractAssignment" (id, "companyId", "userId", role, "salaryType", "salaryValue", "startDate", "isActive", "createdAt")
SELECT gen_random_uuid(), c.id, a.id, 'accountant', t.salary_type, t.salary_value, now(), true, now()
FROM _reja k
JOIN "Company" c ON c.inn = k.inn
JOIN "User" a ON a."fullName" = k.bux_yangi AND a."isActive"
JOIN _tarif t ON t.company_id = c.id AND t.role = 'accountant'
WHERE NOT EXISTS (
  SELECT 1 FROM "ContractAssignment" x
  WHERE x."companyId" = c.id AND x."userId" = a.id AND x.role = 'accountant' AND x."isActive"
);

-- 6.2 Nazoratchi qatorlari — faqat naz_yangi to'ldirilgan firmalarda
UPDATE "ContractAssignment" ca
SET "isActive" = false, "endDate" = now()
FROM _reja k
JOIN "Company" c ON c.inn = k.inn
JOIN "User" s ON s."fullName" = k.naz_yangi AND s."isActive"
WHERE k.naz_yangi IS NOT NULL
  AND ca."companyId" = c.id
  AND ca."isActive"
  AND ca.role IN ('controller', 'supervisor')
  AND ca."userId" <> s.id;

INSERT INTO "ContractAssignment" (id, "companyId", "userId", role, "salaryType", "salaryValue", "startDate", "isActive", "createdAt")
SELECT gen_random_uuid(), c.id, s.id, 'controller', t.salary_type, t.salary_value, now(), true, now()
FROM _reja k
JOIN "Company" c ON c.inn = k.inn
JOIN "User" s ON s."fullName" = k.naz_yangi AND s."isActive"
JOIN _tarif t ON t.company_id = c.id AND t.role = 'controller'
WHERE k.naz_yangi IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ContractAssignment" x
    WHERE x."companyId" = c.id AND x."userId" = s.id
      AND x.role IN ('controller', 'supervisor') AND x."isActive"
  );

-- =====================================================================
-- 7. A + B — OCHIQ MAJBURIYATLARNI YANGI BUXGALTERGA O'TKAZISH
-- =====================================================================
-- QAROR: FAQAT ochiq majburiyatlar (planned/in_progress/ready/sent/rejected)
-- ko'chiriladi. Yakunlangan/qabul qilingan ish TEGILMAYDI — u eski xodim
-- bajargan ish va KPI/payroll tarixi shunga tayanadi.
--
-- Eslatma: bu IYUL davri (2026-M07) majburiyatlarini ham ko'chiradi, chunki
-- ular hali "planned" — ya'ni ish BAJARILMAGAN. Zamira portfelsiz qoladi,
-- aks holda o'sha ishni hech kim bajarmaydi. Agar iyul ishi eski buxgalterda
-- qolishi kerak bo'lsa, quyidagi shartni qo'shing:
--     AND o."periodStart" >= DATE '2026-08-01'
UPDATE "Obligation" o
SET "responsibleUserId" = a.id,
    "assignedAt"        = now(),
    "updatedAt"         = now()
FROM _reja k
JOIN "Company" c ON c.inn = k.inn
JOIN "User" a ON a."fullName" = k.bux_yangi AND a."isActive"
WHERE o."companyId" = c.id
  AND o.status IN ('planned', 'in_progress', 'ready', 'sent', 'rejected')
  AND o."responsibleUserId" IS DISTINCT FROM a.id;

-- =====================================================================
-- 8. C — KETGAN FIRMALARNI ARXIVLASH
-- =====================================================================
-- scripts/deactivate-company.ts bilan bir xil naqsh: isActive=false +
-- companyStatus='archived_left', ochiq majburiyatlar 'cancelled'.
UPDATE "Company" c
SET "isActive"      = false,
    "companyStatus" = 'archived_left',
    "updatedAt"     = now()
FROM _ketdi k
WHERE c.inn = k.inn
  AND (c."isActive" OR c."companyStatus" IS DISTINCT FROM 'archived_left');

UPDATE "Obligation" o
SET status        = 'cancelled',
    "completedAt" = now(),
    "updatedAt"   = now()
FROM _ketdi k
JOIN "Company" c ON c.inn = k.inn
WHERE o."companyId" = c.id
  AND o.status IN ('planned', 'in_progress', 'ready', 'sent', 'rejected');

-- Arxivlangan firmada faol biriktiruv qolmasin — ketgan mijoz hech kimning
-- portfelida ko'rinmasligi kerak.
UPDATE "ContractAssignment" ca
SET "isActive" = false, "endDate" = now()
FROM _ketdi k
JOIN "Company" c ON c.inn = k.inn
WHERE ca."companyId" = c.id AND ca."isActive";

-- =====================================================================
-- 9. D — BANK-KLIENT ALMASHISHI
-- =====================================================================
UPDATE "Company" c
SET "bankClientId"   = m.id,
    "bankClientName" = m."fullName",
    "updatedAt"      = now()
FROM _bank b
JOIN "User" m ON m."fullName" = b.bank_yangi AND m."isActive"
WHERE c.inn = b.inn
  AND c."bankClientId" IS DISTINCT FROM m.id;

UPDATE "ContractAssignment" ca
SET "isActive" = false, "endDate" = now()
FROM _bank b
JOIN "Company" c ON c.inn = b.inn
JOIN "User" m ON m."fullName" = b.bank_yangi AND m."isActive"
WHERE ca."companyId" = c.id
  AND ca."isActive"
  AND ca.role IN ('bank_manager', 'bank_client')
  AND ca."userId" <> m.id;

INSERT INTO "ContractAssignment" (id, "companyId", "userId", role, "salaryType", "salaryValue", "startDate", "isActive", "createdAt")
SELECT gen_random_uuid(), c.id, m.id, 'bank_manager',
       COALESCE(old."salaryType", 'percent'), COALESCE(old."salaryValue", 5.00),
       now(), true, now()
FROM _bank b
JOIN "Company" c ON c.inn = b.inn
JOIN "User" m ON m."fullName" = b.bank_yangi AND m."isActive"
LEFT JOIN LATERAL (
  SELECT x."salaryType", x."salaryValue" FROM "ContractAssignment" x
  WHERE x."companyId" = c.id AND x.role IN ('bank_manager', 'bank_client')
  ORDER BY x."isActive" DESC, x."createdAt" DESC LIMIT 1
) old ON true
WHERE NOT EXISTS (
  SELECT 1 FROM "ContractAssignment" x
  WHERE x."companyId" = c.id AND x."userId" = m.id
    AND x.role IN ('bank_manager', 'bank_client') AND x."isActive"
);

-- =====================================================================
-- 10. E — YANGI FIRMALAR
-- =====================================================================
-- Ulush foizlari server/companies.ts:129-138 qoidasi bo'yicha: percent
-- tanlansa *Perc to'ldiriladi, *Sum NULL qoladi. Standart nisbat 20/5/7.
-- Bank-klient tayinlanmagan — izohlarda aytilmagan.
INSERT INTO "Company" (
  id, name, inn, "taxRegime", "departmentId", "chiefAccountantId",
  "accountantId", "supervisorId",
  "contractAmount", "accountantPerc", "supervisorPerc", "chiefAccountantPerc",
  "requiredReports", "activeServices",
  "isActive", "companyStatus", "riskLevel", notes, "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), n.firma, n.inn, 'turnover'::"TaxRegime",
  (SELECT id FROM "Department" WHERE name = 'Yorqinoy bo''limi'),
  (SELECT id FROM "User" WHERE "fullName" = 'Yorqinoy' AND "isActive"),
  a.id, s.id,
  n.summa, 20.00, 5.00, 7.00,
  '{}', '{}',
  true, 'active', 'low', n.izoh, now(), now()
FROM _yangi n
JOIN "User" a ON a."fullName" = n.bux AND a."isActive"
JOIN "User" s ON s."fullName" = n.naz AND s."isActive"
WHERE NOT EXISTS (SELECT 1 FROM "Company" c WHERE c.inn = n.inn);

INSERT INTO "ContractAssignment" (id, "companyId", "userId", role, "salaryType", "salaryValue", "startDate", "isActive", "createdAt")
SELECT gen_random_uuid(), c.id, u.id, r.role, 'percent', r.val, now(), true, now()
FROM _yangi n
JOIN "Company" c ON c.inn = n.inn
CROSS JOIN LATERAL (VALUES
  ('accountant',       n.bux,      20.00::numeric),
  ('controller',       n.naz,       5.00::numeric),
  ('chief_accountant', 'Yorqinoy',  7.00::numeric)
) AS r(role, xodim, val)
JOIN "User" u ON u."fullName" = r.xodim AND u."isActive"
WHERE NOT EXISTS (
  SELECT 1 FROM "ContractAssignment" x
  WHERE x."companyId" = c.id AND x."userId" = u.id AND x.role = r.role AND x."isActive"
);

-- =====================================================================
-- 11. TEKSHIRUV — natijani ko'zdan kechiring
-- =====================================================================
\echo ''
\echo '=== 11.1 Ko''chirilgan firmalar (A + B) ==='
SELECT c.name AS firma, a."fullName" AS bux, s."fullName" AS naz,
       (SELECT count(*) FROM "ContractAssignment" x
         WHERE x."companyId" = c.id AND x."isActive" AND x.role = 'accountant') AS faol_bux_biriktiruv,
       (SELECT count(*) FROM "Obligation" o
         WHERE o."companyId" = c.id
           AND o.status IN ('planned','in_progress','ready','sent','rejected')
           AND o."responsibleUserId" = a.id) AS ochiq_majburiyat
FROM _reja k
JOIN "Company" c ON c.inn = k.inn
LEFT JOIN "User" a ON a.id = c."accountantId"
LEFT JOIN "User" s ON s.id = c."supervisorId"
ORDER BY a."fullName", c.name;

\echo ''
\echo '=== 11.2 Arxivlanganlar (C) ==='
SELECT c.name AS firma, c."isActive" AS faol, c."companyStatus", k.sabab,
       (SELECT count(*) FROM "Obligation" o WHERE o."companyId" = c.id AND o.status = 'cancelled') AS bekor_qilingan,
       (SELECT count(*) FROM "ContractAssignment" x WHERE x."companyId" = c.id AND x."isActive") AS faol_biriktiruv
FROM _ketdi k JOIN "Company" c ON c.inn = k.inn ORDER BY c.name;

\echo ''
\echo '=== 11.3 Bank-klient (D) ==='
SELECT c.name AS firma, b."fullName" AS bank_klient,
       (SELECT count(*) FROM "ContractAssignment" x
         WHERE x."companyId" = c.id AND x."isActive"
           AND x.role IN ('bank_manager','bank_client')) AS faol_bank_biriktiruv
FROM _bank k
JOIN "Company" c ON c.inn = k.inn
LEFT JOIN "User" b ON b.id = c."bankClientId"
ORDER BY c.name;

\echo ''
\echo '=== 11.4 Yangi firmalar (E) ==='
SELECT c.name AS firma, c.inn, c."contractAmount" AS summa,
       a."fullName" AS bux, s."fullName" AS naz, ch."fullName" AS bosh,
       (SELECT count(*) FROM "ContractAssignment" x WHERE x."companyId" = c.id AND x."isActive") AS biriktiruv
FROM _yangi n
JOIN "Company" c ON c.inn = n.inn
LEFT JOIN "User" a ON a.id = c."accountantId"
LEFT JOIN "User" s ON s.id = c."supervisorId"
LEFT JOIN "User" ch ON ch.id = c."chiefAccountantId"
ORDER BY c.name;

\echo ''
\echo '=== 11.5 Portfel hajmi (o''zgarishdan keyin) ==='
SELECT u."fullName" AS xodim, count(*) AS faol_firma
FROM "Company" c JOIN "User" u ON u.id = c."accountantId"
WHERE c."isActive"
  AND u."fullName" IN (SELECT n FROM _xodim UNION SELECT 'Zamira')
GROUP BY 1 ORDER BY 2 DESC, 1;

\echo ''
\echo '=== 11.6 QO''RIQ: slot va ContractAssignment mos kelmayaptimi? (bo''sh bo''lishi kerak) ==='
SELECT c.name AS firma, u."fullName" AS eski_xodim, ca.role
FROM (SELECT inn FROM _reja UNION SELECT inn FROM _bank) t
JOIN "Company" c ON c.inn = t.inn
JOIN "ContractAssignment" ca ON ca."companyId" = c.id AND ca."isActive"
JOIN "User" u ON u.id = ca."userId"
WHERE (ca.role = 'accountant'                    AND ca."userId" IS DISTINCT FROM c."accountantId")
   OR (ca.role IN ('controller','supervisor')    AND ca."userId" IS DISTINCT FROM c."supervisorId")
   OR (ca.role IN ('bank_manager','bank_client') AND ca."userId" IS DISTINCT FROM c."bankClientId")
ORDER BY c.name;

\echo ''
\echo '=== 11.7 QO''RIQ: eski xodimda qolib ketgan majburiyat bormi? (bo''sh bo''lishi kerak) ==='
SELECT c.name AS firma, u."fullName" AS eski_xodim, o.status, count(*)
FROM _reja k
JOIN "Company" c ON c.inn = k.inn
JOIN "Obligation" o ON o."companyId" = c.id
LEFT JOIN "User" u ON u.id = o."responsibleUserId"
WHERE o.status IN ('planned','in_progress','ready','sent','rejected')
  AND o."responsibleUserId" IS DISTINCT FROM c."accountantId"
GROUP BY 1, 2, 3 ORDER BY 1;

\echo ''
\echo '=== 11.8 QO''RIQ: mas''ulsiz qolgan faol firma bormi? (bo''sh bo''lishi kerak) ==='
SELECT c.name AS firma, c.inn,
       c."accountantId" IS NULL AS bux_yoq,
       c."supervisorId" IS NULL AS naz_yoq,
       c."chiefAccountantId" IS NULL AS bosh_yoq
FROM (SELECT inn FROM _reja UNION SELECT inn FROM _yangi UNION SELECT inn FROM _bank) t
JOIN "Company" c ON c.inn = t.inn
WHERE c."isActive"
  AND (c."accountantId" IS NULL OR c."supervisorId" IS NULL OR c."chiefAccountantId" IS NULL)
ORDER BY c.name;

-- =====================================================================
-- 12. YAKUN
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
