# Obligation Unification — Arxitektura va Migratsiya Rejasi

> **Holat: REJA** · 2026-07-26 — bajarilmagan yoki qisman bajarilgan ish.
> Migratsiya hali bajarilmagan. Mahsulot yaxlitligi rejasining 3-to'lqini.
> Amaldagi hujjatlar xaritasi: [`docs/README.md`](../README.md)

> **Holat:** REJA. Hech qanday migratsiya bajarilmagan va bu hujjat bo'yicha
> schema o'zgartirilmaydi. Faza 0 dagi qarorlar tasdiqlanmaguncha kod yozilmaydi.
>
> Oxirgi tekshiruv: 2026-07-26 (lokal DB, `inbola`).

---

## 1. Hozirgi holat — o'lchangan, taxmin qilinmagan

Lokal bazadagi haqiqiy raqamlar:

| Jadval | Qatorlar | Izoh |
|---|---:|---|
| `Company` | 212 | |
| `MonthlyReport` | **6** | faqat **1 ta** davr (`2026-03`) |
| `ReportProof` | 6 | base64 skrinshotlar |
| `Obligation` | **2 571** | hammasi `planned` holatida |
| `DeadlineTemplate` | **6** | 53 ta ustunga qarshi |
| `ObligationSubmission` | 0 | hali ishlatilmagan |
| `Operation` (eski model) | 0 | o'lik |

Ustun kalitlari uch xil ko'rinishda mavjud:

- **`OperationFieldKey`** (snake_case, `types.ts`) — **kanonik** UI/domain kalit fazosi, 53 ta kalit.
- **`MonthlyReport`** ustunlari (camelCase, Prisma) — `FIELD_TO_DB_COLUMN` orqali bog'lanadi.
- **`BASE_REPORT_COLUMNS`** (`lib/reportColumns.ts`) — matritsada ko'rinadigan 46 ta ustun + 4 ta `_tolov` juftligi. `bank_klient`, `nds_bekor_qilish`, `statistika` matritsada ko'rinmaydi.

### 1.1. Endi qo'shilgan narsa: kategoriya metadatasi

`lib/reportGroups.ts` — har bir ustunga `OPERATSION | SOLIQ | STATISTIKA | MAXSUS`
belgisi. **Hech qanday ustun o'chirilmadi yoki o'zgartirilmadi**; bu sof qo'shimcha
qatlam va migratsiyada `Obligation` turkumini to'ldirish uchun oldindan tayyorlangan.

Muhim xususiyat: `Record<OperationFieldKey, ReportCategory>` tipi to'liqlikni
**kompilyatsiya vaqtida** majburlaydi — `types.ts` ga yangi ustun qo'shilib bu
yerga yozilmasa, build TS2741 xatosi bilan to'xtaydi. Runtime seed yoki DB
jadvali bunday kafolat bera olmagani uchun `ReportColumnGroup` jadvali
**qasddan yaratilmadi** (ilgari yozilgan qoralamasi o'chirildi).

---

## 2. Asosiy topilma: `UnifiedObligation` yaratilmasin

Bu hujjatning avvalgi qoralamasi yangi `UnifiedObligation` modelini taklif qilgan
edi. **Bu tavsiya bekor qilinadi.** Loyihada allaqachon undan ancha yetuk
`Obligation` dvigateli ishlab turibdi (2 571 qator). Qoralama model uni
almashtirsa, quyidagilar **yo'qoladi**:

| `Obligation` da bor | `UnifiedObligation` qoralamasida |
|---|---|
| `templateId` + `templateVersion` snapshot | ❌ yo'q — qoida versiyalanmaydi |
| `periodStart`/`periodEnd`/`periodKey` | faqat `period: String` |
| `responsibleUserId` + `backupUserId` snapshot | faqat `submittedById` |
| `delayReason` + 2 bosqichli tasdiq (KPI exclusion) | ❌ yo'q |
| `ObligationStatusEvent` / `ObligationAssignmentEvent` audit izi | ❌ yo'q |
| `ObligationSubmission` (`attemptNo`, rad etish kodi) | ❌ yo'q — qayta topshirish tarixi yo'q |
| `SubmissionEvidence` (ko'p dalil, tiplangan) | bitta `proofUrl` |
| `CompanyObligationOverride` / `TemplateApplicability` | ❌ yo'q |

Shuningdek qoralamadagi `ObligationStatus` enum (`PENDING`, `SUBMITTED`, …)
mavjud enum bilan to'qnashadi. **Amaldagi enum saqlanadi:**
`planned | in_progress | ready | sent | accepted | rejected | cancelled`.

**Xulosa:** birlashtirish = `MonthlyReport` ni mavjud `Obligation` dvigateliga
ko'chirish. Yangi model yaratilmaydi.

---

## 3. Haqiqiy to'siq: template qamrovi, ma'lumot migratsiyasi emas

Avvalgi reja "60 ta ustun qiymatlarini script orqali migratsiya qilish" ni asosiy
ish deb belgilagan. Raqamlar buni rad etadi: `MonthlyReport` da **6 qator, 1 ta
davr** bor. Bu bir martalik, arzimas ko'chirish.

Asl ish — **qamrov**: 53 ta ustundan faqat ~6 tasi uchun `DeadlineTemplate` bor.

| Mavjud template | Qamraydigan ustun |
|---|---|
| `QQS_DECL` (monthly) | `aylanma_qqs` |
| `AYLANMA_SOLIQ` (quarterly) | `aylanma_qqs` |
| `DAROMAD_AGENT` (monthly) | `daromad_soliq` |
| `INPS_IJTIMOIY` (monthly) | `inps` |
| `FOYDA_YILLIK` (annual) | `foyda_soliq` |
| `MOLIYAVIY_YILLIK` (annual) | `moliyaviy_natija`, `buxgalteriya_balansi` |

Diqqat: moslik **1:1 emas**. `QQS_DECL` va `AYLANMA_SOLIQ` ikkalasi ham bitta
`aylanma_qqs` ustuniga tushadi (turli soliq rejimlari uchun), `MOLIYAVIY_YILLIK`
esa ikkita ustunni qamraydi. Ya'ni "ustun → template" emas, **"template →
ustun(lar)"** yo'nalishi kanonik: template qoidani, ustun esa faqat ko'rsatishni
bildiradi.

Qolgan ~47 ta ustun uchun template, `TemplateApplicability` qoidalari va muddat
langarlari yozilishi kerak — bu huquqiy/buxgalteriya bilimi talab qiladigan
qism, va bu loyihaning eng katta qolgan mehnati.

---

## 4. Maqsadli arxitektura

```
DeadlineTemplate (qoida: kod, davriylik, muddat langari, versiya)
      │
      ├── TemplateApplicability  (kimga tegishli: soliq rejimi, QQS to'lovchi, …)
      ├── CompanyObligationOverride (firma bo'yicha istisno: disable/custom_due/reassign)
      │
      └── Obligation (firma × davr instansiyasi, mas'ul snapshot, muddat, holat)
             ├── ObligationStatusEvent      (audit izi)
             ├── ObligationAssignmentEvent  (audit izi)
             └── ObligationSubmission (attemptNo, rad etish kodi)
                     └── SubmissionEvidence (skrinshot/hujjat, tiplangan)

lib/reportGroups.ts  →  Obligation turkumi (OPERATSION/SOLIQ/STATISTIKA/MAXSUS)
lib/reportColumns.ts →  matritsa ko'rinishi (label, tartib, admin override)
```

`MonthlyReport` matritsasi **ko'rinish qatlamiga aylanadi**: `Obligation`
qatorlaridan hosil qilinadigan proyeksiya. Jadvalning o'zi darhol o'chirilmaydi.

---

## 5. Fazalar

### Faza 0 — Qarorlar (hozir; kod yo'q)
- [ ] MAXSUS turkumini ajratish kerakmi? (§6.1)
- [ ] `aylanma_qqs` kabi ko'p-template-bir-ustun holatlari matritsada qanday ko'rsatiladi? (§6.2)
- [ ] `ReportProof.imageData` (base64, DB ichida) qayerga ko'chadi? (§6.3)
- [ ] Prod DB raqamlari lokal bilan bir xilmi — migratsiya hajmini tasdiqlash.

### Faza 1 — Metadata (BAJARILDI)
- [x] `lib/reportGroups.ts`: 53/53 ustun uchun kategoriya, tip bilan kafolatlangan.
- [x] `CATEGORY_TO_OBLIGATION_TYPE` — migratsiya skripti uchun yagona moslik manbai.
- [x] `ReportColumnGroup` jadvali va migratsiyasi olib tashlandi.
- [ ] Matritsa UI da kategoriya sarlavhalari (`groupByCategory`) — ixtiyoriy, ko'rinish yaxshilanishi.

### Faza 2 — Template qamrovi (eng katta ish)
- [ ] Qolgan ~47 ta ustun uchun `DeadlineTemplate` yozish (kod, davriylik, langar, muddat).
- [ ] Har biriga `TemplateApplicability` — 212 ta firmaning hammasiga hamma majburiyat tegishli emas.
- [ ] `scripts/seed-deadline-templates.ts` ni kengaytirish (u allaqachon `code_version` bo'yicha idempotent).
- [ ] Har bir template `draft` → ko'rib chiqish → `active` yo'lidan o'tsin.

### Faza 3 — Yozish yo'lini ko'chirish
- [ ] `server/proofs.ts` `ReportProof` o'rniga `ObligationSubmission` + `SubmissionEvidence` yozsin.
- [ ] Matritsa katagi `Obligation.status` ni yangilasin (`ObligationStatusEvent` bilan).
- [ ] `MonthlyReport` ga yozish **to'xtatiladi**; jadval o'qish uchun qoladi.

### Faza 4 — O'qish yo'lini ko'chirish
- [ ] `mapMonthlyReportToOperationEntry` o'rniga `Obligation` dan proyeksiya.
- [ ] Matritsa, kabinetlar, KPI hisoblari yangi manbadan o'qisin.
- [ ] Eski va yangi manbani yonma-yon solishtirish (farq bo'lsa — to'xtash).

### Faza 5 — Tozalash (faqat 4 barqaror ishlagach)
- [ ] 6 ta `MonthlyReport` qatorini `Obligation` ga ko'chirish (bir martalik, arzon).
- [ ] `model Operation` (0 qator, o'lik) — o'chirish.
- [ ] `MonthlyReport` + `ReportProof` ni o'chirish — **alohida qaror, alohida PR**.

---

## 6. Ochiq savollar

### 6.1. MAXSUS turkumi ikki xil narsani birlashtirgan
Hozir `MAXSUS` ichida ham moliyaviy hisobotlar (`foyda_va_zarar`,
`moliyaviy_natija`, `buxgalteriya_balansi`), ham IT Park/kommunal to'lovlar bor.
Bular tabiatan boshqa. Taklif: `MOLIYAVIY` (FINANCIAL) turkumini ajratib,
`MAXSUS` ni IT Park + kommunal uchun qoldirish. Mavjud `DeadlineTemplate`
allaqachon `financial_statement` turini ishlatmoqda — bu ajratishni qo'llab-quvvatlaydi.
**Hozir o'zgartirilmadi**, chunki bu turkum nomlari qarori.

### 6.2. Ko'p template → bitta ustun
`aylanma_qqs` ustuniga `QQS_DECL` ham, `AYLANMA_SOLIQ` ham tushadi. Matritsada
bitta katak ikkita majburiyatni ko'rsatishi kerakmi, yoki firma soliq rejimiga
qarab faqat bittasi ko'rinadimi? Ikkinchisi to'g'riroq va `TemplateApplicability`
buni allaqachon qo'llab-quvvatlaydi.

### 6.3. Dalil saqlash formati o'zgaradi
`ReportProof.imageData` — base64 data URL, to'g'ridan-to'g'ri Postgres `@db.Text`
ustunida. `SubmissionEvidence.storageRef` esa **havola** kutadi. Ya'ni bu shunchaki
ustun ko'chirish emas, saqlash joyi o'zgarishi (S3/disk). Hozir atigi 6 ta dalil
bor — ko'chirish arzon, lekin yangi saqlash qatlami qaror talab qiladi.

---

## 7. Xavflar

| Xavf | Ta'sir | Yumshatish |
|---|---|---|
| Template qamrovi to'liq bo'lmay UI ko'chirilsa | Majburiyatlar jim yo'qoladi | Faza 4 dan oldin 53/53 qamrov tekshiruvi |
| `Obligation` 212 firma × 53 template × davr | Qator soni tez o'sadi (~135k/yil) | `TemplateApplicability` bilan cheklash; `dueAt`/`periodKey` indekslari bor |
| Schema da commit qilinmagan modellar bor | `migrate dev` butun holatni buzadi | **`prisma migrate dev` ishlatilmaydi** — qo'lda migratsiya + `migrate deploy` |
| Prod raqamlari lokaldan farq qilishi | Migratsiya hajmi noto'g'ri baholanadi | Faza 0 da prodda qayta o'lchash |

---

## 8. Bu hujjat bo'yicha nima QILINMADI

Aniqlik uchun: `prisma/schema.prisma` ga bu reja bo'yicha hech narsa
qo'shilmadi, hech qanday migratsiya yozilmadi va `MonthlyReport` ning birorta
ustuni o'chirilmadi yoki nomi o'zgartirilmadi. Yagona kod o'zgarishi —
`lib/reportGroups.ts` metadatasi va foydalanilmagan `ReportColumnGroup`
qoralamasining olib tashlanishi.
