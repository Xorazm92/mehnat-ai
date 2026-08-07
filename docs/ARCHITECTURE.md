# ASRO arxitekturasi

> Qoidalar — [`CONSTITUTION.md`](./CONSTITUTION.md). Mahsulot — [`PRODUCT.md`](./PRODUCT.md).
> Bu hujjat: kod qayerda yashaydi va nega.

---

## 1. Yagona qoida

```
lib/engines/**  →  ichki import faqat:  lib/engines/**  ·  lib/platform/**
                   (tashqi npm paketlari va @prisma/client cheklanmaydi)
```

O'q **har doim ichkariga** qaraydi. Engine domenni ham, adapterni ham bilmaydi.
Buni [Modda 4a](./CONSTITUTION.md#modda-4a--bogliqlik-oqi-ichkariga-qaraydi) (AST) va
[4b](./CONSTITUTION.md#modda-4b--core-domen-lugatini-bilmaydi) (regex) majburlaydi.

Qolgan hamma narsa shu bitta qoidadan kelib chiqadi.

---

## 2. Qatlamlar

```
                          ┌─────────────────┐
                          │   UI / Cockpit  │
                          └────────┬────────┘
                          ┌────────┴────────┐
                          │    Decision     │   nima qilish kerak
                          └────────┬────────┘
     AI qatlam EMAS — u har bir qatlamning ichida:
     tanidi → anomaliya → ball izohi → brifing → tavsiya
                                   │
     ┌─────────────────────────────┴─────────────────────────────┐
     │                       ASRO CORE                           │
     │  Obligation · Evidence · Workflow · Automation · Analytics│
     │             (domen lug'atini BILMAYDI)                    │
     └─────────────────────────────┬─────────────────────────────┘
        ┌──────────────────────────┼──────────────────────────┐
   ┌────┴─────┐            ┌───────┴───────┐          ┌───────┴───────┐
   │ DOMAINS  │            │   ADAPTERS    │          │   PLATFORM    │
   │ accounting│           │ excel  1c     │          │ auth  rbac    │
   │ (audit)   │           │ didox  soliq  │          │ audit  queue  │
   │ (legal)   │           │ bank  telegram│          │ prisma  log   │
   │ (hr)      │           │               │          │               │
   └───────────┘            └───────────────┘          └───────────────┘
     ↑ darvoza ortida         ↑ shartnoma bir xil
```

**Nima uchun bu ish beradi.** Yadro allaqachon deyarli neytral: `lib/deadlines.ts`
(126 qator) va `lib/applicability.ts` (89 qator) da **bironta import yo'q**,
`DeadlineTemplate` da bironta soliq maydoni yo'q, `ObligationStatus`
(`planned → sent → accepted`) sud ishiga ham, audit dalili ga ham, ta'til arizasiga
ham bir xil to'g'ri keladi. Ajratish yangi arxitektura qurish emas — **mavjudini
ko'rinadigan qilish**.

---

## 3. Fayllar qayerga ko'chadi (A2 — sof `git mv`)

### `lib/engines/` — domen-neytral yadro

| Katalog | Mavjud fayllar |
|---|---|
| `obligation/` | `deadlines.ts` · `applicability.ts` · `obligations.ts` · `obligationRun.ts` · `obligationDelay.ts` · `horizon.ts` |
| `workflow/` | `obligationWorkflow.ts` · `taskWorkflow.ts` · `taskSla.ts` |
| `evidence/` | `claim.ts` · `store.ts` · `landing.ts` |
| `automation/` | `obligationSweep.ts` · `escalation.ts` · `dailyDigest.ts` · `twinAlerts.ts` · `bot/queues/*` |
| `analytics/` | `margin.ts` · `timeCost.ts` · `twin.ts` (Risk · Capacity · Compliance) |

### `lib/domains/accounting/` — UZ buxgalteriya lug'ati

`reportColumns.ts` · `reportGroups.ts` · `reportTypes.ts` · `operationTemplates.ts` ·
`reportPermissions.ts` · `matrixWrite.ts` · `matrixRead.ts` · `subjects.ts` ·
`normativeEffort.ts` · `twinCompute.ts` · `twinAlertRun.ts` · `ai/knowledge.ts` ·
`kpiEvidence.ts` · `kpiLabels.ts` · template seed'lari

**Nega `twinCompute.ts` domen qatlamida, engine'da emas:** u Prisma jadvallarini
(`Company`, `Obligation`, `Question`) so'raydi va `complexity` / `obligationType`
kabi buxgalteriya atamalarini biladi. Engine'da faqat `twin.ts` — sof matematika:
raqam kiradi, ball va sabab chiqadi.

### `lib/adapters/` — tashqi manbalar

`oneCIngest.ts` → `adapters/onec/` · `ejurnal.ts` · `telegramInitData.ts` ·
*(yangi: `excel/` — 2-versiya)*

### `lib/platform/` — domendan qat'i nazar kerak

`prisma.ts` · `auth.ts` · `auth.config.ts` · `access.ts` · `permissions.ts` ·
`auditTrail.ts` · `logger.ts` · `errors.ts` · `rateLimit.ts` · `redis.ts` ·
`crypto.ts` · `sessionRevalidation.ts` · `serialize.ts` · `format.ts` · `periods.ts` ·
`nameMatch.ts` · `phone.ts` · `passwordUtils.ts`

### `lib/` da qoladi — hech biriga tegishli emas

`cached-queries.ts` (Next.js kesh qatlami) · `navigation.ts` · `constants.ts` ·
`translations.ts` · `exportTable.ts` · `imageCompress.ts` · `admin/registry.ts` ·
va biznes-mantiq fayllari (`balance.ts`, `ledger.ts`, `monthClose.ts`, `payroll`
oilasi, `kpiLogic.ts`, `kpiScoring.ts`, `attendance.ts`, …) — ular **firma
operatsiyasi**, engine emas va domen lug'ati emas.

> **A2 ning intizomi:** `git mv` + import yo'llari. **0 ta mantiq o'zgarishi.**
> Diff faqat yo'llardan iborat bo'lsa, ko'rib chiqish 10 daqiqada tugaydi.
> Mantiq o'zgarishlari — A3 da, alohida PR.

---

## 4. Ajratishdan keyin nima tuzatiladi (A3)

4a/4b testlari ko'rsatadigan **uchta** joy. Boshqa hech narsa emas — o'lchangan.

| # | Joy | Hajm |
|---|---|---|
| 1 | `applicability.ts:matchesCriterion` — 6 case'dan 3 tasi soliqqa xos (`tax_regime`, `vat_payer`, `stats_type`) | ~15 qator |
| 2 | `CompanyFacts` — 2 ta maydon (`taxRegime`, `statsType`) | 2 qator |
| 3 | `Company` ning ~12 soliq ustuni atribut proyeksiyasiga | ustunlar joyida qoladi |

```ts
// oldin — accounting'ga qattiq bog'langan
export interface CompanyFacts {
  id: string; isActive: boolean; companyStatus: string | null;
  contractDate: Date | null;
  taxRegime: string; statsType: string | null; activeServices: string[];
}

// keyin — domen-neytral
export interface SubjectFacts {
  id: string; isActive: boolean;
  status: string | null;          // ilgari companyStatus
  startedAt: Date | null;         // ilgari contractDate
  attributes: Record<string, string | string[]>;
}
```

`matchesCriterion` ikkiga bo'linadi: generic atribut moslashtiruvchi engine'da qoladi,
`tax_regime` / `vat_payer` / `stats_type` esa `lib/domains/accounting/attributes.ts`
dagi proyeksiyaga aylanadi (`Company` → `attributes`).

**Tip nega `string | string[]`, `unknown` emas.** `TemplateApplicability.criteriaValue`
sxemada `String` — moslashtirish har doim satr bilan bo'ladi, va `vat_payer`
allaqachon `"true"` / `"false"` satri sifatida ishlaydi. `unknown` har bir shoxda tip
tekshiruvi talab qiladi va evaziga hech narsa bermaydi. Muhimi: **kengaytirish orqaga
mos, torayish esa yo'q** — keyin `| number` qo'shish bir qatorlik o'zgarish,
teskarisi hamma chaqiruvchini buzadi.

**Yon foyda:** B blokda 51 ustun uchun kerak bo'lgan `company_flag` kriteriyasi
qattiq yozilgan oq ro'yxat o'rniga generic atribut bo'ladi.

---

## 5. Core / Domain / Adapter — bugungi kod bo'yicha

| Core (engine) | Domain (accounting) | Adapter |
|---|---|---|
| Muddat matematikasi, ish kunlari | UZ soliq kalendari, 52 template | Excel import |
| Applicability (generic atribut) | `tax_regime`, `stats_type`, `hasLandTax` | 1C agent |
| Holat mashinasi, o'tish huquqlari | Matritsa ustun nomlari va tartibi | Didox / Soliq |
| Dalil qabuli, `confidence` siyosati | UZ soliq bilim bazasi | Bank |
| Eskalatsiya, digest, navbatlar | KPI qoida nomlari (`acc_*`, `sup_*`) | Telegram |
| Marja, sig'im, xavf formulalari | Normativ daqiqalar | — |

---

## 6. Plugin runtime QURILMAYDI

Dinamik yuklash yo'q. Plugin registry yo'q. Marketplace yo'q.

"Plugin chegarasi" — bu **kod qayerda yashashi mumkinligi haqidagi qoida**, CI testi
bilan majburlanadi. Audit moduli kelganda 80% kodni qayta ishlatish shundan keladi —
platforma infratuzilmasi narxining 1% evaziga.

Framework qurib bo'lmaydi — u **o'stiriladi**. Ikkinchi vertikal kodni umumlashtirish
uchun kerak bo'lgan ma'lumotni beradi; usiz umumlashtirsangiz, noto'g'ri abstraksiya
olasiz va uni buzish yangidan yozishdan qimmat turadi.

Darvoza — [Modda 9](./CONSTITUTION.md#modda-9--platforma-elon-qilinmaydi-ishlab-topiladi) ·
[ADR-0012](./adr/0012-a-platform-is-earned-not-declared.md)

---

## 7. Jarayon holati

| Jarayon | Nima ishlaydi |
|---|---|
| `asro-web` | Next.js (`next start -p 3000`), fork, 1 instance |
| `asro-bot` | `tsx bot/main.ts` — 6 BullMQ worker + in-process cron. **1 instance majburiy** (ikkitasi deadline sweep'ni ikki marta yuritadi) |

Ikkalasi `TZ=Asia/Tashkent`. Migratsiya faqat `prisma migrate deploy` —
`migrate dev` sxemadagi out-of-band qo'llanilgan modellarni jimgina reset qiladi.
