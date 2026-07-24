# Mehnat ERP (ASRO) — To'liq Loyiha Auditi va Review Hujjati

**Sana:** 2026-07-23  
**Status:** Ishlab chiqilgan (Production-Ready Core, 304/304 Testlar Passed, `tsc` Clean)  
**Texnologiyalar Steki:** Next.js 16.2.10 (App Router, Server Actions) · React 19.2.4 · Prisma 7.8 + PostgreSQL · NextAuth v5 (JWT) · BullMQ + Redis · grammY (Telegram Bot) · `@google/genai` (Gemini 2.12) · Vitest 4.1 · Tailwind CSS v4  

---

## 1. Executive Summary & Loyiha Umumiy Ko'rinishi

**Mehnat ERP (ASRO)** — bu buxgalteriya autsorsing firmalarining murakkab biznes jarayonlarini avtomatlashtirishga mo'ljallangan maxsus korporativ boshqaruv tizimidir. Tizim buxgalteriya firmasi, ularning xodimlari (bosh buxgalter, nazoratchi, buxgalter, bank-klient operatori) va xizmat ko'rsatiladigan mijoz kompaniyalar o'rtasidagi munosabatlar, oylik hisobotlar nazorati, moliyaviy oqimlar hamda KPI/ish haqi hisob-kitoblarini yaxlit ekotizimga biriktiradi.

### Loyihaning Asosiy Ko'rsatkichlari:
- **Ma'lumotlar Bazasi Arxitetiurasi:** 50+ Prisma modellari, 10+ enumlar, chuqur indeksatsiya va xavfsiz relatsiyalar.
- **Kodni Tekshirish va Sifat Gates:**
  - `npm run typecheck` (`tsc --noEmit`): **0 xato (Clean)**
  - `npm run lint` (ESLint): **0 xato**
  - `npm test` (Vitest): **50 ta test fayl, 304 ta unit/integration testlar — BARCHASI MUVAFFAQIYATLI O'TGAN (100% GREEN)**.
- **Telegram Integratsiyasi:** grammY freymvorki, BullMQ navbatlari va Redis asinxron workerlar orqali Telegram guruhlardagi signallarni qamrab oluvchi avtonom bot.
- **Sun'iy Intelekt (AI):** `@google/genai` (Gemini 2.12) integratsiyasi, 20 ta milliy buxgalteriya/soliq/mehnat kodeksi chunklari va Uzbek tilidagi professional fallback tizimi.

---

## 2. Arxitektura va Fundamental Prinshiplar

Mehnat ERP arxitekturasi quyidagi fundamental muhandislik tamoyillariga tayangan holda qurilgan:

1. **Double-Entry Ledger (Ikki Yoqlama Yozuv Ledgeri):**
   - Barcha moliyaviy operatsiyalar `LedgerEntry` modelida debet va kredit tengligi bo'yicha saqlanadi (`debit == credit`).
   - Append-only xarakterga ega: yozuvlar o'chirilmaydi yoki tahrirlanmaydi, faqat reversal (teskari tranzaksiya) orqali tuzatiladi.
2. **Period Locking (Davrlarni Qulflash Holat Mashinasi):**
   - Buxgalteriya oylari `AccountingPeriod` holatlari orqali boshqariladi (`OPEN` → `READY_TO_CLOSE` → `CLOSING` → `LOCKED` / `REOPENED`).
   - Yopilgan yoki qulflangan davrlarga hech qanday moliyaviy tahrir yoki mutation kiritish imkoni yo'q (`lib/periodLock.ts`).
3. **Majburiyat va Berilgan Pulni Ajratish (Debt vs Payout Separation):**
   - `PayrollAdjustment` obyekti xodimning haqiqiy ish haqini ("qancha to'lanishi kerak") hisoblaydi.
   - `Payout` obyekti esa haqiqatan kassadan yoki bankdan chiqib ketgan real pulni ("qancha va qachon berildi") qayd etadi. Kassaviy balans faqat `Payout`ni chiqim deb biladi.
4. **O'zgarmas Moliyaviy Snapshotlar (Immutable Financial Snapshots):**
   - Davr yopilganda `FinancialSnapshot` modeli immutable trigger bilan DB darajasida qulflanadi va SHA-256 checksum bilan himoyalanadi.
5. **Soft Delete va Audit Trail (Yumshoq O'chirish va Audit Yozuvi):**
   - Muhim moliyaviy va kadroviy yozuvlar `deletedAt`, `deletedBy`, `deleteReason` maydonlari orqali yumshoq o'chiriladi.
   - Har bir operatsiya `AuditLog` modelida qayd etib boriladi.
6. **Role-Based Access Control (RBAC):**
   - Data-layer darajasida har bir Server Action `auth()` va rol ruxsatlarini tekshiradi (`lib/permissions.ts`).
   - UI va navigatsiya darajasida `proxy.ts` orqali marshrutlar filtrlanadi.

---

## 3. Bugungi Holat: Mukammal va To'liq Bajarilgan Modullar

Mehnat ERP loyihasida quyidagi modullar to'liq ishlab chiqilgan, testlar bilan qamralgan va foydalanishga tayyor holatda:

### 3.1. Autentifikatsiya va RBAC Huquqlar Tizimi
- **NextAuth v5 (Beta 31):** JWT session strategiyasiga tayangan xavfsiz tizim.
- **Rollar (6 ta faol rol):**
  - `super_admin`: Tizimdagi barcha huquqlarga ega va ma'murlash panelini boshqaradi.
  - `admin`: Tizim sozlamalari va foydalanuvchilar boshqaruvi.
  - `chief_accountant` (Bosh buxgalter): Bo'limlarni boshqaradi, hisobotlarni tasdiqlaydi, katta xarajatlarni ko'rib chiqadi.
  - `supervisor` (Nazoratchi): Buxgalterlar ishini nazorat qiladi, KPI ballarini tasdiqlaydi, skrinshotlarni qabul qiladi.
  - `accountant` (Buxgalter): Biriktirilgan firmalar bo'yicha hisobotlarni topshiradi va dalillar kiritadi.
  - `bank_manager` (Bank-klient operatori): Bank operatsiyalari va to'lovlarni amalga oshiradi.
- **Huquqlar Matritsasi (`lib/permissions.ts`):** Rollar bo'yicha har bir modul uchun aniq ruxsatnomalar shakllantirilgan.

### 3.2. Kompaniyalar va Tashkiliy Tuzilma (Organizations Module)
- **Kompaniya kartochkasi (6 ta ixtisoslashgan tab):**
  - *Asosiy:* Firma nomi, INN, Soliq rejimi (QQS, Aylanma, YATT va h.k.), Mas'ul xodimlar (Buxgalter, Nazoratchi, Bosh buxgalter, Bank operatori), Shartnoma summasi va to'lov kuni.
  - *Soliq tab:* Soliq rejimiga oid bayroqlar (Yer, Suv, Mol-mulk, Aksiz), QQS sertifikat sanasi, 1C statusi.
  - *Xodimlar va Ish haqi stavkalari:* Xodimlarning shartnoma bo'yicha foizli yoki belgilangan summadagi ulushlari.
  - *Server va Rekvizitlar:* 1C bazasi joylashuvi, server ma'lumotlari.
  - *Xavf (Risk):* Risk darajasi (low, medium, high) va izohlar.
- **Bo'limlar (Department):** Har bir bo'lim muayyan Bosh buxgalterga biriktiriladi.

### 3.3. Oylik Hisobotlar va Skrinshot Dalillari Moduli (Reports & Proofs)
- **MonthlyReport:** 25+ dan ortiq soliq va statistika ustunlari (Bank-klient, Didox, Xatlar, Avtokameral, MyMehnat, 1C, Pul oqimlari, QQS, Foyda solig'i, INPS, Yer/Molk-mulk solig'i, 12 ta statistika shakllari, IT Park, Komunalka).
- **ReportProof (Skrinshotlar Dalili):** Buxgalter soliq topshirig'ini bajargach, skrinshotni (`base64` rasm) va izohni tizimga yuklaydi.
- **Nazoratchi Checklist Paneli (`NazoratchiChecklist.tsx`):** Nazoratchi yuklangan skrinshotlarni ko'rib chiqadi, tasdiqlaydi (`approved`) yoki sabab ko'rsatib rad etadi (`rejected`).

### 3.4. Kassa, Moliya va Xarajatlar (Kassa, Expenses & Financial Reports)
- **Payment (Shartnoma to'lovlari):** Mijoz kompaniyalardan keladigan oylik to me'yoriy shartnoma to'lovlarini ro'yxatga olish va monitoring qilish.
- **KassaEntry (Kassa kirim/chiqim):** Operatsion kassa harakatlari.
- **Expense (Xarajatlar nazorati va 3 bosqichli tasdiqlash):**
  - `< 1,000,000 so'm:` Avtomatik tasdiqlanadi.
  - `1,000,000 - 10,000,000 so'm:` Bosh buxgalter tasdiqlashi talab etiladi.
  - `> 10,000,000 so'm:` Superadmin tasdiqlashi talab etiladi.
- **Hisobotlar (FinancialReport):** Balans, Foyda va zararlar, QQS, Pul oqimi hisobotlarini PDF/Excel formatida shakllantirish.

### 3.5. Dynamic KPI v1 va Adolatli KPI v2 (Fair KPI Shadow Mode)
- **KpiRule & MonthlyPerformance (KPI v1):**
  - Uch holatli (Bonus / Neytral / Jarimaviy) moslashuvchan KPI tizimi.
  - Har bir rol (accountant, bank_client, supervisor) uchun bonus va jarima foizlari/summalari.
  - Telegram bot signallari bilan avtomatik integratsiya.
- **Fair KPI v2 (`FairKpiScore` — Shadow Mode):**
  - Og'irlashgan 5 ta mezon: **SLA (35%)**, **Quality (25%)**, **Client Satisfaction (15%)**, **Volume/Complexity (15%)**, **Discipline (10%)**.
  - Murakkablik ko'effitsienti bilan me'yorlashtirilgan hajm hisobi (`simple`, `standard`, `complex`, `enterprise`).
  - Hozirda real maoshga ta'sir qilmasdan **Shadow Mode** rejimida foniy ravishda hisoblab boriladi.

### 3.6. Telegram KPI Bot va Signal Pipeline
- **grammY Freymvorki + BullMQ Navbatlari:**
  - `message` va `question` workerlari asinxron tartibda ishlaydi.
  - `ProcessedUpdate` ledgeri orqali at-least-once Telegram yetkazib berishlarining dublikat bo'lishi oldi olingan.
- **Monitoring va Savol SLA Engine (`Question`):**
  - Telegram guruhlardagi mijoz savollarini avtomatik aniqlash va belgilangan muddat (deadline) bo'yicha javob berilishini kuzatish.
- **Billing Eskalatsiyasi (🟡🟠🟠 Notification System):**
  - Qarzdor mijozlar bo'yicha Telegram guruhlarga bosqichma-bosqich eskalatsiya xabarlarini yuborish (`PaymentReminder`).

### 3.7. In-App "Moliyachi AI" Assistent
- **Backend:** `@google/genai` (Gemini 2.12) asosida qurilgan Server Action (`askFinanceAssistant`).
- **Bilimlar Bazasi (`lib/ai/knowledge.ts`):** 20 ta strukturaviy chunklardan iborat BHMS, Soliq Kodeksi va Mehnat Kodeksi bo'yicha milliy qonunchilik korpusi.
- **Fallback Rejim:** API kalit yo'qligida yoki tarmoq uzilganda avtomatik ravishda kontekstual Uzbekcha evristik javoblar beradi.

### 3.8. Compliance, Task, Time Tracking va Rentabellik
- **Compliance & Deadline Engine (Faza A):** `DeadlineTemplate`, `Obligation`, `CompanyObligationOverride`, `BusinessCalendarDay`. Avtomatik bayram/dam olish kunlarini hisobga olgan holda deadline surish (`next_workday`).
- **Work Management & SLA (Faza C1):** In-app vazifalar (`Task`), SLA politikalari (`SlaPolicy`) va buzilishlarni qayd etish (`SlaBreach`).
- **Time Tracking & Employee Cost (Faza C2):** `TimeEntry` va xodimning to'liq soatlik qiymati (`EmployeeCostRate`).
- **Billing va Rentabellik (Faza D):** `Invoice` hamda `profitability.ts` orqali shartnoma tushumidan mehnat va operatsion tannarxni ayirib haqiqiy marjinallikni hisoblash.

---

## 4. Chala, Kamchiliklar va Texnik Qarzdorlik (Gaps & Technical Debt)

Loyiha arxitekturasi va test qamrovi juda yuqori bo'lishiga qaramay, quyidagi kamchiliklar va rivojlantirilishi kerak bo'lgan sohalar mavjud:

### 🔴 Yuqori Darajali (High Priority Issues):
1. **Prisma Migratsiya Tarixi Yo'qligi (No Migration History):**
   - *Muammo:* Hozirgi kunda ma'lumotlar bazasi o'zgarishlari `prisma db push` buyrug'i orqali amalga oshirilmoqda. Bu production muhitida schemani xavfsiz versiyalash va rollback qilish imkonini bermaydi.
   - *Tavsiya:* Current schemani baseline qilib, `prisma migrate dev` workflow'iga o'tish zarur.
2. **Plaintext Client Credentials (`Company.password`):**
   - *Muammo:* `ClientCredential` modeli AES-256-GCM shifrlash ishlatayotgan bo'lsa-da, `Company.login` va `Company.password` ochiq matn ko'rinishida saqlanmoqda (`server/companies.ts`).
   - *Tavsiya:* `Company.password`ni `lib/crypto.ts` orqali shifrlash yoki ushbu maydonlarni to'liqligicha `ClientCredential` modeliga o'tkazish.
3. **Login Rate Limiting Enforce Qilinmagani:**
   - *Muammo:* `CONFIG.RATE_LIMIT` (15 daqiqada 5 marta urinish) konstanta sifatiga bor, lekin `authorize()` funksiyasida Redis sliding window limiter chaqirilmagan. Bu brute-force hujumlariga qarshi xavf tug'diradi.

### 🟡 O'rta Darajali (Medium Priority Issues):
4. **Zod Input Validation Server Action'larda Ulanmagan:**
   - *Muammo:* `lib/validation.ts` faylida Zod sxemalari bor, lekin Server Action'larda kirish qiymatlari qo'lda `String()`, `Number()` bilan coerce qilinmoqda. Aniq format va chegara (bounds) tekshiruvlari yo'q.
5. **Monitoring va Error Tracking Yetishmasligi:**
   - *Muammo:* Sentry, OpenTelemetry yoki strukturaviy logger (pino) yo'q. Kodda 49 ta `console.log/error` ishlatilgan. Production xatolari markazlashmagan.
6. **XLSX (SheetJS) Eskirgan Kutubxonasi:**
   - *Muammo:* `xlsx@0.18.5` paketida ReDoS/prototype-pollution zaifligi mavjud. (Yengillashtiruvchi omil: tizim fayllarni o'qimaydi, faqat o'z verifikatsiyalangan ma'lumotlarini Excelga yozadi).

### 🔵 Quyi Darajali / Rivojlantirish Qismidagilar (Low / Work-in-Progress):
7. **1C Integration Ingest Agent (Faza B):**
   - *Holat:* DB sxemalari (`OneCConnection`, `IntegrationEvent`, `SyncRun`) va unit testlar tayyor, lekin real 1C korporativ bazasi bilan OData/HTTP-service integratsiyasi hali jonli sinovdan o'tkazilmagan (pilot holatida).
8. **Client Portal (Faza F):**
   - *Holat:* Mijozlar kabineti (`ClientUser`, `ClientRequest`, `/portal` sahifasi) yaratilgan, lekin keng jamoatchilikka chiqarishdan oldin qo'shimcha xavfsizlik va kirish nazorati talab etiladi.
9. **UI Write-Path Brauzer Sinovlari:**
   - *Holat:* Barcha Server Action va domen mantiqlari Vitest orqali test qilingan. Biroy real brauzerda murakkab modal formalar va checklist-clickthrough-lar qo'lda davomiy verifikatsiya qilinishi tavsiya etiladi.

---

## 5. Kelajak va Rivojlanish Rejasi (Roadmap)

Loyihani to'liq production muhitiga tayyorlash va keyingi bosqichlarga o'tkazish uchun quyidagi qadamlar belgilangan:

```mermaid
graph TD
    A[1-Bosqich: Security & Prod Hardening] --> B[2-Bosqich: Integratsiya & Fair KPI]
    B --> C[3-Bosqich: Mijoz Portali & Masshtablash]
    
    subgraph 1-Bosqich (1-2 Hafta)
    A1[Login Rate Limiting]
    A2[Company.password Shifrlash]
    A3[Prisma Migration Baseline]
    A4[Sentry / Pino Monitoring]
    end

    subgraph 2-Bosqich (1 Oy)
    B1[1C Real Sync-Agent Ingest]
    B2[Fair KPI v2 Shadow-to-Live Transition]
    B3[Zod Boundary Validation]
    end

    subgraph 3-Bosqich (2-3 Oy)
    C1[Mijozlar Kabineti Launch]
    C2[Multi-Node Docker & PgBouncer]
    C3[Telegram AI Auto-Routing]
    end
```

### 1-Bosqich: Qisqa Muddatli Hardening (1-2 Hafta)
- Redis sliding window asosida `authorize()` funksiyasiga brute-force himoyasini ulash.
- `Company.password` ochiq maydonini shifrlab migratsiya qilish.
- Production bazasi uchun `prisma migrate dev --name init_baseline` o'tkazish.
- Sentry va Pino strukturaviy logerlarini integratsiya qilish.
- `next.config.ts` faylidagi CSP (Content Security Policy) headerlarini jonli tekshirib yoqish.

### 2-Bosqich: O'rta Muddatli Integratsiyalar (1 Oy)
- 1C buxgalteriya dasturidan avtomatik maolumot tortuvchi outbound sync-agentni ishga tushirish.
- Shadow Mode'dagi Adolatli KPI v2 (`FairKpiScore`) ko'rsatkichlarini 2 oy davomida tahlil qilib, oylik hisoblash algoritmiga o'tkazish.
- Server Action kirish chegaralarida Zod validation `.parse()` amallarini joriy etish.

### 3-Bosqich: Uzoq Muddatli Masshtablash (2-3 Oy)
- Mijozlar kabinetini (Client Portal) foydalanishga topshirish.
- PostgreSQL uchun PgBouncer pool management va Docker Compose / K8s klasterini sozlash.
- Telegram AI Assistentiga Telegram guruhlarda javob bera oladigan avto-tavsiya beruvchi agent rolini berish.

---

## 6. Deployment va Operatsion Yo'riqnoma (Runbook)

### 6.1. Atrof-muhit o'zgaruvchilari (`.env` talablari)
```env
# App & Database
NODE_ENV="production"
DATABASE_URL="postgresql://user:password@localhost:5432/mehnat_db?schema=public"
REDIS_URL="redis://localhost:6379"

# Authentication & Security
AUTH_SECRET="openssl_rand_base64_32_string"
AUTH_TRUST_HOST="true"
AUTH_URL="https://asro.uz"
NEXT_PUBLIC_SITE_URL="https://asro.uz"
CREDENTIALS_SECRET="dedicated_32_byte_secret_key"

# Telegram Bot
TELEGRAM_BOT_TOKEN="123456789:ABCdefGHIjklMNOpqrsTUVwxyZ"
TELEGRAM_WEBHOOK_SECRET="super_secret_webhook_token"
TELEGRAM_BOT_NAME="mehnat_kpi_bot"

# AI Engine
GEMINI_API_KEY="AIzaSy..."
```

### 6.2. Telegram Webhook o'rnatish
Telegram bot ishga tushgach va TLS sertifikat faol bo'lgach:
```bash
npm run bot:webhook
```

### 6.3. Ishga tushirish buyruqlari
```bash
# Typecheck va Lint tekshiruvi
npm run typecheck
npm run lint

# Testlarni yuritish
npm test

# Production build va start
npm run build
npm start

# Telegram botni alohida jarayonda yuritish
npm run bot:start
```

---

## 7. Xulosa

**Mehnat ERP (ASRO)** — buxgalteriya autsorsingi sohasidagi murakkab va o'ziga xos talablarga to'liq javob beruvchi, chuqur arxitekturalangan, xavfsiz va sinovlardan muvaffaqiyatli o'tgan zamonaviy korporativ platformadir. Barqaror ma'lumotlar bazasi arxitekturasi, moliyaviy ledgeri, avtomatlashtirilgan KPI hamda Telegram bot va AI integratsiyalari loyihaning yuqori texnik salohiyatini namoyon etadi. Hujjatda ko'rsatilgan qisqa muddatli xavfsizlik va monitoring qadamlari amalga oshirilgach, tizim 100% production va yuqori yuklamalarga tayyor bo'ladi.
