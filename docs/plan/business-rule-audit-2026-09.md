# Biznes-qoida auditi — shablon mosligi + KPI reglamenti

**Sana:** 2026-09-06 · **Manba:** PROD (`16.192.135.23`, faqat `SELECT`, tunnel yopilgan)
**Holat:** ⛔ PRODga hech qanday yozuv kiritilmadi. `INSERT`/`UPDATE`/`DELETE`/`CANCEL`/`migrate apply` — yo'q.

> **2026-09-07 YANGILANISHI — TASDIQ OLINDI.** Bosh buxgalter 24 ta savolga
> javob berdi; har javob prod ma'lumotiga qarshi o'lchandi. Natija:
> **4 tasdiqlandi · 12 rad etildi · 8 keyinroq**. Tasdiqlangan 4 tasi ham
> `draft` — ya'ni **hech qanday majburiyat bekor qilinmaydi**.
> Qarorlar va sabablari: [service-key-migration-runbook.md](service-key-migration-runbook.md#qabul-qilingan-qarorlar--2026-09-07).
>
> Ikkita raqam ham o'zgardi: chetlab o'tiladigan firma **31 → 47**
> (ro'yxati chala 16 ta firma qo'shildi), tegiladigan majburiyat
> **1 868 → 1 394**. Quyidagi §1 jadvali BIRINCHI o'lchov (2026-09-06) —
> tarix uchun saqlanadi.

---

## §1 Shablon moslik jadvali — 24 ta nomzod

Nomzod = `matrixKey` bor, lekin `TemplateApplicability(service_key)` qoidasi YO'Q.
Bunday shablon shu mezon bo'yicha **universal** ishlaydi va kaliti yo'q firmaga ham tushadi.

Kutilayotgan qoida har birida bir xil: **`service_key = matrixKey`**.

| # | Shablon | matrixKey | Davr | Holat | Hozirgi mezon | Kaliti bor | Tegiladi (firma) | Jami | Ochiq | Yopilgan | Tasdiq |
|---|---|---|---|---|---|--:|--:|--:|--:|--:|:--:|
| 1 | `MATERIALS` Material hisoboti | `tovar_ostatka` | oylik | active | — | 54 | 185 | 554 | 554 | 0 | ☐ |
| 2 | `PNL_REPORT` Foyda va zarar | `foyda_va_zarar` | oylik | active | — | 172 | 67 | 201 | 201 | 0 | ☐ |
| 3 | `CASHFLOW` Pul oqimlari | `pul_oqimlari` | oylik | active | — | 177 | 62 | 186 | 185 | 1 | ☐ |
| 4 | `AR_AP` Debitor-kreditor | `debitor_kreditor` | oylik | active | — | 183 | 56 | 168 | 168 | 0 | ☐ |
| 5 | `FOYDA_YILLIK` Foyda solig'i | `foyda_soliq` | choraklik | active | — | 170 | 69 | 136 | 136 | 0 | ☐ |
| 6 | `ONEC_BASE` 1C baza tayyor | `one_c` | oylik | active | — | 196 | 43 | 129 | 129 | 0 | ☐ |
| 7 | `TAX_SCHEDULE` Soliq sana+summa | `chiqadigan_soliqlar` | oylik | active | — | 207 | 32 | 96 | 96 | 0 | ☐ |
| 8 | `PAYROLL_CALC` Raschot zarplata | `hisoblangan_oylik` | oylik | active | — | 201 | 38 | 76 | 76 | 0 | ☐ |
| 9 | `LETTERS` Xatlar hisobi | `xatlar` | oylik | active | — | 217 | 22 | 66 | 66 | 0 | ☐ |
| 10 | `INPS_IJTIMOIY` INPS va ijtimoiy soliq | `inps` | oylik | active | — | 219 | 20 | 60 | 45 | 15 | ☐ |
| 11 | `DAROMAD_AGENT` Daromad solig'i | `daromad_soliq` | oylik | active | — | 229 | 10 | 30 | 24 | 6 | ☐ |
| 12 | `QQS_DECL` QQS deklaratsiyasi | `qqs` | oylik | active | `tax_regime=vat` | 171 | 8 | 18 | 11 | 7 | ☐ |
| 13 | `MOLIYAVIY_YILLIK` Moliyaviy hisobot | `moliyaviy_natija` | yillik | active | — | 230 | 9 | 9 | 9 | 0 | ☐ |
| 14 | `AYLANMA_SOLIQ` Aylanma soliq | `aylanma` | oylik | active | `tax_regime=turnover` | 66 | 136 | 139 | 4 | 135 | ☐ |
| 15 | `AVTOKAMERAL` Avtokameral nazorat | `avtokameral` | oylik | **draft** | — | 209 | 0 | 0 | 0 | 0 | ☐ |
| 16 | `BONAK` Bo'nak (avans) | `bonak` | oylik | **draft** | — | 27 | 0 | 0 | 0 | 0 | ☐ |
| 17 | `BUX_BALANS` Buxgalteriya balansi | `buxgalteriya_balansi` | choraklik | **draft** | — | 230 | 0 | 0 | 0 | 0 | ☐ |
| 18 | `DIDOX_FLOW` Didox (e-aylanma) | `didox` | oylik | **draft** | — | 202 | 0 | 0 | 0 | 0 | ☐ |
| 19 | `EKOLOGIYA` Ekologiya hisoboti | `ekologiya` | oylik | **draft** | — | 20 | 0 | 0 | 0 | 0 | ☐ |
| 20 | `ITPARK_OYLIK` IT Park hisoboti | `itpark_oylik` | choraklik | **draft** | — | 14 | 0 | 0 | 0 | 0 | ☐ |
| 21 | `MOL_MULK_SOLIQ` Mol-mulk solig'i | `mol_mulk_soligi` | yillik | **draft** | — | 31 | 0 | 0 | 0 | 0 | ☐ |
| 22 | `MY_MEHNAT` my.mehnat.uz nazorati | `my_mehnat` | oylik | **draft** | — | 210 | 0 | 0 | 0 | 0 | ☐ |
| 23 | `SUV_SOLIQ` Suv solig'i | `suv_soligi` | yillik | **draft** | — | 29 | 0 | 0 | 0 | 0 | ☐ |
| 24 | `YER_SOLIQ` Yer solig'i | `yer_soligi` | yillik | **draft** | — | 37 | 0 | 0 | 0 | 0 | ☐ |

**JAMI:** tegiladigan majburiyat **1 868** · ochiq **1 704** · shundan `planned` **1 673** · yopilgan **164**
**Tegiladigan firma:** 226 · **Hisobdan chiqarilgan (kalitsiz):** 31

### 1.1 Uch toifa firma — ataylab ajratilgan

| Toifa | Ma'no | Migratsiya |
|---|---|---|
| Kaliti **bor** | firma bu hisobotni topshiradi | tegilmaydi |
| Kaliti **yo'q**, boshqa kalitlari bor | ishonchli "topshirmaydi" | majburiyati bekor bo'ladi |
| **Hech qanday kaliti yo'q** (31 firma) | *bilmaymiz* — ma'lumot yo'q | **butunlay chetlab o'tiladi** |

Uchinchi toifani "topshirmaydi" deb talqin qilish — ma'lumot yo'qligini qaror
qilib ko'rsatish bo'lardi. Qoida `lib/domains/accounting/serviceKeyGate.ts` da,
testi `test/service-key-gate.test.ts` §2 da.

### 1.2 Real firma misollari

`MATERIALS` (`tovar_ostatka`) — eng katta ta'sir, 185 firma:

| INN | Firma | Ochiq | Mavjud kalitlari |
|---|---|--:|---|
| 205681704 | ANVAR FARMSERVIS MCHJ | 3 | xatlar, avtokameral, my_mehnat, one_c, … |
| 310638814 | WOOD CITY 1999 MCHJ | 3 | qqs, qqs_tolov, daromad_soliq, … |
| 303240349 | NIGINA FARM SANOAT XK | 3 | xatlar, avtokameral, my_mehnat, one_c, … |

`QQS_DECL` (`qqs`) — 8 firma, ichida diqqatga sazovori:

| INN | Firma | Ochiq | Kalitlari |
|---|---|--:|---|
| 309069570 | UMID HOSPITAL | 3 | **faqat** `ekologiya` |
| 313035787 | BREATH AGENCY MCHJ | 3 | didox, xatlar, avtokameral, my_mehnat, … |
| 310839760 | TAKSIM-KEBAB TEAM | 3 | daromad_soliq, aylanma, buxgalteriya_balansi, … |

> UMID HOSPITAL QQS to'lovchi deb yozilgan, lekin uning yagona xizmat kaliti —
> `ekologiya`. Ikkovidan biri xato. Bu **ma'lumot xatosi**, migratsiya emas.

### 1.3 AND semantikasi — mezon yo'qolmaydi, **torayadi**

`templateApplies` bir `criteriaType` ichida OR, turlar aro **AND** ishlatadi
([applicability.ts:66](../../lib/engines/obligation/applicability.ts#L66)).
Ya'ni `service_key` qo'shilishi mavjud `tax_regime` shartini **almashtirmaydi**,
ustiga qo'shiladi:

| Shablon | Hozir mos | Qoidadan keyin | Tushib qoladi |
|---|--:|--:|--:|
| `QQS_DECL` (`tax_regime=vat` AND `service_key=qqs`) | 175 | **162** | **13** |
| `AYLANMA_SOLIQ` (`tax_regime=turnover` AND `service_key=aylanma`) | 80 | **58** | **22** |

Bu 35 firma **ikki manba zid** bo'lgan holat: soliq rejimi bir narsani,
xizmat kalitlari boshqa narsani aytadi. Ular alohida ko'rib chiqilishi kerak.

---

## §2 Generator oqimi — trace

```
DeadlineTemplate (active + lifecycle=active + effectiveFrom ≤ ref)
  └→ include: applicability
Company (isActive) → loadCompanySubjects
  └→ companyAttributes: tax_regime, vat_payer, company_status,
                        service_key = activeServices[],  has_employees, stats_type
  └→ isSubjectEligible: isActive + status=active + contractDate ≤ ref
for har template:
  cancelStaleRuleObligations   ← davriylik o'zgargan qoldiqlar
  for har yaroqli firma:
    templateApplies(applicability, facts)
      ├ false → skippedNotApplicable++
      │         va JORIY OYNADAGI `planned` qator → cancelled + StatusEvent
      └ true  → override tekshiruvi → dueAt → create (unique bo'yicha idempotent)
```

Fayllar: [obligations.ts:126](../../lib/engines/obligation/obligations.ts#L126) ·
[applicability.ts](../../lib/engines/obligation/applicability.ts) ·
[subjects.ts](../../lib/domains/accounting/subjects.ts)

### 2.1 «1 704 ta ochiq majburiyat haqiqatan bekor qilinadimi?»

**Javob: yo'q — 1 673 tasi bekor qilinadi, 31 tasi qolib ketadi. Va bu faqat bugungi kunga to'g'ri.**

| Holat | Soni | Generator nima qiladi |
|---|--:|---|
| `planned` | **1 673** | ✅ `cancelled` + `ObligationStatusEvent` |
| `in_progress` | 20 | ❌ tegilmaydi — ish boshlangan |
| `sent` | 11 | ❌ tegilmaydi — topshirilgan |
| `accepted` | 23 | ❌ tegilmaydi (yopilgan) |
| `cancelled` | 141 | ❌ allaqachon bekor |

Bekor qiluvchi kod — [obligations.ts:205-233](../../lib/engines/obligation/obligations.ts#L205):
faqat `stale.status === "planned"` bo'lganda `update` qiladi. `sent`/`in_progress`
ni qoldirish **ataylab**: ular bajarilgan ish dalili.

#### ⚠️ Davr oynasi — vaqtga bog'liq xavf

Generator "mos emas" tarmog'ida **faqat joriy oynadagi bitta qatorni** qidiradi
(`companyId_templateId_periodStart_periodEnd` kompozit kaliti bilan), runner esa
joriy oy + `catchUpMonths` ni ko'radi (bot: **2** —
[obligation.worker.ts:22](../../bot/queues/obligation.worker.ts#L22)).

Bugun (2026-09-06) ko'riladigan davrlar: `2026-M07`, `2026-M08`, `2026-M09`, `2026-Q3`, `2026-Y`.
O'lchov: **1 704 ochiqning 1 704 tasi shu oynalar ichida** — ya'ni bugun qo'llansa
hammasi ko'riladi.

Lekin **oyna har oy suriladi**. Agar migratsiya, masalan, dekabrda qo'llansa,
`2026-M07`/`M08` qatorlari oynadan chiqib ketadi va generator ularni **hech qachon
ko'rmaydi** — abadiy `planned` bo'lib qoladi, `/deadlines` da soxta ish bo'lib
turadi va `obligationSweep` ular uchun eskalatsiya yuboradi.

**Xulosa:** migratsiya generatorga tayanmasligi kerak. U bekor qilishni **o'zi**
bajarishi kerak, `periodKey` dan qat'i nazar. Bu §6 talablariga kiritildi.

### 2.2 Yaroqlilik tekshiruvi

Tegiladigan 226 firmaning **hammasi** `isSubjectEligible = true` (o'lchandi).
Ya'ni "firma yaroqsiz bo'lgani uchun majburiyati bekor qilinmay qoladi" degan
qo'shimcha xavf **yo'q**.

---

## §3 Draft shablonlar — bugun bepul, ertaga qimmat

10 ta shablon (`AVTOKAMERAL`, `BONAK`, `BUX_BALANS`, `DIDOX_FLOW`, `EKOLOGIYA`,
`ITPARK_OYLIK`, `MOL_MULK_SOLIQ`, `MY_MEHNAT`, `SUV_SOLIQ`, `YER_SOLIQ`) hozir
`lifecycle = draft` — generator ularni **umuman ko'rmaydi**, 0 majburiyat yaratadi.

Qoida qo'shish **hozir hech narsani buzmaydi**. Faollashtirilgandan keyin esa:

| Shablon | Kaliti bor | Qoidasiz faollashsa | Qoida bilan |
|---|--:|--:|--:|
| `MY_MEHNAT` | 210 | 239 firma × oylik | 210 |
| `DIDOX_FLOW` | 202 | 239 firma × oylik | 202 |
| `AVTOKAMERAL` | 209 | 239 firma × oylik | 209 |
| `EKOLOGIYA` | **20** | **239** firma × oylik | **20** |
| `ITPARK_OYLIK` | **14** | **239** firma × choraklik | **14** |
| `BONAK` | **27** | 239 firma × oylik | **27** |
| `MOL_MULK_SOLIQ` | 31 | 239 firma × yillik | 31 |
| `SUV_SOLIQ` | 29 | 239 firma × yillik | 29 |
| `YER_SOLIQ` | 37 | 239 firma × yillik | 37 |
| `BUX_BALANS` | 230 | 239 firma × choraklik | 230 |

`EKOLOGIYA` va `ITPARK_OYLIK` eng o'tkir: 20 va 14 firmaga tegishli hisobot
239 firmaga tushardi — ya'ni **219 va 225 ta soxta majburiyat har davrda**.

**Tavsiya:** bu 10 tasini migratsiyaning **alohida, xavfsiz bosqichi** sifatida
ajratish. Ular hech qanday mavjud majburiyatga tegmaydi.

---

## §4 KPI reglamenti — bosh buxgalter aytgani va kodda borining solishtirmasi

Reglament **allaqachon kodlangan**: 24 ta `KpiRule`
([scripts/seed-kpi-rules-v2.ts](../../scripts/seed-kpi-rules-v2.ts)), sof
hisoblagich [lib/kpiScoring.ts](../../lib/kpiScoring.ts), qo'lda hisoblangan
etalon jadval [lib/kpiReference.spec.ts](../../lib/kpiReference.spec.ts).

### 4.1 Konvert arifmetikasi — to'liq mos

| Rol | Konvert (`KPI_SALARY_CONFIG`) | Bonuslar yig'indisi | Mos |
|---|--:|---|:--:|
| Buxgalter | **5.0%** | kelish 1.0 + guruh 1.0 + 1C 1.0 + platformalar 1.0 + hisobotlar 1.0 | ✅ |
| Bank-klient | **2.5%** | kelish 1.0 + guruh 1.0 + shaxsiy mas'uliyat 0.5 | ✅ |
| Nazoratchi | **1.0%** | guruh 0.5 + hisobot muddati 0.5 | ✅ |

### 4.2 Band-bandiga solishtirma

**Buxgalter — KPI**

| Reglament | Kodda | Holat |
|---|---|:--:|
| 08:30 gacha +0.04%, max +1% | `acc_attendance.early_days` 0.04, max 1.0 | ✅ |
| Guruh 10 daq, uzluksiz oy +1% | `acc_group_response.ontime_month` +1.0 | ✅ |
| 1C 5-sanagacha +1% | `acc_1c_base` yashil +1.0 | ✅ |
| my.mehnat / didox / my.soliq +1% | **4** qoida × 0.25 (+`acc_avtokameral`) | ⚠️ |
| Hisobotlarni vaqtida +1% | 6 qoida: 0.2+0.2+0.2+0.2+0.1+0.1 = 1.0 | ✅ |
| Maksimal reglament 30 daqiqa | **yo'q** — `responseWindowForRole` faqat 10/5 daq | ❌ |

**Buxgalter — jarima**

| Reglament | Kodda | Holat |
|---|---|:--:|
| 09:00 dan keyin −0.1% / 5 daq | `acc_attendance.late_5min` −0.1 | ✅ |
| … chegara aytilmagan | kodda `max_coeff: −0.5` (max 25 daqiqa) | ⚠️ |
| Guruh 10 daq kech, har safar −0.5% | `late_responses` −0.5, chegarasiz | ✅ |
| 1C 15-sanagacha yo'q → −1% | `acc_1c_base` qizil −1.0 | ✅ |
| Platformalar −1% gacha | 4 × (−0.25) = −1.0 | ✅ |
| Hisobot/soliq kechikishi −1% | 6 hisobot qoidasi = −1.0 | ✅ |
| Tuzatib bo'lmaydigan xato −1% | `acc_critical_error` −1.0 | ✅ |
| Kelmagan kun −1%, pul nazoratchiga | `acc_absence` −1.0 + `ShiftCover` modeli | ✅ |

**Bank-klient** — 6 bandning **6 tasi** aynan mos (kelish −0.2%/5daq, guruh 5 daq,
shaxsiy mas'uliyat +0.5%, noto'g'ri o'tkazma = `amount_penalty` so'mda, kelmagan kun −0.25%). ✅

**Nazoratchi**

| Reglament | Kodda | Holat |
|---|---|:--:|
| Guruh 5–10 daq +0.5% | `sup_group_response` +0.5 | ✅ |
| 12/18-sanada tugatish +0.5% | `sup_reports_deadline` +0.5 | ✅ |
| **Shaxsiy mas'uliyat bonusi** | **yo'q** | ❌ |
| Buxgalter sifatida ishlash | `ContractAssignment` lavozimga qulflanmaydi | ✅ |
| 09:00 dan keyin −0.1%/5daq | `sup_attendance` −0.1 | ✅ |
| Hisobot/soliq muammosi −0.5% | `sup_tax_reports` −0.5 | ✅ |
| Javobsiz/yechimsiz −0.5% | `sup_unresolved` −0.5 | ✅ |
| Kelmagan kun −0.25% | `sup_absence` −0.25 | ✅ |

> Nazoratchining bonus konverti **allaqachon to'la** (0.5 + 0.5 = 1.0%).
> Shaxsiy mas'uliyat bonusi qo'shilsa, u yo qirqiladi, yo konvert kengaytirilishi kerak.

### 4.3 Kodlanmagan yoki zid uch narsa

1. **30 daqiqalik maksimal reglament** — modelda yo'q. `responseWindowForRole`
   faqat 10 (buxgalter/nazoratchi) va 5 (bank-klient) daqiqani biladi
   ([response-window-policy.ts](../../bot/contexts/monitoring/domain/response-window-policy.ts)).
   "Istisnolar bo'lishi mumkin" degan band ham modelda yo'q.
2. **Nazoratchining shaxsiy mas'uliyat bonusi** — qoida yo'q.
3. **«Firma oylik ulushidan −0.5%»** — kodda ulushdan EMAS, firmaning **butun
   summasidan** olinadi (§5 Savol 1).

---

## §5 Bosh buxgalterdan javob kerak — noaniqliklar

Bir qismi kodda allaqachon hal qilingan (👇 «Kodda» ustuni), lekin **tasdiq kerak**.

| № | Savol | Kodda hozir | Kerak |
|---|---|---|---|
| **1** | **+0.04% / −0.5% qaysi bazaga?** | Firmaning **butun shartnoma summasidan**, xodim ulushidan emas — `kpiBonus = basisAmount × percent / 100` ([kpiLogic.ts:348](../../lib/kpiLogic.ts#L348)) | ⚠️ Reglament «firma oylik **ulushidan**» deydi. Buxgalter ulushi 20% bo'lsa — **5 barobar farq**. Qaysi biri to'g'ri? |
| **2** | Bonus KPI konvertidanmi yoki umumiy oylikdanmi? | Konvert faqat **bonus** tomonini qirqadi; jarimalar konvertdan tashqarida to'planadi (`capKpiPercent`) | tasdiq |
| **3** | «Firma oylik ulushi» DBda nima? | `ContractAssignment.salaryValue` (% yoki qat'iy summa) | tasdiq |
| **4** | Maksimal KPI chegarasi? | buxgalter 5% · bank 2.5% · nazoratchi 1% · bosh buxgalter 0% | tasdiq |
| **5** | **Jarimalarning umumiy chegarasi?** | **YO'Q** — jarima cheksiz to'planadi, oylik 0 gacha tushishi mumkin (`Math.max(0, raw)`) | ❗ chegara kerakmi? |
| **6** | **Bir hodisa uchun ikki marta jarima?** | Mumkin: kech javob (`acc_group_response`) + hisobot kechikishi (`acc_*_report`) bir voqeadan kelib chiqishi mumkin | ❗ qoida kerak |
| **7** | **`global` qoida bir marta mi, har firma uchunmi?** | `MonthlyPerformance` kaliti `month+companyId+employeeId+ruleId` — ya'ni davomat ham **firma bo'yicha** yoziladi. 10 firmali buxgalterda +1% → **10 barobar** bo'lishi mumkin | ❗ eng katta xavf |
| **8** | Ta'til kunlari? | `Attendance.status='excused'` jarimaga kirmaydi; `ShiftCover.kind='vacation'` → o'rinbosarga **50%** | tasdiq |
| **9** | Kasallik / xizmat safari? | `lateExcused` + `lateExcuseReason` — nazoratchi qo'lda belgilaydi | ❗ kim tasdiqlaydi? |
| **10** | Dam olish kunlari? | `makeWorkdayPredicate` — shanba/yakshanba ish kuni emas; `BusinessCalendarDay` ustun turadi | tasdiq |
| **11** | «Javob berildi» qanday aniqlanadi? | `Answer` qatori (Telegram xabari) → `Question.answeredAt` | tasdiq |
| **12** | 5/10 daqiqa qaysi timestampdan? | `Question.createdAt` dan, **ish soatlari ichida** (`addWorkingMinutes`) | tasdiq |
| **13** | **Telefon orqali topshiriq?** | **Hech qanday yo'l yo'q** — faqat guruh xabari qayd qilinadi | ❗ qoida kerak |
| **14** | **«Tuzatib bo'lmaydigan xato» mezoni?** | `acc_critical_error` — sof qo'lda belgilanadi, mezon yozilmagan | ❗ ta'rif kerak |
| **15** | **Soliq kechikishi kimning aybi?** | Ajratilmaydi — jarima har doim buxgalterga | ❗ tashqi sabab qanday hisobga olinadi? |
| **16** | Nazoratchi/buxgalter mas'uliyati qanday bo'linadi? | Ikkovi ham jarima oladi: buxgalter −1%, nazoratchi −0.5% | tasdiq |

**5 ta shablon savoli:**

| № | Savol |
|---|---|
| M1 | §1 jadvalidagi 14 ta **active** moslik to'g'rimi? Noto'g'risini ☒ bilan belgilang. |
| M2 | 31 kalitsiz firma chetlab o'tilsin — rozimisiz? (Ro'yxati [matrixkey-mapping-audit.md](matrixkey-mapping-audit.md) §5 da) |
| M3 | `QQS_DECL` da tushib qoladigan **13** firma: rejim xatomi yoki kalit xatomi? |
| M4 | `AYLANMA_SOLIQ` da tushib qoladigan **22** firma: xuddi shu savol. |
| M5 | 10 ta draft shabloniga qoida hozir qo'shilsinmi? (0 majburiyatga tegadi — xavfsiz) |

---

## §6 Migratsiya dizayni — tasdiqdan KEYIN

Skript hali **yozilmagan**. Tasdiqlangan mosliklar ma'lum bo'lgach quyidagi shartlar bilan yoziladi:

1. **default = dry-run**; `--apply` bo'lmasa hech qanday DB mutatsiyasi yo'q
2. `--apply` oldidan **PRODdan qayta SELECT** — auditning raqamlari **hardcode qilinmaydi**
3. kutilgan va haqiqiy son **farq qilsa → ABORT**, hech narsa yozilmaydi
4. bitta **transaction** ichida
5. **backup majburiy** — skript backup sanasini so'raydi, busiz ishlamaydi
6. yaratilgan `TemplateApplicability` ID lari faylga yoziladi
7. `--rollback=<fayl>` — shu ID larni o'chiradi
8. **31 kalitsiz firma o'zgarmaydi** (`gateScope().excluded`)
9. **§2.1 tufayli:** bekor qilish generatorga tashlanmaydi. Skript `planned`
   majburiyatlarni **o'zi** bekor qiladi (`periodKey` dan qat'i nazar) va har biriga
   `ObligationStatusEvent` yozadi. `in_progress`/`sent`/`accepted` — **tegilmaydi**.
10. Bosqichlar ajratiladi: **(a)** 10 ta draft (0 ta'sir) → **(b)** 12 ta oddiy active
    → **(c)** `QQS_DECL` + `AYLANMA_SOLIQ` (AND ta'siri bor, alohida tasdiq bilan)

### 6.1 Apply oldidan xavfsizlik tekshiruvi

Kutilayotgan (2026-09-06 holatiga):

```
tegiladigan jami   = 1 868
ochiq              = 1 704
  planned          = 1 673   ← bekor qilinadi
  in_progress/sent =    31   ← tegilmaydi
yopilgan           =   164
firma              =   226
chiqarilgan firma  =    31
```

Bu raqamlar **kutilma**, mezon emas. `--apply` oldida qayta o'lchanadi;
farq bo'lsa — **STOP**.

---

## §7 Testlar

| Talab | Fayl | Holat |
|---|---|:--:|
| xizmat bor → yaratiladi | `test/service-key-gate.test.ts` §1 | ✅ |
| xizmat yo'q → yaratilmaydi | §1 | ✅ |
| `activeServices=[]` avtomatik "mos emas" QILINMAYDI | §2 | ✅ |
| `tax_regime` + `service_key` → AND | §3 | ✅ |
| `turnover` + `service_key` → AND | §3b | ✅ |
| universal faqat haqiqiy universalda | §4 | ✅ |
| `matrixKey` bor + qoida yo'q → aniqlanadi | §5 | ✅ |
| stale bekor qilish ishlaydi | `test/obligation-service-key-cancel.test.ts` | ✅ |
| yopilgan majburiyat o'zgarmaydi | " | ✅ |
| boshqa xizmatga ta'sir qilmaydi | " | ✅ |

Jami **27 ta yangi holat**, hammasi o'tadi.

---

## YAKUNIY HISOBOT

### A. CONFIRMED — o'lchangan, isbotlangan

- 24 ta shablon `matrixKey` ga ega, lekin `service_key` qoidasiga ega emas → universal ishlaydi
- Ta'sir: **1 868** majburiyat, **1 704** ochiq, **226** firma; **31** kalitsiz firma chiqarildi
- Bekor qilinadigani aslida **1 673** (`planned`); **31** tasi `in_progress`/`sent` — tegilmaydi
- Mezonlar **AND** bilan birlashadi → `QQS_DECL` 13, `AYLANMA_SOLIQ` 22 firma tushib qoladi
- 10 ta draft shablon hozir 0 majburiyat yaratadi → qoida qo'shish **bugun bepul**
- Tegiladigan 226 firmaning hammasi generator uchun yaroqli
- KPI reglamentining **27 bandidan 25 tasi** to'liq kodda; 1 tasi qisman (30 daqiqalik reglament yo'q),
  1 tasi umuman yo'q (nazoratchining shaxsiy mas'uliyat bonusi). Uchala rol konverti (5% / 2.5% / 1%)
  bonuslar yig'indisiga **tugal** mos keladi

### B. BUSINESS QUESTIONS — javob kerak

1. **KPI foizi qaysi bazadan?** Kodda firmaning butun summasidan; reglament «ulushdan» deydi — 5 barobar farq (§5 №1)
2. **`global` qoida har firma uchun takrorlanadimi?** 10 firmali xodimda +1% → 10% bo'lishi mumkin (§5 №7)
3. **Jarimaning umumiy chegarasi bormi?** Hozir yo'q — oylik 0 gacha tusha oladi (§5 №5)
4. **Bir hodisa ikki qoidaga tushsa?** Hozir ikki marta jarimalanadi (§5 №6)
5. «Tuzatib bo'lmaydigan xato» mezoni, telefon topshirig'i, tashqi sabab (§5 №13, 14, 15)
6. 30 daqiqalik maksimal reglament va nazoratchining shaxsiy mas'uliyat bonusi kodda yo'q (§4.3)
7. §1 jadvalidagi 14 ta moslik va §5 M1–M5 savollari

### C. TECHNICAL RISKS — prodga ta'sir qiladi

| № | Xavf | Ta'sir | Yechim |
|---|---|---|---|
| R1 | **Davr oynasi suriladi** — generator eski `planned` qatorlarni ko'rmaydi | migratsiya kechiksa yuzlab majburiyat abadiy ochiq qoladi | migratsiya bekor qilishni **o'zi** bajaradi (§6.9) |
| R2 | **31 ta `in_progress`/`sent`** qator ochiq qoladi | firma topshirmasligi kerak bo'lgan hisobot bo'yicha ish ko'rinib turadi | qo'lda ko'rik ro'yxati (§2.1 jadvali) |
| R3 | **AND ta'siri** — 35 firma ikki manba zidligi | qonuniy majburiyat noto'g'ri o'chishi mumkin | (c) bosqichi alohida tasdiq bilan |
| R4 | `UMID HOSPITAL` kabi **ma'lumot xatosi** | rejim va kalitlar bir-biriga zid | migratsiyadan oldin tuzatiladi |
| R5 | **`123456789 TEST BRO`** prodda turgan sinov yozuvi | audit raqamlarini ifloslantiradi | alohida tozalash |
| R6 | Draft shablon **qoidasiz faollashtirilsa** | `EKOLOGIYA` 219, `ITPARK_OYLIK` 225 soxta majburiyat | (a) bosqichini birinchi bajarish |

### D. NEXT ACTION

**Siz:**
1. §1 jadvalidagi 24 ta ☐ ni to'ldiring (yoki «hammasi to'g'ri» deb tasdiqlang)
2. §5 M1–M5 va №1, 5, 6, 7 savollariga javob bering

**Men — tasdiqdan keyin, shu tartibda:**
3. Migratsiya skriptini yozaman (§6 ning 10 talabi bilan), **dry-run**
4. Dry-run natijasini ko'rsataman
5. Siz backup olasiz
6. Siz «apply qil» deysiz → transaction ichida qo'llayman
7. Post-audit: raqamlarni qayta o'lchayman

**Hozir bajarilmaydi:** hech qanday `INSERT`/`UPDATE`/`DELETE`/`CANCEL`/`migrate apply`.

---

*Skriptlar (ikkalasi ham faqat o'qish, `--apply` bayrog'i yo'q):*
[`audit-matrixkey-mapping.ts`](../../scripts/audit-matrixkey-mapping.ts) ·
[`audit-template-mapping-detail.ts`](../../scripts/audit-template-mapping-detail.ts)
