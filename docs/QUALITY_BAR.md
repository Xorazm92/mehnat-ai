# Sifat chegarasi

> "Xalqaro daraja" — ta'rifsiz ma'nosiz so'z. Bu yerda u o'lchanadigan qilib yozilgan.
> Har blok oxirida shu jadval belgilanadi.

**Holat belgilari:** ✅ bajarilgan · ⚠️ qisman · ❌ yo'q

---

## 1. Test

| # | Chegara | Holat | Blok |
|---|---|---|---|
| T1 | Integratsiya testlari CI'da har PR'da ishlaydi | ✅ `integration` job yozildi (Postgres + Redis + seed) | A4 |
| T2 | Har yangi server action uchun scope + IDOR testi | ✅ namuna: `test/obligation-access.test.ts` | doimiy |
| T3 | Har sof funksiya uchun `*.spec.ts` (DB'siz) | ✅ 20 ta spec fayl | doimiy |
| T4 | `proxy.ts` (butun view-RBAC) testlangan | ✅ 22 test — RBAC, portal izolyatsiyasi, override, fail-open | A4 |
| T5 | Konstitutsiya testi yashil | ✅ 6 assertion, CI'da | A1 |

## 2. Xavfsizlik

| # | Chegara | Holat | Blok |
|---|---|---|---|
| S1 | `npm audit --omit=dev` = 0 high/critical | ✅ **14 → 2**, ikkalasi moderate (S1d) | A4/A5 |
| S1a | `next-auth`/`@auth/core` **critical** (3 ta advisory) | ✅ `beta.32` — `deps/security-upgrade` shoxida; **qo'lda 6 rol smoke kutilmoqda** | alohida PR |
| S1b | `next` 16.2.10 → 16.3.0 (**high**), `prisma` 7.9.1, `postcss`, `fast-uri` | ✅ o'sha shoxda; avtomatik tekshiruv toza (637 test + build) | alohida PR |
| S1c | `xlsx@0.18.5` ReDoS + prototype pollution | ✅ **olib tashlandi** → `exceljs@4.4.0`; 4 ta eksport implementatsiyasi 1 ga yig'ildi | A5 |
| S1d | `exceljs` → `uuid@8.3.2` (moderate) | ⚠️ **qabul qilingan**: ogohlantirish `v3/v5/v6` ni `buf` bilan chaqirishga tegishli; exceljs faqat `uuid.v4()` ni argumentsiz chaqiradi (`cf-rule-ext-xform.js`) — yo'l erishib bo'lmaydigan. "Tuzatish" 3.4.0 ga semver-major orqaga qaytish bo'lardi |
| S2 | Har yozuv API/action'da zod validatsiya | ⚠️ qisman | doimiy |
| S3 | Tashqi API'da rate limit | ⚠️ `lib/rateLimit.ts` bor; `/api/integration/1c` da yo'q | A6 |
| S4 | Sirlar faqat env/vault; repo'da plaintext yo'q | ✅ `lib/crypto.ts` AES-256-GCM | ✅ |
| S5 | Bildirishnoma qabul qiluvchisi chaqiruvchida emas | ✅ `scopedStaffIds` bilan cheklandi + 7 test | A4 |
| S6 | O'z ishini o'zi tasdiqlash bloklangan — **hamma yo'lda** | ✅ `REVIEWER_PERMISSIONS` + 5 test | A4 |

## 3. Kuzatuv

| # | Chegara | Holat | Blok |
|---|---|---|---|
| O1 | So'rov yo'lidagi server kodi faqat pino orqali log qiladi | ✅ `server/` `lib/` `app/api/` = 0 console, ESLint `error` bilan qulflangan | A4 |
| O1a | Klientda `console.log` yo'q (`error`/`warn` ruxsat) | ✅ 3 ta debug qoldig'i olib tashlandi; ESLint `allow: [error, warn]` | A4 |
| O1b | `bot/` pino'ga o'tadi | ⚠️ 39 ta console — ESLint `warn`, alohida o'zgarish | keyin |
| O1c | `proxy.ts` / `instrumentation.ts` console ishlatadi | ✅ **qasddan** — pino Edge'da ishlamaydi, ESLint `off` + izoh | ✅ |
| O2 | Error tracking + release tag + alert kanali | ❌ faqat `MONITORING_WEBHOOK_URL` | A4 |
| O3 | Navbat holati ko'rinadi (DLQ, sweep, oxirgi ishga tushish) | ⚠️ `/admin/integration-1c` da qisman | A6 |

## 4. Ishonchlilik

| # | Chegara | Holat | Blok |
|---|---|---|---|
| R1 | RPO ≤ 24 soat, RTO ≤ 2 soat | ⚠️ `backup.sh` (kunlik) + `restore-drill.sh` (RTO o'lchaydi) | D |
| R2 | Tiklash mashqi kvartalda 1 marta, yozib qo'yiladi | ⚠️ `scripts/restore-drill.sh` yozildi; lokal rolda CREATEDB yo'q — staging'da bajarilishi kerak | D |
| R3 | Migratsiya faqat `migrate deploy` | ✅ 17 migratsiya + baseline | ✅ |
| R4 | Qaytarilmas o'chirish oldidan dump + checksum + tiklash sinovi | ⚠️ `restore-drill.sh` shu uch qadamni bajaradi | D |

### Tiklash mashqi qanday bajariladi

```bash
bash scripts/backup.sh daily          # dump + sha256
bash scripts/restore-drill.sh         # eng yangi dump'ni ALOHIDA bazaga tiklaydi
```

Mashq manba bazaga hech qachon yozmaydi: u vaqt tamg'ali yangi baza yaratadi,
unga tiklaydi, ETTITA asosiy jadvalning QATOR sanog'ini manba bilan
solishtiradi, RTO ni o'lchaydi va bazani o'chiradi.

Qator sanog'i solishtiriladi, jadval sanog'i emas — sxema tiklanib ma'lumot
tiklanmasligi mumkin, va bu eng yomon holat: hammasi joyida ko'rinadi.

Rolga `CREATEDB` kerak (`ALTER ROLE <user> CREATEDB;`). Huquq yo'q bo'lsa
skript BOSHIDA to'xtaydi va nima qilish kerakligini aytadi — yarim tiklangan
holatda emas.

## 5. Foydalanuvchi

| # | Chegara | Holat | Blok |
|---|---|---|---|
| U1 | Klaviatura navigatsiyasi + fokus tuzog'i asosiy oqimlarda | ⚠️ `components/ui/Modal` primitivi tayyor; **15 ta qo'lda yozilgan modal** hali ko'chmagan — ratchet bilan ushlab turilgan (`lib/modalSemantics.spec.ts`) | D |
| U1a | Ochiq dialog ustida polling to'xtaydi | ⚠️ `useAutoRefresh` markazlashgan tekshiruv qiladi, lekin u faqat `role="dialog"` bo'lgan 5 ta modalda ishlaydi — qolgan 15 tasi ko'rinmaydi | U1 bilan birga |
| U2 | WCAG AA kontrast | ⚠️ | D |
| U3 | Cockpit LCP < 2.5s | ❌ o'lchanmagan | C2 |
| U4 | Matritsa 213×47 < 1.5s | ❌ o'lchanmagan | B2 |
| U5 | Gorizontal skroll yo'q (mobil) | ⚠️ | D |

## 6. Hujjat va til

| # | Chegara | Holat | Blok |
|---|---|---|---|
| D1 | Qaytarilmas qaror — ADR | ✅ 7 ta ADR; A1 da 5 tasi qo'shiladi | A1 |
| D2 | UI faqat o'zbek lotin | ✅ siyosat bor | ✅ |
| D3 | Sana/son `lib/format.ts` orqali (SSR hydration) | ✅ | ✅ |
| D4 | Yangi kelgan odam `PRODUCT.md` + `CONSTITUTION.md` ni 15 daqiqada o'qiydi | ✅ | ✅ |

---

## "Tayyor" nima degani

Ish **tayyor** deyiladi, agar:

1. `npm run typecheck && npm run lint && npm test` yashil — **CI'da ham**
2. Yangi server action bo'lsa — scope + IDOR testi bor
3. Sof mantiq bo'lsa — `*.spec.ts` bor (DB'siz)
4. Qaytarilmas qaror bo'lsa — ADR yozilgan
5. Migratsiya bo'lsa — `migrate deploy` bilan qo'llangan (`migrate dev` **hech qachon**)
6. Foydalanuvchi ko'radigan o'zgarish bo'lsa — 6 rol bilan qo'lda smoke o'tgan
7. `app/` yoki `components/` ga tegsa — PR tavsifida va'da ID'si (`P1`…`P5`) bor

Yakka dasturchi bosim ostida birinchi bo'lib testni va hujjatni tashlab ketadi.
Shuning uchun bu ro'yxat yozib qo'yilgan — yodda saqlash uchun emas, **tekshirish uchun**.

---

## Blok darvozalari

| Blok | Yopilishi shart |
|---|---|
| **A** | T1 T4 T5 · S1 S5 S6 · O1 O2 · D1 |
| **B** | U4 · S3 |
| **C** | U3 · O3 |
| **D** | R1 R2 R4 · U1 U2 U5 |
