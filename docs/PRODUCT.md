# ASRO — Mahsulot ta'rifi

> Loyihaga qo'shilgan har bir odam birinchi shu hujjatni o'qiydi.
> Kod bilan ziddiyat chiqsa — **bu hujjat haq**, kod tuzatiladi.

**Holat:** amaldagi · **Sana:** 2026-08-06 · **Versiya:** 2
**Almashtiradi:** `ASRO_CPO_AUDIT.md`, `ASRO_PRODUCT_BLUEPRINT_2.0.md`, `PROJECT_REVIEW.md`

---

## 1. Bitta jumla

> **1C buxgalteriyani yuritadi. ASRO biznesni yuritadi.**

To'liq shakli:

> **ASRO — buxgalteriya autsorsing firmalari uchun Operations OS.
> U 1C o'rnini bosmaydi; u 1C atrofidagi hamma narsani boshqaradi.**

Bu ERP **emas**. "ERP" so'zi omborni, ishlab chiqarishni, savdoni va CRM'ni va'da
qiladi — bizda ular yo'q va bo'lishi ham kerak emas.

**Yakuniy maqsad — Decision Intelligence.** Kuzatuv tizimi *"nima bo'ldi"* ni aytadi.
ASRO *"ertaga nima bo'ladi va bugun nima qilish kerak"* ni aytadi. Farq shu yerda,
va butun mahsulot shunga qarab tekshiriladi.

---

## 2. Besh va'da

Mahsulotning butun mavjudlik sababi. Har bir kod satri shulardan biriga xizmat qiladi.

| # | Va'da | O'lchov |
|---|---|---|
| **1** | **Hech narsa unutilmaydi.** Hech qaysi soliq, muddat yoki vazifa e'tibordan qolmaydi | Muddat o'tgandan **keyin** aniqlangan majburiyat = **0** |
| **2** | **Har kim bugun nima qilishini biladi.** | Buxgalterning haftalik faol foydalanishi ≥ 80% |
| **3** | **Direktor hammasini ko'radi.** 10 soniyada: kim ishlayapti, qaysi mijoz zarar, qayerda xavf | Direktorning kunlik foydalanishi: haftada ≥ 5 kun |
| **4** | **Har bir raqam tushuntiriladi.** AI *nima uchun* ekanligini manbagacha ochadi | AI aytgan har bir raqam UI'dagi raqamga **teng** |
| **5** | **Tizim nima qilish kerakligini aytadi.** Kuzatuv emas — tavsiya | Direktor tavsiyalarning ≥ 50% ini qabul qiladi |

5-va'da 1–4 siz mumkin emas. Shuning uchun u oxirgi quriladi, lekin **birinchi
kundan mo'ljal** — har bir hisob "bu qanday qarorga olib keladi?" degan savolga
javob bera olishi kerak.

---

## 3. Qatlamlar

```
                     DIREKTOR
                         ▲
             ┌───────────┴───────────┐
             │       Decision        │  Nima qilish kerak · tavsiya · ogohlantirish
             └───────────┬───────────┘
             ┌───────────┴───────────┐
             │   Director Cockpit    │  10 soniya · bitta ekran
             └───────────┬───────────┘
             ┌───────────┴───────────┐
             │ Operations Intelligence│ Digital Twin · Timeline · 5 ball
             └───────────┬───────────┘
             ┌───────────┴───────────┐
             │  Obligation Engine    │  Yagona ish birligi
             └───────────┬───────────┘
             ┌───────────┴───────────┐
             │      Truth Feed       │  Excel → 1C → Didox → Soliq → Bank
             └───────────┬───────────┘
                    1C · tashqi tizimlar
```

**AI qatlam emas — u har bir qatlamning ichida.** Truth Feed'da hujjatni tanidi;
Obligation'da anomaliyani ko'rsatdi; Intelligence'da ballni izohladi; Cockpit'da
kunlik brifing yozdi; Decision'da tavsiya berdi. AI'ni alohida "modul" qilish —
uni chat qutisiga qamash demakdir.

**Har bir qatlam faqat ostidagiga tayanadi.** Cockpit hech qachon bevosita 1C'ga
qaramaydi; Intelligence hech qachon Excel faylini o'qimaydi.

### Bugungi holat — o'lchangan

| Qatlam | Holat | Dalil |
|---|---|---|
| Obligation Engine | **Qurilgan, testlangan, cron'da** | 2 982 majburiyat; `lib/deadlines.ts` (126 q., 0 import) |
| Truth Feed | **Quvur bor, ma'lumot oqmaydi** | `applyIntegrationEvent` — bo'sh TODO. `IntegrationEvent` = 0 |
| Operations Intelligence | **Formulalar bor, kirish yo'q** | `TimeEntry` = 0 → marja = daromad. `riskLevel` qo'lda yoziladi |
| Director Cockpit | **Web'da yo'q** | Yagona cockpit-shakli — `/telegram-app/dashboard` |
| Decision | **Yo'q** | — |

---

## 4. Modullar

### Core — bularsiz mahsulot yo'q
`Company` · `Employee` · `Client` · `Obligation` · `Deadline` · `Calendar`

Yuragi — **Obligation**. Har bir biznes majburiyatlardan iborat. Shuning uchun
`DeadlineTemplate` da bironta soliqqa xos maydon yo'q — `obligationType` erkin String.

### Intelligence — mahsulotni sotadigan qism
`Digital Twin` · `Risk` · `Capacity` · `Profitability` · `Compliance` · `Timeline` → **§5**

### Automation
`Telegram` · `Notifications` · navbatlar · eskalatsiya · kunlik brifing

### Integration (Adapter)
`Excel` (birinchi) · `1C` · `Soliq` · `Didox` · `Bank` — yadro manba nomini bilmaydi

### Operational Finance — **saqlanadi** (§6.1 ga qarang)
`Kassa` · `Expense` · `Payout` · `Payroll` · `LedgerEntry` · oy yopilishi

### Ikkilamchi — qoladi, investitsiya olmaydi
Attendance · Documents · Shift cover · Financial reports · Onboarding

---

## 5. Operations Intelligence — farqlovchi qism

### 5.1 Digital Twin — har bir mijozning raqamli nusxasi

To'rtta alohida hisob emas, **bitta obyekt**. Har bir mijoz uchun besh ball:

```
Artel Logistics
  Health         91          ← qolgan to'rttadan hosila
  Risk           12%
  Capacity      168%         ← mas'ul buxgalterning yuklamasi
  Compliance     97%         ← o'z vaqtida bajarilgan majburiyat ulushi
  Profitability  18%         ← marja
```

`Company.riskLevel` bugun **qo'lda kiritiladigan matn** (`server/companies.ts:193`),
7 joyda o'qiladi, hech qachon hisoblanmaydi — ya'ni ekranlardagi "risk" bugun **yolg'on**.
Digital Twin uni hisoblanadiganga aylantiradi va yoniga to'rttasini qo'shadi.

Har bir ball **bosiladigan** va manbagacha ochiladigan (5-modda). Ball ko'rsatilib,
sababi ko'rsatilmasa — u ishonchni oshirmaydi, kamaytiradi.

### 5.2 Ballar qanday hisoblanadi

| Ball | Kirish | Bugun bormi |
|---|---|---|
| **Risk** | kechikkan majburiyat chuqurligi · rad etilgan topshirish · `Question.status='late'` · to'lov yoshi · sig'im tanqisligi | `Obligation.firstOverdueAt` ✅ 2 982 qator · `Question` ✅ bot yozyapti |
| **Capacity** | `Σ normativMinut × Company.complexity ÷ ish vaqti fondi` | `CompanyComplexity` enum **allaqachon mavjud** |
| **Compliance** | o'z vaqtida `accepted` / jami majburiyat | ✅ |
| **Profitability** | `tushum − (normativ mehnat × tannarx) − xarajat − jarima` | `lib/margin.ts` da `extraCost`/`penalties` bor, hech kim bermaydi |
| **Health** | to'rttasining vaznli yig'indisi | hosila |

**Capacity — normativ, timer emas.** `TimeEntry` = 0 va hech kim ⏱ bosmaydi;
buxgalteriya firmasi hech qachon 100% time tracking qilmaydi. Qo'lda kiritish
saqlanadi va normativdan ustun turadi.

### 5.3 Operations Timeline

Har bir mijoz uchun majburiyatlar vaqt o'qi bo'yicha:

```
Bugun → Ertaga → Shu hafta → Shu oy → Chorak → Yil
```

Bu yangi model talab qilmaydi — `Obligation` da `dueAt` va `periodKey` allaqachon bor.
Bu **so'rov**, jadval emas. Cockpit'ning va Company Workspace'ning asosiy ko'rinishi.

### 5.4 Bashorat — halol ketma-ketlik

Siz *"keyingi 14 kun ichida Artel High Risk bo'ladi"* ni so'radingiz. Bu to'g'ri maqsad,
lekin **bugun bajarib bo'lmaydi, va noto'g'ri bajarish mahsulotni o'ldiradi.**

O'lchangan sabab: `Obligation` = 2 982 ≈ 15 template × 213 firma ≈ **bir oylik
generatsiya**. Yozib olingan xavf o'tishlari — **nol**. Tarixsiz o'rganilgan bashorat
— ishonch oralig'i kiygan taxmin. Va noto'g'ri ishonchli bashorat ishonchni
bashoratsizlikdan **tezroq** buzadi — direktorning asosiy ekranida.

Shuning uchun uch bosqich:

| Bosqich | Nima | Qachon |
|---|---|---|
| **1. Holat** | *"Artel: Risk 12%, Capacity 168%"* | Faza 4 |
| **2. Yetakchi ko'rsatkich** | *"5 kun ichida 3 muddat, mas'ul 178% da, oxirgi 5 topshirishdan 2 tasi rad etilgan → kechikish ehtimoli yuqori"* — bu **kelajak ustida arifmetika**, konstruksiyasi bo'yicha to'g'ri, tarix talab qilmaydi | Faza 4–5 |
| **3. O'rganilgan bashorat** | tarixdan o'rganilgan model | **Darvoza:** ≥ 12 oy majburiyat natijasi **va** ≥ 50 ta belgilangan xavf o'tishi |

2-bosqich sizning va'dangizning 90% ini beradi va uni **bugun** berish mumkin.
3-bosqich — sana emas, darvoza.

---

## 6. Nima qurilmaydi

❌ CRM · ❌ Ombor · ❌ Inventar · ❌ Ishlab chiqarish · ❌ POS · ❌ Savdo ·
❌ 1C o'rnini bosish · ❌ Mijozlar uchun buxgalteriya yuritish

### Darvoza ortida — "hech qachon" emas

| Nima | Darvoza |
|---|---|
| **Mobil ilova** | Web cockpit 3 oy kunlik ishlatilgan **va** direktor telefondan so'ragan. (Bugun Telegram Mini App bor — u ehtiyojning katta qismini qoplaydi) |
| **Multi-tenant SaaS** | 3 firma 12 oy pul to'lagan |
| **Marketplace / plugin runtime** | 2 tashqi tomon API so'ragan **va** SaaS ishlagan |
| **Ikkinchi vertikal** (Audit/Legal/HR) | 1 firma ASRO'siz ishlay olmaydi **va** 3 firma so'ragan **va** core 6 oy domen lug'atisiz |

Mahsulot hujjatida "hech qachon" so'zi yozilmaydi. Yozilsa — u eskiradi va hujjat
ishonchini yo'qotadi. Darvoza esa eskirmaydi.

### 6.1 Operational Finance — o'chirilmaydi, aniqlashtiriladi

Avvalgi versiyada "ledger o'chiriladi" deb yozilgandi. **Bu xato edi va tuzatildi.**

O'lchov: `lib/ledger.ts` (190 q.) ni `server/kassa.ts`, `server/payouts.ts`,
`server/payroll.ts`, `lib/monthClose.ts` va `server/monthClosing.ts` **faol
ishlatadi**. Ya'ni "ertaga Expense, Cash, Payroll — hammasi transaction" degan
e'tiroz kelajak haqida emas, **bugungi holat** haqida.

| Qism | Qaror | Sabab |
|---|---|---|
| `lib/ledger.ts` — `postLedger`, `reverseLedger`, `getTrialBalance`, `getLedgerCashBalance` | **Saqlanadi** | Bu buxgalteriya emas — bu **pul harakatining yaxlitlik kafolati**. Balanslangan oyoqlar kassaning siljib ketishiga yo'l qo'ymaydi; `reverseLedger` netto bo'yicha ishlaydi, append-only |
| `LedgerEntry` (122 qator) | **Saqlanadi** | Operational Finance jurnali |
| Oy yopilishi (`monthClosing.ts` 512 + `monthClose.ts` 361) | **Saqlanadi** | Ishlatilyapti; sinov balansi invariantiga tayanadi |
| `server/accounting.ts` (200 q.) — davr qulfi, yil yopish, snapshot ro'yxati | **Arxivga** | 6 eksport, **0 ta chaqiruvchi**. Bu buxgalteriya marosimi, operatsiya emas |

**Arxiv = o'chirish emas.** `docs/archive/accounting-core/` da hujjat + git tag
`archive/accounting-core-v1` + ADR: nima edi, nega olib qo'yildi, qaytarish uchun
nima qilinadi. Kod tarixda qoladi va bir buyruq bilan tiklanadi.

**Chegara aniq:** ASRO soliq maqsadida moliyaviy hisobot chiqarmaydi va kitob
yopmaydi — buni 1C qiladi. ASRO ikki tomonlama yozuvdan **o'z kassasining
to'g'riligini kafolatlash uchun** foydalanadi. Ikkinchisi birinchisi emas.

### 6.2 Payroll — ikki xil narsa, faqat bittasi tashqarida

| | Qaror |
|---|---|
| **Firmaning o'z 63 xodimi oyligi** (`PayrollAdjustment` → `Payout`, KPI'dan hisoblanadi) | **Core.** Bu KPI'ning natijasi. O'chirilsa, KPI hech narsaga ulanmaydi |
| **Mijozning xodimlari oyligi** (`my_mehnat`, `hisoblangan_oylik`) | **Majburiyat**, modul emas. 1C hisoblaydi, ASRO nazorat qiladi |

---

## 7. Modul moratoriysi — 6 oy

**2026-08-06 → 2027-02-06. Yangi modul yozilmaydi.** Faqat beshtasi:
Truth Feed · Obligation Engine · Operations Intelligence · Director Cockpit · Grounded AI.

Har bir feature so'rovi uchta savoldan o'tadi:

1. **Qaysi va'daga xizmat qiladi?** (§2 dagi 5 tadan biri) — javob yo'q: yozilmaydi.
2. **O'lchovi nima?** Raqam aytilmasa: yozilmaydi.
3. **Nimani o'chiradi?** Yangi ekran qo'shilsa, bittasi ketadi.

Uchtasiga javob bo'lsa — u modul emas, u beshtadan birining ichidagi ish.
Aks holda `docs/ICEBOX.md` ga yoziladi va 2027-02-06 da qaraladi.

---

## 8. Qanday himoyalanadi

Ta'rif — hujjat; kuchi — testda. `docs/CONSTITUTION.md` moddalarni belgilaydi,
`test/constitution.test.ts` ularni buzganda build'ni to'xtatadi.

- **Modda 1** — ASRO soliq uchun kitob yopmaydi va moliyaviy hisobot chiqarmaydi.
  (Ikki tomonlama yozuv **taqiqlanmaydi** — u kassa yaxlitligi vositasi.
  Taqiq: `AccountingPeriod` ustiga yangi yopish marosimi qurish)
- **Modda 2** — Obligation yagona ish birligi
- **Modda 4** — Core engine domen lug'atini bilmaydi (`lib/engines/**`)
- **Modda 5** — har bir integratsiya adapter; yangi manba landing kodini o'zgartirmaydi
- **Modda 7** — manbagacha kuzatib bo'lmaydigan raqam ko'rsatilmaydi

---

## 9. Muvaffaqiyat — 6 oydan keyin

| | Bugun | Maqsad |
|---|---|---|
| Muddat o'tgandan keyin aniqlangan majburiyat | noma'lum | **0** |
| O'z vaqtida bajarilgan majburiyat | o'lchanmagan | ≥ 95% |
| Digital Twin — 5 balli mijozlar | 0% (`riskLevel` qo'lda) | 100% |
| Yuklamasi ma'lum xodimlar | 0% (`TimeEntry`=0) | 100% |
| Marjasi ma'lum mijozlar | 0% | 100% |
| Direktorning kunlik foydalanishi | — | haftada ≥ 5 kun |
| Qabul qilingan AI tavsiyalari | — | ≥ 50% |
| Yangi majburiyat turi qo'shish narxi | kod + deploy | seed qatori |
| Yangi adapter qo'shish narxi | noma'lum | landing kodida 0 qator |

Oxirgi ikkitasi **10 yillik** qiymatni o'lchaydi. Ikkalasi nolga intilsa — platforma.
Intilmasa — feature to'plami.
