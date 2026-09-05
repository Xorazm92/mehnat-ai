# Moliya va KPI yadrosi — to'liq ko'rik

**Sana:** 2026-08-15 · **Qamrov:** kassa (kirim/chiqim), oylik, o'zini-o'zi band qilganlar,
shartnoma bo'yicha to'lovchilar, plastik orqali to'lovchilar, KPI.

Bu hujjat kodni o'qish natijasi. Har bir da'vo fayl va qator bilan ko'rsatilgan.

## HOLAT (2026-08-15)

**Faza 0 BAJARILDI** — §8 dagi "qon ketishini to'xtatish" bandlari. Yopilgan
nuqsonlar: 2.2 avans, 2.3 qo'lda bonus, 2.4 qo'lda jarima, 2.5 oylik tasdig'i,
2.6 "Oylik" kassa toifasi, 4.2 tranzit poygasi, 6.4 (qisman — `clampedLoss`
ko'rinadigan bo'ldi). Qo'shimcha, ko'rik paytida topilmagan ikkita jonli nuqson:

- **`partial` to'lov oy yopishni bloklardi** — `lib/monthClose.ts` faqat `'paid'`
  ni kutardi, `server/kassa.ts` esa `'paid'` VA `'partial'` uchun jurnalga
  yozadi. Qo'lda kiritilgan har qanday qisman to'lov "ledger mos emas" xatosi
  berardi. Endi `isSettledPayment` (`lib/debt.ts`) ikkala joyda.
- **Bank kabineti o'chirilgan yozuvlarni sanardi** — `server/cabinet.ts`
  `getBankCabinetData` da `deletedAt` filtri yo'q edi va qoldiq `take: 20`
  ro'yxatidan hisoblanardi.

Yagona manba: **`lib/payrollObligation.ts`** — majburiyat formulasi endi server,
oy yopish va ikkala oylik ekrani uchun bitta.

**QARZDORLIK JAMG'ARILGAN HISOBGA O'TDI** (§5.1, §5.2 yopildi). `lib/debt.ts`
endi `charged − paid` ni davrga bog'lamay hisoblaydi va IKKI raqamni ajratadi:

- `outstanding` — jami qoldiq (manfiy = **avans**, ilgari `Math.max(0,…)` da yo'qolardi);
- `overdue` — faqat **o'tgan oylar** qarzi, direktorga kerak bo'lgan raqam.

Natijasi kunlik hisobotda ko'rinadi. Ilgari: *"233 ta firma — 832,200,000 so'm,
233 tasi umuman to'lamagan"* — bu 15-avgustda shunchaki "avgust to'lovlari hali
kelmagan" degani edi va har kuni bir xil turardi. Endi: **111 ta firma —
277,864,565 so'm**, ustiga eng katta 5 tasi nomma-nom va mas'ul buxgalteri bilan.

Qo'shimcha tuzatishlar: nol harakat va manfiy balans endi sababi bilan
izohlanadi; 1C solishtiruvi kesim davriga tenglashtirildi (`asroComparable`) —
ilgari joriy oy hisobi 1C ning o'tgan sanasiga solishtirilardi va farq har doim
bir oylik shartnoma summasicha yolg'on chiqardi.

To'lamagan firmalar ro'yxati `/kassa/qarzdorlik` sahifasining eng tepasida —
qidiruv bilan, mas'ul buxgalter va oxirgi to'lov davri ko'rsatilgan holda.
Telegram xabari va ekran **bitta manbadan** (`listDebtors`), ya'ni ajralmaydi.

**TO'LOV MUDDATI MODELI** (2026-08-18). Biznes qoidasi aniqlandi va kodga
kiritildi: **ish oyi tugagach mijoz keyingi oy davomida to'laydi** — "iyulning
puli avgustda olinadi" (`PAYMENT_TERM_MONTHS = 1`, `lib/debt.ts`).

Busiz 18-avgustda iyul qarzi "muddati o'tgan" deb ko'rsatilardi va direktor
**111 ta firmani buzuvchi** deb ko'rardi — holbuki ularning hammasi o'z muddati
ichida edi. Endi uch holat ajratiladi:

| | Ma'nosi | Prod, 18.08.2026 |
|---|---|---|
| `dueNow` | Shu oy yig'ilishi kerak — **ish ro'yxati**, buzilish emas | 137 ta · 410.1 mln |
| `overdue` | To'lov oynasi yopilgan — **aralashuv kerak** | 15 ta · 96.7 mln |
| qolgani | Joriy oy ishi, hali muddati kelmagan | — |

Qo'shimcha: `Contract.openingDebt` (1C dan olingan boshlang'ich qarz) endi
hisobga kiradi va TO'LIQ muddati o'tgan deb sanaladi — tarixiy qarz ta'rifan
kechikkan. 1C solishtiruvi ham faqat **hisob qo'yilgan** qarzni oladi
(`overdue + dueNow`), joriy oy ishini emas.

**1C bilan farqning SABABI endi nomlangan** — sverkaga yangi tekshiruv qo'shildi:
153 shartnomadan **102 tasida boshlang'ich qarz yo'q**, va 1C ning 131 qatoridan
65 tasi firmaga bog'lanmagan. Farq (395.5 mln) sirli raqam emas, ikki aniq sabab.

**Faza 1 (yagona yozuv darvozasi) BAJARILDI:** `lib/cashGate.ts` + `lib/ledger.ts`
o'lchov ustunlari (kanal/kontragent) + 2 migratsiya + `scripts/backfill-ledger.ts`
(dry-run → apply → rollback sikli test bazasida tekshirilgan). Karta xarajati va
bank chiqimi yo'llari darvozadan o'tadi. **Prod backfill hali qilinmagan.**

**Faza 1–5 QOLDI.** `npm run recovery:status` hozir 9 ta blokerni ko'rsatadi;
ulardan "Jurnal to'liq emas" (847 qator, 1.45 mlrd so'm) va "Ikki balans mos
emas" (105.6 mln so'm farq) aynan Faza 1 va uning backfilli hal qiladigan
narsalar. Qolgan blokerlar bu ko'rikdan tashqarida (bot, obligation generatsiyasi).

---

## 0. Umumiy baho

Yadro **kutilganidan ancha pishiq**. Boshqa loyihalarda deyarli uchramaydigan
narsalar bor va ular to'g'ri qilingan:

- **Soft delete + reversal**: moliyaviy qator hech qachon jismonan o'chirilmaydi,
  jurnal izi teskari yozuv bilan yopiladi (`lib/ledger.ts:98`). To'g'ri.
- **Serializable tranzaksiya**: balans tekshiruvi va yozuv bitta tranzaksiyada
  (`lib/tx.ts`, `lib/balance.ts:278`). Ikki parallel chiqim muammosi hal qilingan.
- **Davr qulfi**: `assertPeriodOpen` deyarli hamma yozuv yo'lida.
- **Sverka moduli** (`lib/reconciliation.ts`) o'z nosozliklarini o'zi tan oladi —
  bu juda kam uchraydi va katta yutuq.
- **Immutable snapshot** DB trigger bilan qulflangan.
- **KPI dalil qatlami** (`lib/kpiEvidence.ts`): majburiyat → hukm → performance
  zanjiri, "eng yomoni g'olib" qoidasi bilan. Bu to'g'ri modellashtirilgan.

Ya'ni muammo "kod yomon" emas. Muammo — **bitta pul haqida bir nechta haqiqat bor**,
va ular bir-biri bilan kelishmaydi. Quyida shu.

---

## 1. Pul oqimining hozirgi xaritasi

```
MIJOZ TO'LOVI (3 kanal)
  bank vipiskasi ──► BankTransaction ──► PaymentAllocation ──► Payment(oylik yig'ma)
  1C plastik reyestri ──────────────────► PaymentAllocation ──► Payment
  naqd ─────────────────────────────────► PaymentAllocation ──► Payment
                                                                  │
                                                                  └─► LedgerEntry? (faqat UI yo'lida)

FIRMA CHIQIMI
  Expense (tasdiq oqimi bilan) ──► LedgerEntry ✓
  KassaEntry(expense) ───────────► LedgerEntry ✓ (UI) / ✗ (import)
  Payout (oylik) ────────────────► LedgerEntry ✓

O'ZINI-O'ZI BAND QILGAN SHAXS
  bank ──► TransitEntry(in) ──► [karta qoldig'i] ──► TransitEntry(out) + KassaEntry(expense)
           ✗ jurnalga tushmaydi              ✗ jurnalga tushmaydi
```

Uch xil "qancha pulimiz bor?" javobi mavjud:

| Manba | Qayerda | Nimani sanaydi |
|---|---|---|
| `getAvailableBalance` | `lib/balance.ts:34` | Jadval agregatlari (Payment+Kassa+Expense+Payout) |
| `getLedgerCashBalance` | `lib/ledger.ts:181` | Double-entry jurnal CASH qoldig'i |
| `getKassaSummary` | `server/kassa.ts:183` | Faqat `KassaEntry` |

Chiqimni bloklash **birinchisiga**, oy yopish **ikkinchisiga**, "Kassa" ekranidagi
raqam **uchinchisiga** tayanadi. Ular teng emas va teng bo'lishi ham shart emas —
bu ataylab qilingan emas, shunchaki shunday o'sib qolgan.

---

## 2. Kritik nuqsonlar (P0)

### 2.1 Jurnalga tushmaydigan pul yo'llari

Import va skript yo'llari `postLedger` chaqirmasdan to'g'ridan-to'g'ri `create` qiladi:

| Fayl | Qator | Nima yozadi |
|---|---|---|
| `server/bankImport.ts` | 708 | `kassaEntry.create` — bank chiqimi |
| `lib/transit.ts` | 220 | `kassaEntry.create` — kartadan xarajat |
| `lib/bank/importStatement.ts` | 286, 332 | `payment.upsert/update` — bank tushumi |
| `lib/bank/importStatement.ts` | 398, 441 | `payment.upsert/update` — plastik tushumi |
| `scripts/import-kassa-data.ts` | 105 | tarixiy import |

Natija: `getAvailableBalance` bu qatorlarni ko'radi, jurnal ko'rmaydi. Ikkalasining
farqi aynan shu summalar. Loyihaning o'zi buni biladi — `lib/reconciliation.ts:219-283`
"journal-coverage" tekshiruvi ~1.4 mlrd so'mlik tafovutni shu sababdan topgan.

**Ammo tekshiruv topadi, tuzatmaydi.** Va oy yopish `checkLedgerSourceIntegrity`
(`lib/monthClose.ts:58`) jurnal→manba yo'nalishida yuradi, ya'ni jurnalda umuman
qatori yo'q manbani ko'rmaydi — checklist yashil qolaveradi.

> **Yechim (strukturaviy):** `postLedger` yagona darvoza bo'lsin. Hech qaysi modul
> `prisma.kassaEntry.create` / `payment.upsert` ni to'g'ridan-to'g'ri chaqirmasin;
> `lib/cashGate.ts` da `recordCashMovement()` bo'lsin va u manba qatorini ham,
> ikki tomonlama yozuvni ham bitta serializable tranzaksiyada yozsin. Import
> yo'llari ham shundan o'tsin. ESLint `no-restricted-syntax` bilan qo'riqlang.

### 2.2 Avans oylikdan ayirilmaydi (server tomonda)

`server/payouts.ts:39-61`:

```ts
adjustmentType: { in: ["payment", "avans"] }   // majburiyat
paid = Σ payout (avans payout'i HAM ichida)
remaining = obligation − paid
```

Misol: oylik 5 000 000, avans 1 000 000 tasdiqlangan (u avtomatik Payout yozadi —
`server/payroll.ts:154`).

- obligation = 5 000 000 + 1 000 000 = **6 000 000**
- paid = 1 000 000
- remaining = **5 000 000** ← avans hech qachon ayirilmadi

UI esa to'g'ri hisoblaydi (`components/PayrollTable.tsx:236-252`):
`remainingBalance = 5 000 000 − 1 000 000 = 4 000 000`.

Ikki oqibat:

1. **Server chegarasi 1 mln so'mga bo'sh.** UI orqali ortiqcha to'lanmaydi (UI
   konservativroq), lekin server invarianti — "jami payout majburiyatdan
   oshmaydi" — yolg'on. Boshqa yo'ldan (skript, API) 6 mln to'lash mumkin.
2. **Oy yopish doimo yolg'on ogohlantirish beradi.** `lib/monthClose.ts:167`
   xuddi shu formulani ishlatadi, ya'ni to'liq to'langan oyda ham
   "to'lanmagan majburiyat = avans summasi" deb turadi.

### 2.3 Qo'lda berilgan bonus hech qachon to'lanmaydi

`obligationAndPaid` faqat `payment` va `avans` ni sanaydi — `bonus` yo'q.
`approveEmployeeSalary` (`server/payroll.ts:382`) esa `draft.totalSalary` ni yozadi,
u ham qo'lda bonusni bilmaydi (`lib/kpiLogic.ts:408`).

UI esa bonusni qo'shadi (`PayrollTable.tsx:249` — `+ manualBonuses`) va "To'lash"
tugmasi shu summani oldindan to'ldiradi. Natija — **`Ortiqcha to'lov bloklandi`
xatosi**, va bonusni to'lashning umuman iloji yo'q.

### 2.4 Qo'lda jarima majburiyatni kamaytirmaydi

Simmetrik nuqson: UI jarimani ayiradi (`totalReceived` ichida), server ayirmaydi.
Ya'ni jarima faqat ekrandagi raqam — pul chiqishini cheklamaydi.

### 2.5 Oylik tasdig'i naqd tekshiruvi bilan bloklanadi

`server/payroll.ts:364` — `approveEmployeeSalary` `assertSufficientFunds` chaqiradi.
Lekin bu bosqichda **pul chiqmaydi**, faqat majburiyat yoziladi. Chinakam tekshiruv
`createPayout` da (`server/payouts.ts:131`) va u to'g'ri joyda.

Teskari tomoni ham bor: tasdiqlangan lekin to'lanmagan oylik hech qayerda
**band qilingan mablag'** sifatida ushlanmaydi. `getAvailableBalance` uni ko'rmaydi,
ya'ni "bor" deb ko'rsatilgan pul aslida allaqachon odamlarga tegishli.

### 2.6 Kassa chiqim toifalari ichida "Oylik" bor

`lib/kassaCategories.ts:23` — `expense` ro'yxatida `"Oylik"`. Kimdir oylikni oddiy
kassa chiqimi qilib yozsa, `Payout` bilan **ikki marta** sanaladi va hech qanday
qo'riqchi buni ushlamaydi. Bank importi bu toifani ataylab bloklaydi
(`lib/bank/classifyExpense.ts:46` `NON_POSTABLE_CATEGORIES`) — lekin qo'lda kiritish
yo'lida bunday himoya yo'q.

---

## 3. Naqd pozitsiya — hisob kesimi yo'q

### 3.1 Bitta global qop

Bank hisobi, naqd kassa va xodim kartasi — uchalasi bitta `balance` raqamida.
`assertSufficientFunds` "kassada 500 mln bor" deydi, holbuki pulning hammasi
kartalarda turgan bo'lishi mumkin va bank hisobida nol.

`Expense.channelId` va `KassaEntry.channelId` mavjud — ya'ni ma'lumot **bor**,
lekin balans uni kesmaydi.

### 3.2 Bankning o'z haqiqati ishlatilmaydi

`BankStatementImport.openingBalance` / `closingBalance` saqlanadi
(`lib/bank/importStatement.ts:58-59`) — lekin **hech qayerda solishtirilmaydi**.
Bu eng qimmatli sverka: bank aytgan qoldiq bilan bizniki teng bo'lishi shart.
Hozir bu langar bo'sh turibdi.

### 3.3 Ikki xil vaqt o'qi

`movementInRange` (`lib/balance.ts:101`) `Payment` ni **`period`** (matn) bo'yicha,
qolgan hammasini **`date`** bo'yicha oladi. Ya'ni bitta hisobotda ikki xil vaqt
tushunchasi: iyul davrining avgustda kelgan to'lovi iyulga tushadi, o'sha kunning
xarajati esa avgustga.

---

## 4. O'zini-o'zi band qilganlar (tranzit)

Model **to'g'ri o'ylangan**: kartaga tushgan pul hali xarajat emas, xarajat
sarflanganda yuz beradi (`lib/transit.ts:15-23`). Bu klassik xatoni (ikki marta
sanash) oldindan to'sadi. Lekin to'rtta bo'shliq bor:

### 4.1 "Xizmat haqi" toifasi yo'q — eng muhimi

Bu tuzilmaning **asosiy maqsadi** — odamga haq to'lash. Lekin `TransitEntry(out)`
faqat `ijara | aloqa | ovqat` kabi toifalarni biladi. Odamning **o'z haqi** hech
qachon xarajatga aylanmaydi va kanal qoldig'ida abadiy osilib turadi.

Oqibat: `lib/reconciliation.ts:96-103` "tranzit qoldig'i" tekshiruvi **doimiy
sariq** bo'lib qoladi. Signal shovqinga aylanadi — bu eng yomon holat, chunki
haqiqiy anomaliya ham o'sha sariq ichida ko'rinmay ketadi.

> **Yechim:** `out` toifalariga `xizmat_haqi` qo'shing, u `DisbursementChannel.employeeId`
> orqali odamga bog'lansin va oylik ekranida "shartnoma bo'yicha to'langan"
> ustuni sifatida ko'rinsin. Shunda "bu odam bu oyda jami qancha oldi?" degan
> savolga bitta joydan javob bo'ladi.

### 4.2 Overdraft qo'riqchisi poyga (race) ga ochiq

`lib/transit.ts:193` `recordTransitOut` qoldiqni **o'qiydi**, keyin **yozadi** —
`serializable()` ichida emas. Loyihadagi boshqa hamma pul yo'li bu tuzoqni
allaqachon yopgan (`lib/tx.ts` dagi izoh aynan shu haqda), bu yo'l esa unutilgan.
Ikki parallel chiqim ikkalasi ham o'tib ketadi.

### 4.3 Soft-delete assimetriyasi

`TransitEntry` da soft-delete yo'q, u yaratgan `KassaEntry` da bor. Kassa yozuvi
o'chirilsa: firma balansi qaytadi, karta qoldig'i qaytmaydi. Ikki daftar ajraladi.

### 4.4 Soliq rejimi kuzatilmaydi

`certificateNo`, `pinfl`, `engagedAt`, `activityType`, `transitAccount` saqlanadi —
bu juda yaxshi va boshqa tizimlarda bo'lmaydi. Lekin **yillik daromad chegarasi**
kuzatilmaydi. O'zini-o'zi band qilgan shaxs uchun chegara oshsa rejim buziladi va
bu firma uchun soliq riski. Kanal kartochkasida "yil boshidan jami: X / limit Y"
ko'rsatkichi bo'lishi kerak.

---

## 5. Mijoz to'lovlari va debitorka

### 5.1 Davr = pul tushgan sana, hisob-kitob davri emas

`lib/bank/importStatement.ts:273` — `const period = periodOf(tx.valueDate)`.

Mijoz iyul hisobini avgustda to'lasa:
- iyul `Payment` qatori bo'sh qoladi → iyul **qarzdor**;
- avgust qatoriga ikki oylik pul tushadi → avgust **ortiqcha to'langan**.

**Ko'chirish (carry-forward) yo'q.** Amalda buxgalteriya firmalarida to'lovning
kechikishi qoida, istisno emas — ya'ni bu har oy ishlaydi.

### 5.2 Ortiqcha to'lov yo'qoladi

`lib/debt.ts:55` — `Math.max(0, due − paid)`. Avans **tashlab yuboriladi**.
`DebtSnapshot.advance` maydoni bor (1C bergani), lekin ASRO o'z hisobida avansni
umuman yuritmaydi. Ya'ni oldindan to'lagan mijoz keyingi oyda yana qarzdor bo'lib
chiqadi.

### 5.3 Qarz shartnomani emas, firmani biladi

Qarz `Company.contractAmount` dan hisoblanadi (`lib/debt.ts:98`), holbuki:

- `Contract` jadvalida har shartnomaning **o'z summasi** bor;
- bitta mijozda bir nechta shartnoma bo'ladi (1C reyestrida shunday);
- `PaymentAllocation.contractId` yoziladi — lekin qarz hisobida **ishlatilmaydi**.

To'lov holati (`paid`/`partial`) ham shu bitta ustunga tayanadi
(`importStatement.ts:330, 435`). Sverka buni ogohlantirish sifatida ko'rsatadi
(`lib/reconciliation.ts:122-142`), ya'ni muammo ma'lum.

### 5.4 1C bilan solishtirish tuzilishi jihatdan mumkin emas

`DebtSnapshot` **jamg'arilgan** qarzni beradi, ASRO esa **joriy oy** qarzini.
`lib/debt.ts:78-80` buni to'g'ri tan oladi ("ikkalasi teng bo'lmaydi"). Lekin
teng bo'lmasa, solishtirish ham qila olmaymiz — ya'ni 1C ni tekshirish vositasi
sifatida ishlata olmaymiz. Buning uchun ASRO ham jamg'arilgan qarzni yuritishi kerak.

---

## 6. KPI va oylik mantiqi

### 6.1 `amount_penalty` qoidalari — o'lik kod

`lib/kpiScoring.ts:90` `fixedPenalty` qaytaradi. Butun kod bazasida uni
**hech kim o'qimaydi** (grep: faqat `kpiScoring.ts` ichida uchraydi).

Ya'ni admin "so'mda jarima" turidagi qoida yaratadi, xodimga jarima yozadi —
va **hech narsa bo'lmaydi**. Bu jim ishlamaydigan xususiyat, eng yomon turi.

### 6.2 Bitta oylikda ikki xil metodologiya

`lib/kpiLogic.ts:193` — v2 performance yozuvi bo'lgan firmada v2 yo'li, bo'lmaganida
eski `operation`-status yo'li. Bitta xodimning oyligi ikki xil hisoblash usulidan
yig'ilishi mumkin. Bu vaqtinchalik ko'prik sifatida to'g'ri edi, lekin doimiy
holatga aylangan.

### 6.3 KPI bazasi — shartnoma summasi, odamning stavkasi emas

`lib/kpiLogic.ts:233` — `kpiBonus = (contract × sumPercent) / 100`.

Rol cheklovlari (`KPI_SALARY_CONFIG`: 5% / 2.5% / 1%) buni muvozanatlaydi va bu
qasddan qilingan. Lekin ikkita natijasi bor:

- **Bosh buxgalterda KPI umuman yo'q** — `kpiMaxPercent: 0` (`kpiScoring.ts:142`).
  Kod izohi buni tushuntiradi ("reglament uchta rol uchun yozilgan"), lekin
  boshqaruv jihatdan bu — eng mas'ul rol motivatsiya tizimidan tashqarida.
- **Bonus cheklangan, jarima cheklanmagan** (`kpiScoring.ts:157`). Har firma
  darajasida `max(0, raw)` (`kpiLogic.ts:235`) — bitta firmadagi katta jarima
  o'sha firma ulushini nolga tushiradi va ortig'i **yo'qoladi**. `rawTotal`
  faqat umumiy manfiylikni ushlaydi (`server/payroll.ts:347`).

### 6.4 Stavkaning ikki manbasi — biri o'qilmaydi

`ContractAssignment` da `salaryType`, `salaryValue`, `startDate`, `endDate` bor
va `upsertContractAssignment` (`server/payroll.ts:429`) ularni yozadi.

**Oylik hisobi bu jadvalni umuman o'qimaydi.** Stavka `Company.accountantPerc/Sum`
dan olinadi (`lib/kpiLogic.ts:253-267`).

Ikki oqibat:
- **Tarix yo'q.** `ContractAssignment` da `startDate`/`endDate` bor — ya'ni
  "kim qachondan qachongacha" ma'lumoti saqlanadi, lekin oylikka ta'sir qilmaydi.
- **Proratsiya yo'q.** Xodim oy o'rtasida almashsa, butun oy yangi odamga yoziladi.

### 6.5 Ism bo'yicha moslashtirish

`lib/kpiLogic.ts:352` — `byName` fallback (id yo'q bo'lsa ism bo'yicha).
Ismdoshlar bo'lsa begona odamning oyligiga qo'shiladi. Loyihada dublikat INN
muammosi allaqachon bo'lgan — ism dublikati xuddi shunday xavf, faqat bu safar
pul bilan.

### 6.6 Oylik soliqlari yo'q

Butun kod bazasida jismoniy shaxs daromad solig'i, INPS yoki ushlab qolish
mantiqi **yo'q**. Oylik faqat "gross". Agar bu ataylab (chunki odamlar
o'zini-o'zi band qilgan shaxs sifatida rasmiylashtirilgan va o'z solig'ini o'zi
to'laydi) — bu **to'g'ri qaror**, lekin hech qayerda yozilmagan. `CONTEXT.md` ga
qo'shilishi kerak, aks holda keyingi ishlovchi buni "unutilgan" deb hisoblaydi.

---

## 7. Maqsadli model — nima "mukammal" ko'rinishga olib keladi

Yuqoridagi nuqsonlarning **ko'pchiligi bitta ildizdan**: majburiyat (kim kimga
qarzdor) va pul harakati (kim kimga qachon berdi) alohida saqlanmagan. Formulani
tuzatish bilan emas, **hisoblar rejasini kengaytirish** bilan hal bo'ladi.

### 7.1 Hisoblar rejasini kengaytiring

Hozir 5 ta hisob bor (`lib/ledger.ts:12`). Kerak:

```
AKTIVLAR
  CASH_BANK:<accountId>     har bir bank hisobi alohida
  CASH_ON_HAND              naqd kassa
  CASH_CARD:<channelId>     har bir xodim kartasi
  AR:<companyId>            mijoz qarzi (debitorka)

MAJBURIYATLAR
  SALARY_PAYABLE:<userId>   tasdiqlangan, lekin to'lanmagan oylik

DAROMAD / XARAJAT
  CONTRACT_INCOME · KASSA_INCOME
  OPERATING_EXPENSE · SALARY_EXPENSE · CONTRACTOR_EXPENSE
```

### 7.2 Har hodisa uchun yozuv

| Hodisa | Debit | Credit | Nima yechiladi |
|---|---|---|---|
| Oyning hisobi qo'yildi | `AR:firma` | `CONTRACT_INCOME` | 5.1 — davr endi to'lov sanasiga bog'liq emas |
| Mijoz to'ladi (bank/plastik/naqd) | `CASH_BANK` | `AR:firma` | 5.2 — ortiqcha to'lov `AR` ni manfiyga (avansga) o'tkazadi |
| Oylik tasdiqlandi | `SALARY_EXPENSE` | `SALARY_PAYABLE:xodim` | 2.5 — pul chiqmaydi, lekin band bo'ladi |
| Avans berildi | `SALARY_PAYABLE:xodim` | `CASH` | **2.2 o'z-o'zidan hal bo'ladi** |
| Oylik to'landi | `SALARY_PAYABLE:xodim` | `CASH` | qolgan = `SALARY_PAYABLE` qoldig'i, formula kerak emas |
| Kartaga o'tkazildi | `CASH_CARD:kanal` | `CASH_BANK` | 3.1 — aktiv ko'chdi, xarajat emas |
| Kartadan xarajat | `OPERATING_EXPENSE` | `CASH_CARD` | hozirgi mantiq, endi jurnalda |
| Kartadan xizmat haqi | `CONTRACTOR_EXPENSE` | `CASH_CARD` | **4.1 hal bo'ladi** |

E'tibor bering: 2.2, 2.3, 2.4, 2.5, 5.1, 5.2, 4.1 — **hammasi bitta o'zgarishdan**
yechiladi. Chunki bular alohida buglar emas, bitta yetishmayotgan qatlamning
ko'rinishlari.

### 7.3 Yagona yozuv darvozasi

```ts
// lib/cashGate.ts
export async function recordCashMovement(input: {
  kind: "client_payment" | "expense" | "payout" | "transit_in" | "transit_out";
  amount: number;
  date: Date;
  channelId: string;          // MAJBURIY — pul qaysi hisobdan
  ...
}): Promise<void>
```

Manba qatori ham, ikki tomonlama yozuv ham **shu funksiya ichida**, bitta
serializable tranzaksiyada. Import, UI, skript — hammasi shundan o'tadi.
`prisma.kassaEntry.create` ni to'g'ridan-to'g'ri chaqirish ESLint bilan taqiqlanadi.

Bu 2.1 ni **qayta yuzaga kelmaydigan** qiladi. Hozirgi sverka nuqsonni topadi,
darvoza esa uni **imkonsiz** qiladi.

### 7.4 Bank langari

Har import oxirida: `CASH_BANK:<account>` qoldig'i vipiskaning `closingBalance`
bilan solishtirilsin. Farq bo'lsa — oy yopilmasin (bloklovchi checklist bandi).
Bu tashqi haqiqat bilan yagona bog'lanish nuqtasi va hozir bo'sh turibdi.

---

## 8. Bosqichma-bosqich reja

### Faza 0 — qon ketishini to'xtatish (1-2 kun, xavfsiz)

Bular mustaqil, bir-birini kutmaydi, migratsiya talab qilmaydi:

1. `recordTransitOut` ni `serializable()` ichiga oling (4.2).
2. `obligationAndPaid` da avansni majburiyatdan chiqaring — `payment` majburiyat,
   `avans` esa **to'lov** (2.2). Bir vaqtda `lib/monthClose.ts:167` ni ham.
3. `obligation` ga qo'lda `bonus` ni qo'shing, `jarima` ni ayiring (2.3, 2.4).
4. `approveEmployeeSalary` dan `assertSufficientFunds` ni olib tashlang (2.5).
5. `lib/kassaCategories.ts` dagi `"Oylik"` toifasini olib tashlang yoki
   `createKassaEntry` da bloklang (2.6).
6. `capKpiPercent` natijasini oylik ekranida ko'rsating — hozir jarima qayerda
   yo'qolgani ko'rinmaydi (6.3).

### Faza 1 — yozuv darvozasi (1 hafta)

7. `lib/cashGate.ts` yozing, hamma yo'lni undan o'tkazing (2.1, §7.3).
8. Tarixiy qatorlar uchun backfill skripti — `scripts/backfill-financial-core.ts`
   allaqachon shu naqshda, uni kengaytiring.
9. ESLint qoidasi bilan qulflang.
10. `checkLedgerSourceIntegrity` ni **manba→jurnal** yo'nalishida ham yuriting.

### Faza 2 — hisob kesimi (1 hafta)

11. `LedgerEntry` ga `channelId` qo'shing, `ACCOUNTS.CASH` ni kanal kesimiga bo'ling.
12. `assertSufficientFunds(channelId)` — qaysi hisobdan chiqayotganini bilsin (3.1).
13. Bank langari checklist bandi (3.2, §7.4).

### Faza 3 — majburiyat qatlami (1-2 hafta)

14. `SALARY_PAYABLE` hisobi; oylik "qolgan" raqami formuladan emas, qoldiqdan.
15. `AR:<companyId>` hisobi; oy boshida `Charge` yoziladi, tushum unga taqsimlanadi
    (5.1, 5.2, 5.3).
16. Qarzni `Contract` darajasiga tushiring, FIFO taqsimot.
17. 1C `DebtSnapshot` bilan yonma-yon solishtirish ekrani (5.4).

### Faza 4 — KPI to'liqligi (1 hafta)

18. `fixedPenalty` ni oylikka ulang yoki `amount_penalty` turini olib tashlang (6.1).
19. Legacy operation-status yo'lini o'chiring — bitta metodologiya (6.2).
20. Bosh buxgalter KPI konvertini hal qiling (6.3).
21. `ContractAssignment` ni stavka manbai qiling, proratsiya qo'shing (6.4).
22. `byName` fallback ni olib tashlang (6.5).

### Faza 5 — o'zini-o'zi band qilganlar to'liqligi

23. `xizmat_haqi` toifasi + odamga bog'lash (4.1).
24. `TransitEntry` ga soft-delete (4.3).
25. Yillik limit ko'rsatkichi kanal kartochkasida (4.4).

---

## 9. Nima qilmaslik kerak

- **Sverkani avtomatik tuzatuvchi qilmang.** `lib/reconciliation.ts:15` dagi qaror
  ("bu yerda TUZATILMAYDI, faqat KO'RSATILADI") to'g'ri. Avtomatik tuzatish jim
  ravishda ma'lumot buzadi.
- **`Payment` ni tashlab yubormang.** U oylik yig'ma sifatida ishlaydi va
  `PaymentAllocation` bilan to'g'ri modellashtirilgan. `AR` hisobi uning ustiga
  qo'shiladi, o'rniga emas.
- **Snapshot triggerini yumshatmang.** Immutable snapshot — tizimning eng ishonchli
  qismi.
- **KPI qoidalarini kodga ko'chirmang.** "Rules are data, never code" (`CONTEXT.md`)
  to'g'ri qaror.

---

## 10. Bitta jumlada

Tizim **buxgalteriya jihatdan to'g'ri o'ylangan, lekin yarim yo'lda to'xtagan**:
double-entry jurnal bor, ammo pulning uchdan bir qismi undan chetlab o'tadi;
majburiyat va to'lov ajratilgan, ammo faqat oylikda va u yerda ham to'liq emas;
qarz hisoblanadi, ammo faqat joriy oy uchun. Jurnalni **yagona majburiy yo'l**
qilish va unga majburiyat hisoblarini (`AR`, `SALARY_PAYABLE`) qo'shish — bu
hujjatdagi 15 dan ortiq nuqsonni bittada yopadi.
