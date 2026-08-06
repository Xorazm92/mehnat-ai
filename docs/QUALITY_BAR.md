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
| T4 | `proxy.ts` (butun view-RBAC) testlangan | ❌ **0 ta test** | A4 |
| T5 | Konstitutsiya testi yashil | ✅ 6 assertion, CI'da | A1 |

## 2. Xavfsizlik

| # | Chegara | Holat | Blok |
|---|---|---|---|
| S1 | `npm audit --omit=dev` = 0 high/critical | ❌ **12 ta**: 11 tasi `npm audit fix` bilan, 1 tasi (`xlsx`) tuzatilmaydi | A4 / alohida PR |
| S1a | `next-auth`/`@auth/core` **critical** (3 ta advisory) | ❌ `beta.31 → beta.32` — auth, alohida PR va qo'lda smoke talab qiladi | alohida PR |
| S1b | `next` 16.2.10 → 16.3.0 (**high**), `sharp`, `postcss`, `fast-uri` | ❌ freymvork minor bump — AGENTS.md bu Next.js standart emasligini ogohlantiradi | alohida PR |
| S1c | `xlsx@0.18.5` ReDoS + prototype pollution | ❌ tuzatish yo'q → almashtirish kerak; 4 ta eksport implementatsiyasi bilan birga | A5 |
| S2 | Har yozuv API/action'da zod validatsiya | ⚠️ qisman | doimiy |
| S3 | Tashqi API'da rate limit | ⚠️ `lib/rateLimit.ts` bor; `/api/integration/1c` da yo'q | A6 |
| S4 | Sirlar faqat env/vault; repo'da plaintext yo'q | ✅ `lib/crypto.ts` AES-256-GCM | ✅ |
| S5 | Bildirishnoma qabul qiluvchisi chaqiruvchida emas | ✅ `scopedStaffIds` bilan cheklandi + 7 test | A4 |
| S6 | O'z ishini o'zi tasdiqlash bloklangan — **hamma yo'lda** | ✅ `REVIEWER_PERMISSIONS` + 5 test | A4 |

## 3. Kuzatuv

| # | Chegara | Holat | Blok |
|---|---|---|---|
| O1 | Structured log (pino); `console.*` = 0 | ⚠️ `lib/logger.ts` bor, 30 ta `console.*` qolgan | A4 |
| O2 | Error tracking + release tag + alert kanali | ❌ faqat `MONITORING_WEBHOOK_URL` | A4 |
| O3 | Navbat holati ko'rinadi (DLQ, sweep, oxirgi ishga tushish) | ⚠️ `/admin/integration-1c` da qisman | A6 |

## 4. Ishonchlilik

| # | Chegara | Holat | Blok |
|---|---|---|---|
| R1 | RPO ≤ 24 soat, RTO ≤ 2 soat | ⚠️ `scripts/backup.sh` bor | D |
| R2 | Tiklash mashqi kvartalda 1 marta, yozib qo'yiladi | ❌ hech qachon bajarilmagan | D |
| R3 | Migratsiya faqat `migrate deploy` | ✅ 17 migratsiya + baseline | ✅ |
| R4 | Qaytarilmas o'chirish oldidan dump + checksum + tiklash sinovi | — | D |

## 5. Foydalanuvchi

| # | Chegara | Holat | Blok |
|---|---|---|---|
| U1 | Klaviatura navigatsiyasi + fokus tuzog'i asosiy oqimlarda | ⚠️ `design-system/ACCESSIBILITY.md` A1–A9 ochiq | D |
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
