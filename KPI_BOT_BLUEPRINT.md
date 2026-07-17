# KPI Telegram Bot — mehnat-ai integratsiya blueprinti

> **Holat (2026-07-16):** Faza A **to'liq bajarildi va tekshirildi** — (poydevor) domain kernel
> + 8 Prisma model dev DB'da; (infra) BullMQ `message` navbati · webhook route (`app/api/telegram/webhook`) ·
> `bot/main.ts` (worker + polling ingress) · Monitoring **Message worker** (dedup + atomik capture).
> Uchdan-uchgacha tekshirildi: 31 test yashil + Redis→worker→Postgres round-trip + idempotentlik.
>
> **Faza B (Identity) ham bajarildi va tekshirildi:** Telegram↔xodim (`/link`), chat↔korxona (`/bind`),
> `/whoami`, admin avtorizatsiya (bootstrap `TELEGRAM_ADMIN_TELEGRAM_ID` yoki admin-rol) + AuditLog;
> capture xabarlari `userId` bilan boyitiladi. Jonli bot: **@kpinazoratbot**.
>
> **Faza C (Question Engine) ham bajarildi va tekshirildi:** `looksLikeQuestion` evristika darvozasi →
> `message` worker `question` navbatiga fan-out → Question worker klassifikatsiya (**Gemini** `@google/genai`,
> evristika zaxira) + `ResponseWindow × WorkingHours` deadline; reply orqali javob; 1-daqiqali cron sweep
> (kechikkanlarni `late`). **76 test yashil** + ikki-navbatli worker round-trip. `GEMINI_API_KEY` bilan Gemini yoqiladi.
> **Davomat = e-jurnal** (Telegram EMAS) — §9 bo'yicha bajarildi.
>
> **Faza E (KPI ledger) bajarildi va tekshirildi:** `KpiEvent` append-only ledger (`appendKpiEvent`
> idempotent), atribut (`resolveResponsibleUserId`: korxona+rol → xodim), savol natijalari →
> hodisa (on-time +1 / late −1, worker+cron), qo'lда `/kpi_award` `/kpi_penalty` → manual + AuditLog,
> `rollupLedger` read-model. **97 test yashil.** Ledger **additiv** — jonli payroll `MonthlyPerformance`
> ga yozmaydi (bu — alohida, tasdiqlash-siyosati qarori). Keyingi: **payroll proyeksiya qarori** →
> **Faza F** (Notifications + to'lov eslatmalari).
> Batafsil: [`bot/README.md`](bot/README.md).
> **Qarorlar (qat'iy):** Integratsiya (bitta repo + bitta Postgres/Prisma) · sof-TS DDD
> (NestJS **emas**) · Prisma (TypeORM **emas**) · Webhook `app/api/telegram/webhook` · BullMQ+Redis.
> **Maqsad:** Telegram bot mehnat-ai ichidagi KPI tizimining ma'lumot manbai bo'ladi —
> u xabar/savol/davomat/hisobot signallarini yig'adi, mavjud KPI dvigatelini oziqlantiradi.
> **Qo'shimcha rol:** (a) ma'lumotlarni tahlil qiladi, (b) Telegram guruhlarni nazorat qiladi,
> (c) **to'lovni to'lamagan korxonalar guruhlariga to'lov eslatmasini** yuboradi (mavjud
> `Payment` + [balans tizimi](lib/balance.ts) bilan bog'lanadi).

---

## 0. Boshqaruvchi tamoyil: nima yangi, nima mavjud

mehnat-ai da KPI dvigateli **allaqachon qisman qurilgan**. Blueprintning asosiy qiymati —
yo'l xaritadagi "nol"dan qurish o'rniga, borni qayta ishlatish. Yo'l xaritadagi har bir
kontseptsiya mehnat-ai modeli bilan solishtiriladi:

| Yo'l xaritadagi kontseptsiya | mehnat-ai da holati | Qaror |
|---|---|---|
| `users`, roles | ✅ `User` + `UserRole` enum + RBAC (yaqinda tahrirlanadigan qilindi) | **Qayta ishlatiladi**; `telegramUserId` qo'shiladi |
| `firms` / `telegram_groups` | ✅ `Company` bor; telegram mapping yo'q | `Company` qayta ishlatiladi; **yangi** `TelegramGroup` (chatId↔companyId) |
| `kpi_rules` (config rule engine) | ✅ `KpiRule` + `CompanyKpiRule` — allaqachon config-driven! | **Qayta ishlatiladi** (asosiy yutuq) |
| `kpi_scores` (oylik proyeksiya) | ✅ `MonthlyPerformance` (earlyDays, lateMinutes, absentDays maydonlari bor!) | **Qayta ishlatiladi** proyeksiya sifatida |
| `kpi_events` (o'zgarmas ledger) | ❌ yo'q | **Yangi** `KpiEvent` (append-only) → `MonthlyPerformance`ga rollup |
| `attendance_logs` | ✅ `Attendance` (checkIn/checkOut, present/late/absent) | **Qayta ishlatiladi/kengaytiriladi** |
| `report_types`, `report_submissions` | ⚠️ `MonthlyReport`/`Operation`/`ReportProof` bor (soliq matritsasi) | **Reconciliation kerak** — §11 |
| `notifications` | ✅ `Notification` | **Qayta ishlatiladi** + Telegram yetkazish |
| `audit_logs` | ✅ `AuditLog` | **Qayta ishlatiladi** |
| `processed_events` (idempotency) | ❌ yo'q | **Yangi** `ProcessedUpdate` |
| `telegram_messages`, `questions`, `answers` | ❌ yo'q | **Yangi** |
| BullMQ/Redis, workers | ❌ yo'q | **Yangi** infratuzilma |
| AI (savol/marshrut/STT) | ❌ (Ollama rejalashtirilgan → Claude) | **Yangi** Claude adapter |
| **To'lov eslatmalari** (yangi talab) | ✅ `Payment` (paid/pending/partial/overdue) + `Company.paymentDay`/`contractAmount` | **Qayta ishlatiladi**; yangi `PaymentReminder` (yuborilgan eslatma izi) |

**Xulosa:** KPI dvigatelining ~40% allaqachon mavjud. Bot asosan *signal manbai* + *ledger* +
*Telegram I/O* qo'shadi; hisob-kitob mavjud `KpiRule`/`MonthlyPerformance` orqali oqadi.

---

## 1. Yuqori darajali arxitektura

```
                         ┌──────────────────────── mehnat-ai (bitta repo, bitta Postgres) ────────────────────────┐
                         │                                                                                          │
  Telegram  ──webhook──▶ │  app/api/telegram/webhook  (Next.js route: HMAC tekshir → enqueue → 200 qaytar)         │
                         │            │                                                                             │
                         │            ▼                                                                             │
                         │       Redis (BullMQ navbatlari)                                                          │
                         │            │                                                                             │
                         │            ▼                                                                             │
                         │   bot/ (doimiy NestJS/Node jarayoni — BullMQ workerlar)                                  │
                         │   ┌──────────┬───────────┬──────────┬────────┬──────────────┬───────────────┐            │
                         │   │ Message  │Attendance │ Question │  KPI   │ Notification │Monthly Rollup │            │
                         │   │ Worker   │  Worker   │  Worker  │ Worker │   Worker     │   Worker      │            │
                         │   └──────────┴───────────┴──────────┴────────┴──────────────┴───────────────┘            │
                         │            │           (domain layer — Prisma'siz, sof biznes qoidalar)                  │
                         │            ▼                                                                             │
                         │   Prisma 7  ──▶  Postgres  (KpiEvent ledger + MonthlyPerformance proyeksiya + ...)        │
                         │            ▲                                                                             │
                         │            │                                                                             │
                         │   app/ (Next.js UI) ──── KPI dashboard, natijalarni O'QIYDI (o'zgarmaydi)               │
                         └──────────────────────────────────────────────────────────────────────────────────────┘
                                      ▲                         │
                          Claude API (savol? / kim javob beradi?)   External STT (ovoz→matn: Whisper/Google)
```

**Ikki jarayon, bitta manba:**
- **Next.js app** (`app/`) — mavjud UI + `app/api/telegram/webhook` (yupqa: HMAC → enqueue → 200).
- **Bot service** (`bot/`) — doimiy jarayon, BullMQ workerlar + Telegram yuborish (grammY) + cron.
- **Umumiy:** bir xil `lib/prisma`, bir xil Postgres, bir xil Redis, bir xil `prisma/schema.prisma`.

Webhook Next.js'da qoladi (u allaqachon HTTPS yuzasi) — lekin **faqat qabul qilib navbatga
qo'yadi**, hech qanday biznes-logika yo'q. Og'ir ish workerlarda.

---

## 2. Repo strukturasi (monorepo, bitta package.json workspace)

```
mehnat-ai/
├── app/                          # Next.js UI (mavjud) + api/telegram/webhook (yangi, yupqa)
│   └── api/telegram/webhook/route.ts
├── bot/                          # YANGI — doimiy bot service (DDD qatlamlari)
│   ├── main.ts                   # entry: workerlar + grammY bot + cron ni ishga tushiradi
│   ├── contexts/                 # bounded context'lar (§4)
│   │   ├── identity/
│   │   ├── monitoring/           # domain/ application/ infrastructure/ interface/
│   │   ├── attendance/
│   │   ├── reports/
│   │   ├── kpi/
│   │   ├── notifications/
│   │   └── ai/                   # Claude + STT adapterlar (port ortida)
│   ├── shared/                   # DomainEvent, value objects (Percentage, PeriodMonth, WorkingHours, ResponseWindow)
│   ├── queues/                   # BullMQ queue + worker registrlari
│   ├── telegram/                 # grammY bot instance, webhook parsing, yuborish
│   └── cron/                     # deadline skani, rollup, eskalatsiya jadvallari
├── lib/prisma.ts                 # MAVJUD — ikkala jarayon ham shundan foydalanadi
├── prisma/schema.prisma          # MAVJUD — bot jadvallari qo'shiladi (§5)
├── server/                       # MAVJUD Next.js server actionlar (KPI o'qish uchun)
└── package.json                  # bitta; bot skriptlari qo'shiladi
```

**Ishga tushirish:**
- Dev: `next dev` (UI) + `tsx bot/main.ts` (bot) — ikki terminal yoki `concurrently`.
- Prod: `next start` + PM2/systemd bilan `bot/main.ts` (worker'lar mustaqil scale — bir nechta instance).

**DDD/NestJS eslatma:** Yo'l xaritangiz NestJS-DDD. `bot/` NestJS ilovasi bo'lishi mumkin
(DI, modullar) YOKI sof TS DDD qatlamlar. **Tavsiya:** NestJS (yo'l xaritaga mos, `nestjs` skill
bor) — lekin **ORM Prisma** (TypeORM emas), chunki mehnat-ai Prisma 7 da. Yo'l xaritadagi
TypeORM/`migration:run` → Prisma `migrate`/`db push` ga xaritalanadi. *(Ochiq qaror — §18.)*

---

## 3. Domain-Driven qatlam qoidasi (o'zgarmas)

Har bir context: `domain/ → application/ → infrastructure/ → interface/`

- **domain/** — sof biznes qoidalar. Prisma, grammY, BullMQ, Claude import QILMAYDI. Faqat
  entity/aggregate/value-object/domain-event. DB'siz jest testlari (yo'l xaritadagi 24 test shu yerda).
- **application/** — use-case'lar (command handlerlar). Portlarни chaqiradi, tranzaksiyalarни boshqaradi.
- **infrastructure/** — Prisma repozitoriylari, Claude adapter, Telegram gateway, BullMQ producerlar.
- **interface/** — worker'lar, cron, grammY handler'lar (ACL — anti-corruption layer).

Telegram handler ichida **hech qanday KPI hisob-kitobi yo'q** — u faqat: update'ni tekshiradi →
command'ga aylantiradi → saqlaydi → navbatga qo'yadi.

---

## 4. Bounded Context'lar (9 ta) — mehnat-ai ga xaritalangan

| # | Context | Mas'uliyat | Asosiy modellar (mavjud / yangi) |
|---|---|---|---|
| 1 | **Identity & Admin** | User↔Telegram bog'lash, firma↔chat, ruxsatlar, `/assign_role`, base salary/ulush | `User`✅ `Company`✅ / `TelegramGroup`🆕 `TelegramIdentity`🆕 |
| 2 | **Monitoring** | Xabar capture (text/reply/edit/delete/reaction/media/voice), Question Engine | `TelegramMessage`🆕 `Question`🆕 `Answer`🆕 |
| 3 | **Attendance** (bot EMAS) | e-jurnal → `Attendance` (Next.js `server/ejurnal.ts`); bot davomatni kuzatmaydi | `Attendance`✅ + `lib/attendance.ts` |
| 4 | **Reports** | Deadline oynalari, on-time/late (soliq matritsasi bilan reconciliation) | `MonthlyReport`/`Operation`/`ReportProof`✅ / `ReportDeadline`🆕 — §11 |
| 5 | **KPI Engine** | Rule Engine + Ledger + oylik rollup + qo'lda tuzatish | `KpiRule`✅ `CompanyKpiRule`✅ `MonthlyPerformance`✅ `PayrollAdjustment`✅ / `KpiEvent`🆕 |
| 6 | **Notifications** | 🟡🟠🔴 eskalatsiya, Telegram yetkazish | `Notification`✅ / `NotificationDelivery`🆕 |
| 7 | **AI (supporting)** | Faqat: savolmi? + kim javob beradi? + STT. **KPI hisoblamaydi** | (jadval yo'q — port/adapter) |
| 8 | **Analytics/Dashboard** | Real-time widgetlar, read-model | mavjud Next.js `server/*` + read-only sorovlar |
| 9 | **Billing & Reminders** 🆕 | To'lamagan/muddati o'tgan firmalarni aniqlash, guruhga to'lov eslatmasi (🟡🟠🔴), inkasso hisoboti | `Payment`✅ `Company`✅ `TelegramGroup`🆕 / `PaymentReminder`🆕 |

---

## 5. Ma'lumotlar modeli (Prisma) — yangi + reuse

### 5.1 Mavjud modellarga qo'shimchalar

```prisma
model User {
  // ... mavjud maydonlar ...
  telegramUserId   BigInt?  @unique   // Telegram raqamli ID (mapping)
  telegramUsername String?
}

model Company {
  // ... mavjud (contractAmount, paymentDay, contractDate ham bor) ...
  telegramGroups   TelegramGroup[]    // firma ↔ bir yoki bir nechta chat
  paymentReminders PaymentReminder[]  // yuborilgan to'lov eslatmalari
}

model Attendance {
  // ... mavjud (userId, date, checkIn, checkOut, status, notes) ...
  source     String?  @default("manual")  // 'manual' | 'telegram'
  lateMinutes Int?    @default(0)          // e-jurnal check-in 09:00 dan keyin
}
```

### 5.2 Yangi modellar (bot)

```prisma
// Firma ↔ Telegram guruh
model TelegramGroup {
  id         String   @id @default(uuid())
  chatId     BigInt   @unique
  companyId  String?
  company    Company? @relation(fields: [companyId], references: [id], onDelete: SetNull)
  title      String?
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())
  @@index([companyId])
}

// Idempotency — Telegram at-least-once yetkazadi
model ProcessedUpdate {
  updateId   BigInt   @id            // Telegram update_id (unique)
  processedAt DateTime @default(now())
  @@index([processedAt])   // eski yozuvlarni tozalash uchun
}

// To'liq xabar capture (reply/edit/delete/reaction/media metadata bilan)
model TelegramMessage {
  id         String   @id @default(uuid())
  chatId     BigInt
  messageId  BigInt
  fromUserId BigInt?
  userId     String?                    // mehnat-ai User (agar mapping bo'lsa)
  text       String?  @db.Text
  kind       String                     // 'text'|'reply'|'edit'|'delete'|'reaction'|'media'|'voice'|'file'
  replyToId  BigInt?
  mediaType  String?
  voiceTranscript String? @db.Text      // STT natijasi
  createdAt  DateTime                    // Telegram xabar vaqti
  @@unique([chatId, messageId])
  @@index([chatId, createdAt])           // partitioning kaliti (§17)
  @@index([userId, createdAt])
}

// Savol holati mashinasi
model Question {
  id            String    @id @default(uuid())
  chatId        BigInt
  companyId     String?
  messageId     BigInt
  askedByUserId BigInt?
  responsibleRole String                 // AI marshruti: 'accountant'|'bank_client'|'controller'
  responsibleUserId String?              // aniq mas'ul (agar bor)
  status        String    @default("pending")  // pending|answered|late|closed
  deadlineAt    DateTime                 // ResponseWindow × WorkingHours (§10)
  answeredAt    DateTime?
  aiConfidence  Decimal?  @db.Decimal(4,3)
  createdAt     DateTime  @default(now())
  answers       Answer[]
  @@index([status, deadlineAt])          // cron skani uchun kritik
  @@index([companyId])
}

model Answer {
  id          String   @id @default(uuid())
  questionId  String
  question    Question @relation(fields: [questionId], references: [id], onDelete: Cascade)
  byUserId    String?
  messageId   BigInt
  createdAt   DateTime @default(now())
  @@index([questionId])
}

// O'zgarmas KPI ledger — barcha bonus/jarima signed yozuv sifatida
model KpiEvent {
  id          String   @id @default(uuid())
  employeeId  String                      // mehnat-ai User
  companyId   String?
  ruleId      String?                     // qaysi KpiRule qo'llandi
  periodMonth String                      // "2026-07"
  type        String                      // 'response'|'attendance'|'report'|'manual'
  points      Decimal  @db.Decimal(10,4)  // signed: + bonus / − jarima
  sourceRef   String?                     // Question.id / Attendance.id / ...
  meta        Json     @default("{}")
  createdBy   String?                     // qo'lda tuzatishда: kim
  createdAt   DateTime @default(now())
  @@index([employeeId, periodMonth])
  @@index([companyId, periodMonth])
  @@index([periodMonth])
}

// Notification yetkazish holati (eskalatsiya)
model NotificationDelivery {
  id            String   @id @default(uuid())
  notificationId String?
  channel       String                    // 'telegram'|'inapp'
  level         String                    // 'yellow'|'orange'|'red'
  targetChatId  BigInt?
  status        String   @default("pending") // pending|sent|failed
  sentAt        DateTime?
  createdAt     DateTime @default(now())
  @@index([status])
}

// To'lov eslatmasi izi — bir firma+davr+daraja uchun bir marta (spam yo'q)
model PaymentReminder {
  id         String   @id @default(uuid())
  companyId  String
  company    Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  period     String                       // "2026-07" (Payment.period bilan mos)
  level      String                       // 'yellow'|'orange'|'red'
  amountDue  Decimal  @db.Decimal(12,2)   // eslatma paytidagi qarz
  chatId     BigInt?                      // qaysi guruhga yuborildi
  status     String   @default("sent")    // sent|failed|skipped
  sentAt     DateTime @default(now())
  @@unique([companyId, period, level])    // idempotentlik — takror yubormaslik
  @@index([period])
  @@index([status])
}
```

**Ledger → proyeksiya:** `KpiEvent` (source of truth) oylik rollup worker orqali mavjud
`MonthlyPerformance` (earlyDays/lateMinutes/absentDays/calculatedScore) va kerak bo'lsa
`PayrollAdjustment` ga yig'iladi. UI o'zgarmaydi — u `MonthlyPerformance`ni o'qiydi.

---

## 6. Telegram event flow (webhook → workers)

```
1. Telegram → POST app/api/telegram/webhook
   - X-Telegram-Bot-Api-Secret-Token tekshiriladi (HMAC/secret)
   - update_id ni Redis SETNX bilan tez dedup (yoki workerда ProcessedUpdate)
   - payloadни 'message' queue'ga qo'yadi → 200 OK (< 50ms)
2. Message Worker:
   - ProcessedUpdate upsert (update_id unique) — ikki marta ishlanmaydi
   - TelegramMessage saqlaydi (kind aniqlaydi: reply/edit/delete/media/voice)
   - Voice bo'lsa → AI STT porti (Whisper/Google) → voiceTranscript
   - Evristika: "savolmi?" (? bilan tugadi, savol so'zlari) → noaniq bo'lsa AI porti (Claude)
   - Savol bo'lsa → 'question' queue
   - Kelish signali ("keldim"/birinchi xabar 08:30) → 'attendance' queue
3. Question Worker: AI marshrut (kim javob beradi) → Question yaratadi (deadlineAt bilan)
4. Har javob kelganda: pending Question topiladi → answered → 'kpi' queue (response event)
5. KPI Worker: KpiRule tanlaydi → KpiEvent yozadi (signed points)
6. Notification Worker: eskalatsiya kerak bo'lsa → Telegram yuboradi
```

Barcha yozish async (navbat orqali) — webhook handler hech qachon bloklanmaydi.

---

## 7. Navbatlar va workerlar (BullMQ + Redis)

| Navbat | Producer | Worker vazifasi | Concurrency |
|---|---|---|---|
| `message` | webhook | capture, dedup, STT, savol/kelish aniqlash | Yuqori (10x scale) |
| ~~`attendance`~~ | — | **olib tashlandi** — davomat e-jurnaldan (§9), botda emas | — |
| `question` | message worker | AI marshrut, Question + deadline | O'rta |
| `kpi` | question/attendance/report | KpiRule → KpiEvent | O'rta |
| `notification` | eskalatsiya cron/kpi | 🟡🟠🔴 Telegram yetkazish | Past |
| `payment-reminder` | cron (kunlik) | to'lamagan firma guruhiga eskalatsiyali eslatma | Past |
| `rollup` | cron (oylik/kunlik) | KpiEvent → MonthlyPerformance | Past (rejalashtirilgan) |

- **Redis** — faqat navbat + kesh; hech qachon source of truth emas.
- Har worker mustaqil scale (Message Worker'ni 10x, KPI'ga tegmasdan).
- BullMQ retry + dead-letter; idempotency `ProcessedUpdate` orqali.

---

## 8. KPI Rule Engine (mavjud `KpiRule` + yangi `KpiEvent`)

- **Qoidalar = data** (`KpiRule` jadvali, allaqachon config-driven): `role`, `inputTypeV2`,
  `options` (JSON: coeff/coeff_per_unit/max_coeff), `maxBonus`, `maxPenalty`, `scope`.
  Admin `bonus_points`ni o'zgartirsa — **kod deploy yo'q**, faqat qator + `AuditLog`.
- **Trigger → qoida xaritasi** (yangi `category`/`trigger` bilan kengaytiriladi):
  - `ARRIVAL before 08:30` → attendance bonus qoidasi
  - `RESPONSE within window` → response bonus; `late` → jarima qoidasi
  - `REPORT on-time/late` → report qoidasi
- **Ledger:** har trigger → `KpiEvent` (signed points, `ruleId`, `sourceRef`). O'zgarmas.
- **Rollup:** oylik worker `KpiEvent`larни `periodMonth` bo'yicha yig'ib, `MonthlyPerformance`
  (`calculatedScore`, `earlyDays`, `lateMinutes`, `absentDays`) ni **qayta hisoblaydi** (idempotent).
- **Qo'lda tuzatish** (`/kpi_award`, `/kpi_penalty`) → `KpiEvent` (type=manual, createdBy) + `AuditLog`.
- **To'lovga bog'lanish:** oylik yakunda `PayrollAdjustment` (mavjud) yoziladi → mavjud
  Payroll/Kassa oqimi ([unified balance](lib/balance.ts) qo'riqchisi bilan).

---

## 9. Attendance workflow — **e-jurnal, Telegram EMAS** ✅ bajarildi

> **Qaror (2026-07-17):** Davomat **Telegram orqali olib borilmaydi**. U **e-jurnal
> (ejurnal.uz — Hikvision yuz-skaneri)** dan keladi. Botда attendance konteksti/queue
> YO'Q. KPI dvigateli `Attendance` jadvalini manbaidan qat'i nazar iste'mol qiladi.

- **Manba:** [`server/ejurnal.ts`](server/ejurnal.ts) `syncEjurnalAttendance(date)` (senior-only) →
  e-jurnaldan kunlik davomatni oladi, xodimга (telefon → ism) moslaydi, `Attendance` jadvaliga
  yozadi (`source='ejurnal'`, `checkIn/checkOut`, `lateMinutes`).
- **Sof mantiq (test qilingan):** [`lib/attendance.ts`](lib/attendance.ts) — 08:30 (erta bonus) /
  09:00 (kechikish) chegaralari, `classifyArrival`, `aggregateMonthlyAttendance`;
  [`lib/ejurnal.ts`](lib/ejurnal.ts) — status xaritasi, normalizatsiya, moslashtirish.
- **KPI ga ko'prik:** `deriveAttendanceKpi(employeeId, month)` `Attendance`dan `earlyDays /
  lateMinutes / absentDays` ni HISOBLAB beradi — nazoratchi qo'lда sanamaydi. Read-only;
  supervisor KPI kiritishда pre-fill qiladi (jonli payroll write yo'liга tegmaydi).
- **Qolgan yagona ish:** e-jurnal API endpoint/token (`.env`: `EJURNAL_API_URL`, `EJURNAL_API_TOKEN`)
  va `fetchEjurnalAttendance` dagi endpoint yo'lini haqiqiy API'ga moslash.
- **UI:** mavjud Davomat sahifasi shu `Attendance`ni ko'rsatadi (o'zgarmaydi).

---

## 10. Question Engine (holat mashinasi)

```
Xabar → savolmi? (evristika → noaniq bo'lsa Claude)
  → mas'ul rol (Claude marshrut) → Question yaratildi (deadlineAt)
  → PENDING → [Javob keldi → ANSWERED] / [Deadline o'tdi → LATE → KpiEvent(jarima)]
```

- **ResponseWindow** (value object): accountant 10 daq · bank-client 5 · controller 5–10 · "ETA
  guruhда" ≤30 daq. **WorkingHours** bilan ko'paytiriladi (09–13, 14–18).
- **Deadline skani:** cron **faqat pending** savollarni skан qiladi (`@@index([status, deadlineAt])`)
  — hech qachon "200 guruhni ketma-ket" emas. `setTimeout` yo'q; holat Postgres'да.
- **AI faqat:** savolmi (bool) + kim javob beradi (rol) + confidence. STT ovoz uchun. Xolos.

---

## 11. Report workflow — ⚠️ reconciliation kerak

mehnat-ai da allaqachon boy hisobot tizimi bor: `MonthlyReport` (soliq ustunlari matritsasi),
`Operation`, `ReportProof` (skrinshot dalili + tasdiq), `FinancialReport`. Yo'l xaritadagi
"report_types/deadline/on-time-late" bular bilan **qisman ustma-ust tushadi**.

**Ikki xil "hisobot" mavjud:**
1. **Soliq hisobotlari** (mavjud) — didox, QQS, balans... — [OperationModule](components/OperationModule.tsx) matritsasi, ReportProof dalili.
2. **Bot "report deadline"** (yo'l xarita) — xodim biror hisobotни o'z vaqtida topshirdimi (SLA/KPI uchun).

**Tavsiya:** yangi ustun/model qo'shmaslik uchun bot report-SLA sini **mavjud `ReportProof`
holatiga** bog'lash (`submittedAt` vs deadline) VA/YOKI kichik `ReportDeadline` (companyId, colKey,
period, dueAt) qo'shib, `KpiEvent` generatsiya qilish. **Bu — ochiq qaror (§18).**

---

## 11-B. Billing / To'lov eslatmalari workflow (yangi talab)

Bot to'lovni to'lamagan korxonalar guruhiga avtomatik eslatma yuboradi. Bu **mavjud `Payment`
modeli** va [balans tizimi](lib/balance.ts) bilan to'g'ridan-to'g'ri bog'lanadi.

**Qarzni aniqlash (kunlik cron):** har faol `Company` uchun:
```
period = joriy oy ("YYYY-MM")
payment = Payment(companyId, period)               // mavjud @@unique([companyId, period])
qarz bor, agar:
  payment yo'q                                     → to'lanmagan
  yoki payment.status ∈ {pending, partial, overdue}
  yoki payment.amount < Company.contractAmount     // qisman
muddat: bugun.kun >= Company.paymentDay (yoki period o'tgan)
amountDue = contractAmount − (payment?.amount ?? 0)
```

**Eskalatsiya darajalari** (Company.paymentDay ga nisbatan):
| Daraja | Qachon | Xabar ohangi |
|---|---|---|
| 🟡 yellow | paymentDay kuni | Yumshoq eslatma: "To'lov muddati bugun" |
| 🟠 orange | +3–5 kun | Qat'iy: "To'lov kechikdi, iltimos to'lang" |
| 🔴 red | +7–10 kun | Ogohlantirish + mas'ul (accountant/bank_manager)ga in-app xabar |

**Oqim:**
```
Cron (kunlik) → to'lamagan firmalar ro'yxati → 'payment-reminder' queue
  → Worker: PaymentReminder @@unique([companyId, period, level]) tekshiradi (bir marta)
  → TelegramGroup.chatId topiladi → grammY orqali guruhga yuboradi
  → PaymentReminder yozadi (idempotentlik) + AuditLog
  → 🔴 darajада mas'ul xodimga ham Notification (in-app)
```

**Muhim qoidalar:**
- **Idempotentlik:** `@@unique([companyId, period, level])` — bir firma+davr+daraja uchun bir marta.
  To'lov kelsa (`status='paid'`) — keyingi darajalar yuborilmaydi.
- **Chat yo'q bo'lsa:** `TelegramGroup` mapping bo'lmasa → `status='skipped'` + admin'ga signal.
- **Balans bog'liqligi:** to'lov = kirim; bu inkasso oqimini kuchaytiradi ([unified balance](lib/balance.ts)
  bilan izchil — Payment.status='paid' balansga kirimni qo'shadi).
- **Konfiguratsiya:** eskalatsiya kunlari (3/5/7/10) va matn shablonlari `SystemSetting`да
  (admin tahrirlaydi, kod deploy yo'q — [operation-matrix editori](app/(admin)/admin/operation-matrix) namunasidek).

**Tahlil (analytics):** bot inkasso ko'rsatkichini hisoblaydi — to'langan/kutilayotgan firmalar,
o'rtacha kechikish, top qarzdorlar → Next.js dashboard (mavjud Kassa sahifasi) o'qiydi.

---

## 12. Notification workflow (mavjud `Notification` + Telegram)

- Eskalatsiya darajalari: 🟡 (yaqinlashdi) → 🟠 (deadline) → 🔴 (o'tdi).
- Cron pending Question/Report deadline larни tekshiradi → `Notification` (in-app, mavjud) +
  `NotificationDelivery` (telegram) → grammY orqali yuboradi.
- Idempotent: har (savol, daraja) uchun bir marta.

---

## 13. AI qatlami (Claude + STT) — port/adapter

```
bot/contexts/ai/
├── domain/ai.port.ts          # interface: classify(text) / route(text) / transcribe(audio)
├── infrastructure/
│   ├── claude.classifier.ts   # @anthropic-ai/sdk, structured output (is_question + role)
│   └── stt.adapter.ts         # Whisper/Google (ovoz→matn) — Anthropic STT qilmaydi
```

- **Model:** default `claude-opus-4-8`; yuqori hajmda `claude-haiku-4-5` (env orqali) — arzonroq,
  tasnif uchun yetarli ([narx tahlili oldingi javobда]).
- **Optimizatsiya:** (1) evristika filtri — har xabarga chaqirmaydi; (2) "savol?" + "kim?" bitta
  structured-output chaqiruvда; (3) prompt caching (tizim + few-shot prefiksi).
- **Qat'iy chegara:** AI KPI/bonus/jarima **hech qachon** hisoblamaydi — faqat tasnif/marshrut/STT.

---

## 14. Rol-ruxsatlar (mavjud RBAC reuse)

- Telegram rollari → mehnat-ai `UserRole` (accountant, bank_manager, supervisor, chief_accountant).
  (Eslatma: `KpiRule.role` 'bank_client' deydi, `UserRole` 'bank_manager' — mapping qatlami.)
- `/assign_role`, `/kpi_award` kabi buyruqlar: `TelegramIdentity` → `User` → **mavjud RBAC**
  ([lib/permissions.ts](lib/permissions.ts)) bilan avtorizatsiya. Yaqinda qurilgan tahrirlanadigan
  RBAC (`SystemSetting.roleViews`) UI ko'rinishini boshqaradi; bot buyruqlari server-side rol
  massivlari bilan tekshiriladi (backstop).
- Har qo'lda tuzatish/rol o'zgarishi → `AuditLog` (kim/qachon/eski/yangi/sabab).

---

## 15. API kontraktlari

**Tashqi (Telegram → mehnat-ai):**
- `POST /api/telegram/webhook` — secret token header; body Telegram Update; javob 200 (bo'sh).

**Ichki portlar (bot, DDD):**
- `AiPort.classify(text): { isQuestion, role, confidence }`
- `AiPort.transcribe(audio): string`
- `TelegramGateway.send(chatId, text)`
- `KpiLedger.append(event)` · `KpiRollup.recompute(period)`
- Repozitoriylar: `QuestionRepo`, `MessageRepo`, `AttendanceRepo`, `KpiEventRepo` (Prisma).

**Next.js read (dashboard):** mavjud `server/kpi.ts`, `server/cabinet.ts` — yangi read-model
sorovlari (bugungi savollar, kechikkanlar, davomat, reyting). Write yo'liga tegmaydi (CQRS).

---

## 16. Cron / fon vazifalari

| Job | Chastota | Vazifa |
|---|---|---|
| Deadline sweep | har 1 daq | pending Question deadline o'tganlarni LATE + KpiEvent + eskalatsiya |
| Report deadline sweep | har 15 daq | ReportDeadline/ReportProof kechikkanlarni tekshirish |
| Attendance close | kunlik 18:30 | kelmaganlar → absentDays |
| KPI rollup | kunlik + oylik | KpiEvent → MonthlyPerformance qayta hisoblash |
| Escalation | har 5 daq | 🟡🟠🔴 darajalarni yuborish |
| **To'lov eslatmasi** | kunlik (ish vaqti) | to'lamagan firmalar → guruhga 🟡🟠🔴 eslatma (§11-B) |
| ProcessedUpdate cleanup | kunlik | eski dedup yozuvlarni o'chirish |

Barchasi Postgres holatidan o'qiydi (restart-safe); BullMQ repeatable jobs orqali.

---

## 17. Masshtablash (200–500 guruh, 10k–100k xabar/kun)

- **Partitioning:** `TelegramMessage` — oylik `createdAt` partition; `@@index([chatId, createdAt])`.
- **Indekslar:** `(chatId, createdAt)`, `(userId, periodMonth)`, `Question(status, deadlineAt)`,
  `KpiEvent(employeeId, periodMonth)`.
- **Async yozish:** barcha yozuv navbat orqali; webhook < 50ms.
- **Idempotentlik:** `ProcessedUpdate.updateId` unique — Telegram qayta yuborsa ikki marta emas.
- **Stateless workerlar:** gorizontal scale (bir nechta bot instance, bir Redis).
- **DB pool:** Prisma 7 + `@prisma/adapter-pg`; yuqori concurrencyда **pgBouncer** (transaction pool)
  tavsiya — Next.js + workerlar bir DB ga ko'p ulanadi.
- **Redis:** BullMQ uchun ajratilgan instance; kesh + navbat.
- **AI cost nazorati:** evristika filtri + prompt caching + Haiku → 100k/kunда ham boshqariladi.

---

## 18. Ochiq qarorlar (tasdiq/tanlash kerak)

> **✅ Hal qilingan (2026-07-16):** (1) framework — **sof-TS DDD**, NestJS emas (repo `tsconfig`
> dekoratorlarni yoqmagan, Next build'ni xatarga qo'ymaslik uchun); (4) webhook — **Next.js
> `app/api/telegram/webhook`**. **Keyinroq (bloklamaydi):** (2) report reconciliation → Faza G
> (`ReportDeadline` + `ReportProof`ga moyillik), (3) STT → Faza H, (5) deploy → Faza J.
> **Sizdan kerak (Faza F2 dan oldin):** (6) to'lov eslatmasi eskalatsiya kunlari + matn shablonlari,
> (7) 🔴 eslatma kimga boradi.

1. ~~**Bot framework:** NestJS *yoki* sof TS DDD?~~ → **sof-TS DDD** (yuqoridagi izoh).
2. **Report reconciliation (§11):** bot report-SLA sini mavjud `ReportProof`ga bog'laymizmi,
   yoki yangi `ReportDeadline` qo'shamizmi?
3. **STT provayderi:** OpenAI Whisper (`uz`) yoki Google Cloud STT (`uz-UZ`)? (Ovoz hajmiga qarab.)
4. ~~**Webhook joylashuvi:**~~ → **Next.js `app/api/telegram/webhook`** (yuqoridagi izoh).
5. **Deploy:** PM2 yoki Docker Compose (web + bot + redis + postgres + pgBouncer)?
6. **To'lov eslatmasi jadvali (§11-B):** eskalatsiya kunlari (🟡 paymentDay · 🟠 +? kun · 🔴 +? kun)
   va matn shablonlari — sizning qiymatlaringiz qanday? Kim `SystemSetting`дан tahrirlaydi?
7. **Eslatma kimga:** faqat firma guruhigami, yoki mas'ul buxgalter/bank-klientga ham (🔴 да)?

---

## 19. Fazalar (mehnat-ai birlashtirilgan reja)

| Faza | Mazmun |
|---|---|
| **A** | Infra: Prisma schema qo'shimchalari (§5), Redis/BullMQ setup, webhook skeleti, `bot/main.ts`, DomainEventBus, value objects (+ testlar) |
| **B** | Identity: `TelegramGroup`/`TelegramIdentity`, `/assign_role`, User↔Telegram mapping |
| **C** | Monitoring + Question Engine: capture, evristika, Claude klassifikator, deadline cron |
| **D** | ~~Attendance (Telegram)~~ → **e-jurnal integratsiyasi** (Next.js): `lib/attendance.ts` + `lib/ejurnal.ts` + `deriveAttendanceKpi` — ✅ bajarildi |
| **E** | ✅ KPI **ledger**: `KpiEvent` (idempotent append), atribut, savol→hodisa, `/kpi_award`/`/kpi_penalty`, `rollupLedger`. ✅ **payroll proyeksiya**: `projectResponseKpiToPerformance` → `submitted` `MonthlyPerformance` (approval-gated, approved qatorni bezovta qilmaydi) |
| **F** | Notifications: eskalatsiya + grammY yuborish |
| **F2** | ✅ **Billing & To'lov eslatmalari** (§11-B) TO'LIQ: `assessDebt`+`detectPeriodDebts`+`buildReminderMessage` (sof, test), `runBillingReminders` pipeline (reserve→send→update, retry-safe, dublikat yo'q), routing 🟡🟠→guruh / 🔴→guruh+in-app (buxgalter+direktor), kunlik cron (`BILLING_CRON_HOUR`, default 09:00). Eskalatsiya: 🟡 muddat kuni, 🟠 +3, 🔴 +7 |
| **G** | Reports reconciliation (§11 qarorига ko'ra) |
| **H** | STT (ovoz), AI cost tuning, prompt caching |
| **I** | Dashboard read-model (mavjud UI ga bot metrikalari), yuklama testi |
| **J** | Productionization: pgBouncer, PM2/Docker, observability |

---

## 20. Tekshirish mezoni

- Domain logika — DB'siz jest testlari (ResponseWindow/WorkingHours — 24 test namunasi).
- Har Prisma migratsiya — jonli Postgres'да tekshiriladi (mehnat-ai memory: prisma generate'дан
  keyin dev serverни restart — 500 "Unknown field" oldini olish).
- Har worker — navbatga qo'lda job tashlab, natija DB'да tekshiriladi.
- Rollup — qo'lda ishga tushirilib, qo'lda hisoblangan misol bilan solishtiriladi.
- Yuklama: sintetik 10k+ xabar/kун simulyatsiyasi, navbat kechikishi o'lchanadi.
```
