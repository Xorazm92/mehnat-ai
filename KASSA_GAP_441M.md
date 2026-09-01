# KASSA_GAP_441M — 441,7 mln so'mlik karta xarajati

**Sana:** 2026-09-01 · **Manba:** `KASSA_REVIEW.md` §1 ("Oqibati — 441,7 mln
balansdan tushib qolgan") · **Qamrov:** prod bazasi (`inbola`), `TransitEntry`,
`KassaEntry`, `LedgerEntry`, `BankTransaction` · **Usul:** faqat o'qish, har
da'vo SQL natijasi bilan.

---

## 0. Bir jumlada

**Bo'shliq YOPILGAN.** Prodda bog'lanmagan `TransitEntry(out)` qatori
qolmagan (0 ta), iyul ham, avgust ham to'liq kassaga va jurnalga tushgan.
Ildiz sabab ko'rikda to'g'ri aniqlangan edi — import skriptlari
`recordTransitOut` ni chetlab o'tib to'g'ridan-to'g'ri `TransitEntry` yozgan;
tuzatish 2026-09-01 da qo'llandi. Bank tomonida esa **yangi** bo'shliq qoldi: 91 qator / 73 323 355,03
`unmatched` holatda — ammo juftlik tahlili ko'rsatdiki, bu raqamning katta
qismi kartaga tegishli va uni ommaviy postlash ikki marta sanashga olib
keladi (§3.2).

---

## 1. Qamrov va usul

Tekshirilgan gipotezalar (topshiriqda sanab o'tilganlar):

| # | Gipoteza | Natija |
|---|---|---|
| 1 | `TransitEntry(out)` `KassaEntry` ga bog'lanmagan | ✅ **TASDIQLANDI** — ildiz sabab shu edi, hozir yopilgan |
| 2 | Bank importi `postExpenseFromBankTransaction` orqali postlanmagan | ⚠️ qisman — 441,7 mln ga aloqasi yo'q, lekin alohida 73,3 mln bo'shliq bor |
| 3 | `KassaEntry.channelId` noto'g'ri kanalga bog'langan | ❌ rad etildi — 31/31 kassa to'g'ri kanalga tushgan |
| 4 | `KassaEntry` bor, `LedgerEntry` yo'q | ❌ rad etildi — 450 yozuvdan 0 tasi jurnalsiz |
| 5 | `ignoreExpenseTransaction` bilan noto'g'ri chetlab o'tilgan | ❌ rad etildi — `ignored` qatorlar asosli (§3.3) |

Ko'rik **2026-08-18** da yozilgan; o'shandan beri prod holati o'zgargan, shu
sababdan har raqam qaytadan o'lchandi.

---

## 2. Sabab №1 — `recordTransitOut` chetlab o'tilgani (YOPILDI)

### Dalil — ko'rik paytidagi holat

`KASSA_REVIEW.md` §1:

```
TransitEntry(out):            125 ta / 441 753 336 so'm
  KassaEntry bilan bog'langan:  0 ta / 0
  BOG'LANMAGAN:               125 ta / 441 753 336   ← balansda YO'Q
```

### Dalil — bugungi holat

```sql
select case when "kassaEntryId" is null then 'BOG''LANMAGAN' else 'bog''langan' end,
       count(*), sum(amount)
from "TransitEntry" where direction='out' group by 1;
```

```
   holat    | count |      sum
------------+-------+---------------
 bog'langan |   250 | 1209160469.04
(1 row)
```

Davr kesimida:

```
   oy    | boglanmagan | jami |    summa
---------+-------------+------+--------------
 2026-07 |           0 |  126 | 441753336.42
 2026-08 |           0 |  124 | 767407132.62
```

Iyul summasi ko'rikdagi 441 753 336 bilan **tiyinigacha bir xil** (qator soni
125 → 126: ko'rikdan keyin bitta bank komissiyasi qatori qo'shilgan).

### Nega yuz bergan

`lib/transit.ts` qoidasi: kartadan xarajat ikki yozuv hosil qiladi —
`TransitEntry(out)` (karta qoldig'i uchun) va `KassaEntry(expense)` (firma
balansi uchun); balans faqat ikkinchisini o'qiydi (`lib/balance.ts:93`).
Import skripti esa `recordTransitOut` funksiyasini emas, to'g'ridan-to'g'ri
`prisma.transitEntry.create` ni chaqirgan. Natijada karta qoldig'i to'g'ri,
firma balansi esa 441,7 mln ga **ortiqcha** ko'rsatgan.

### Nima qilindi (2026-09-01)

| Qadam | Vosita | Natija |
|---|---|---|
| Iyul | `scripts/link-transit-expenses.ts --apply` | 104 qator / 424 516 503 bog'landi |
| Avgust | `scripts/import-kassa-clean.ts --replace --with-expenses` | 124 qator / 767 407 132,62 |

Iyulda 126 qatordan 22 tasi allaqachon bog'langan edi, shuning uchun
104 ta qoldi (441 753 336,42 − 424 516 503 = 17 236 833,42).

Har ikkala yo'l ham `lib/cashGate.ts#recordKassaMovement` darvozasidan
o'tadi, ya'ni `LedgerEntry` birga yoziladi — `AGENTS.md` dagi "kassa yozuvi
jurnalga ham tushishi shart" qoidasi bajarildi.

### Tekshiruv — jurnal yaxlitligi

```sql
select count(*) kassa_yozuvi,
       count(*) filter (where not exists (
         select 1 from "LedgerEntry" l
         where l."sourceTable"='KassaEntry' and l."sourceId"=k.id)) jurnalsiz
from "KassaEntry" k where k."deletedAt" is null;
```

```
 kassa_yozuvi | jurnalsiz
--------------+-----------
          450 |         0
```

Jurnalda kartalar bo'yicha CASH oyog'i (`employee_card` kanallari):
**−1 191 923 635,62** — ya'ni karta chiqimlari jurnalda mavjud.

---

## 3. Qolgan topilmalar

### 3.1 Kartaga o'tkazma `unmatched` bo'lib turadi — bu TO'G'RI

Avgustda 101 ta bank chiqimi, **683 119 730** so'm, `xodim_kartasi`
toifasida `unmatched` holatda. Bu **bo'shliq emas va tuzatilmasligi kerak**:

```
bank->karta o'tkazma   | 101 | 683,119,730.00
transit kirim (avgust) | 120 | 768,968,738.58
```

O'z bank hisobimizdan o'z xodimimiz kartasiga o'tkazma — xarajat emas
(o'z cho'ntagimizdan o'z cho'ntagimizga). Haqiqiy xarajat kartadan pul
sarflanganda yuz beradi va u allaqachon `TransitEntry(out)` → `KassaEntry`
zanjiri bilan yozilgan. Ularni "postlash" xarajatni **ikki marta** sanardi.

### 3.2 YANGI BO'SHLIQ — bank tomonidagi 73,3 mln postlanmagan

Kartaga o'tkazmani chiqarib tashlagach, avgustda `unmatched` holatda
qolgan haqiqiy chiqimlar:

| Toifa | Soni | so'm |
|---|---:|---:|
| soliq | 23 | 41 091 310,71 |
| ijara | 3 | 16 560 000,00 |
| boshqa | 3 | 7 078 000,00 |
| oylik | 5 | 5 545 486,71 |
| aloqa | 4 | 1 695 000,00 |
| bank_komissiya | 53 | 1 353 557,61 |
| **JAMI** | **91** | **73 323 355,03** |

Bu §2 dagi bo'shliqdan **boshqa** hodisa: u yerda karta daftari kassaga
tushmagan edi, bu yerda esa bank vipiskasi qatori `KassaEntry` ga
o'tkazilmagan (`server/bankImport.ts#postExpenseFromBankTransaction`
chaqirilmagan).

#### Juftlik tahlili (2026-09-01, faqat SQL)

**1-urinish — summa + sana (±3 kun).** Bank qatori karta daftaridagi yozuv
bilan juftlashtirildi (aynan teng summa, birma-bir moslik):

| Toifa | Jami | Juft topildi | Juftsiz | Postlash nomzodi |
|---|---:|---:|---:|---:|
| soliq | 23 | 6 | 17 | 15 391 310,71 |
| ijara | 3 | 0 | 3 | 16 560 000,00 |
| boshqa | 3 | 1 | 2 | 5 078 000,00 |
| oylik | 5 | 0 | 5 | 5 545 486,71 |
| aloqa | 4 | 2 | 2 | 1 495 000,00 |
| bank_komissiya | 53 | 0 | 53 | 1 353 557,61 |
| **JAMI** | **91** | **9** | **82** | **45 423 355,03** |

**Ammo bu 9 juftning ko'pi YOLG'ON.** Qo'lda ko'rilganda:

| Bank | so'm | Karta tomoni | Baho |
|---|---:|---|---|
| soliq, FININFO, "AMINBOYEV ALISHER…" | 10 000 000 | XIKMATULLAYEVA MAHMUDAXON / "Otabek akaga" | ✗ yolg'on |
| soliq, FININFO, "AMINBOYEV ALISHER…" | 10 000 000 | RO'ZMETOV JAVOHIR / "Vosstanovleniya" | ✗ yolg'on |
| boshqa, BAROKAT, "04/26БК shartnoma" | 2 000 000 | ATAXONOV RUSLONBEK / "O'ziga oylik" | ✗ yolg'on |
| aloqa, "elektron hujjat aylanishi" | 100 000 ×2 | AMINBOYEV ALISHER / "O'ziga oylik" | ✗ yolg'on |
| soliq, BAROKAT, "(5614…5378) MUXAMMADJONOV DILXUSHBEK" | 700 000 | MUXAMMADJONOV DILXUSHBEK | ✓ haqiqiy |
| soliq, SEVEN'S UP, "o'zini-o'zi band qilgan shaxs" | 2 700 000 / 1 300 000 / 1 000 000 | MIRAZIZOV MIRABBOS, BEKTURDIYEVA SEVINCHOY | ~ ehtimol |

**2-urinish — kuchli belgi.** "Bu qator aslida kartaga tegishlimi?" degan
savolga to'lov maqsadi javob beradi: unda 16 raqamli karta raqami yoki
kanal egasining familiyasi bormi.

| Kesim | Qator | so'm |
|---|---:|---:|
| Kartaga tegishli ko'rinadi | 74 | 47 889 385,42 |
| … shulardan karta kirimi ham topilgani | 11 | 40 042 642,00 |
| Mustaqil chiqimga o'xshaydi | 17 | 25 433 969,61 |

#### Xulosa — ommaviy skript yozilmasin

Ikki o'lchov ikki xil javob berdi (45,4 mln va 25,4 mln), ya'ni **avtomatik
juftlash bu ma'lumotda ishonchli emas**. Ildiz sabab —
`lib/bank/classifyExpense.ts` toifalari noto'g'ri: bank komissiyasi `soliq`
deb, kartaga o'tkazma `oylik` deb tasniflangan (53 ta komissiya qatorining
47 tasida karta belgisi bor).

Shu sababdan tavsiya: bu 91 qator **operator ko'rigidan** o'tsin
(`/kassa/chiqim` navbati), toifalagich alohida tuzatilsin. Ommaviy postlash
eng yaxshi holatda 25 mln ni to'g'ri yozadi va 40 mln ni ikki marta sanaydi.

### 3.3 `ignored` qatorlar asosli

Avgustda `ignored` qilingan qatorlar: 2 ta firmalararo o'tkazma
(10 000 000) va 4 ta moliyaviy yordam (`LOAN_GIVEN`/`LOAN_RECEIVED`
hisoblariga yozilgan). Ikkalasi ham ataylab: birinchisi guruh ichidagi
harakat, ikkinchisi qarz — daromad/xarajat emas.

### 3.4 Sxema ↔ baza — TAFOVUT YO'Q (dastlabki xulosam xato edi)

Bu bo'limda avval "sxemada `model Expense` turibdi, bazada jadval yo'q"
deb yozilgan va sabab `prisma db pull` ga qo'yilgan edi. **Ikkalasi ham
noto'g'ri.** Qayta o'lchov:

```
HEAD      | model Expense: False | Invoice.lines: True
WORKTREE  | model Expense: False | Invoice.lines: True
prod      | model Expense: False | Invoice.lines: True
prod DB   | ERROR: relation "Expense" does not exist   ← kutilgani
```

Migratsiya `20260901140000_drop_expense` prodda **2026-09-01 07:33:57** da
qo'llangan. Ya'ni D5 to'liq va to'g'ri yopilgan: jadval ham, model ham
olib tashlangan, `Invoice.lines` esa joyida.

**Nima bo'lgan edi.** Tuzatish paytida ish papkasida `schema.prisma` dan
41 qator o'chirilgan holat ko'rindi va build yiqildi. U D5 ning hali
yakunlanmagan qismi edi; `git checkout` bilan HEAD holatiga qaytarildi va
build tiklandi. Dastlabki xulosa shu oraliqdagi holatga qarab yozilgan —
xato. Yakuniy holat to'g'ri.

**Xulosa:** bu yerda tuzatiladigan narsa yo'q. `db pull` haqidagi
ogohlantirish esa o'z kuchida qoladi, lekin BOSHQA sababdan (§4).

## 4. Tuzatish takliflari

### §3.2 uchun (73,3 mln) — tavsiya etiladigan tartib

1. **Juftlik tahlili** (kod emas, faqat SQL): har toifa uchun bank qatori va
   karta daftaridagi yozuv orasida summa+sana bo'yicha moslik qidirish.
   Chiqish: "ikkala manbada bor" ro'yxati.
2. Faqat juftsizlarini postlash — `scripts/post-bank-expenses.ts`
   (`--dry-run` / `--apply` naqshi, `import "./load-env"` birinchi qator).
   Har yozuv `recordKassaMovement` orqali, ya'ni jurnal birga yoziladi.
3. `verify-kassa` ga yettinchi nazorat: "postlanmagan bank chiqimi
   (kartaga o'tkazmadan tashqari) 0 bo'lsin".

### §3.4 uchun

Ma'lumot tuzatish KERAK EMAS. `AGENTS.md` ga `db pull` taqig'i baribir
qo'shilsin — lekin "shu xato yuz bergan" deb emas: sabab `migrate dev`
taqig'i bilan BIR XIL — `schema.prisma` da hali migratsiya qilinmagan,
ammo kodda ishlatiladigan modellar bor va `db pull` ularni jimgina
o'chirib yuboradi.

### Kelajakdagi tranzaksiyalar uchun

Kod tuzatish **kerak emas**: yangi yo'llar (`import-kassa-clean.ts`,
`link-transit-expenses.ts`, veb-yuklash) `recordKassaMovement` orqali
o'tadi. Regressiyani `npm run verify:kassa` ushlaydi.

---

## 5. Tekshirish rejasi

| # | Tekshiruv | Kutilgan | Hozirgi |
|---|---|---|---|
| 1 | Bog'lanmagan `TransitEntry(out)` | 0 | ✅ 0 |
| 2 | Jurnalsiz `KassaEntry` | 0 | ✅ 0 |
| 3 | `npm run verify:kassa` | 6/6 | 5/6 (kelajak sanali 39 yozuv — alohida masala) |
| 4 | Postlanmagan bank chiqimi (kartasiz) | 0 | ❌ 91 ta / 73 323 355,03 |
| 5 | Jurnal balansi (avgust) | 0,00 | ✅ 0,00 |

---

## 6. Xulosa

`KASSA_REVIEW.md` §1 dagi **441,7 mln bo'shlig'i yopildi** — dalil §2 da.
Uning o'rniga aniqlangan 73,3 mln lik bank tomoni bo'shlig'i alohida ish
sifatida ochiq qoladi va u ikki marta sanash xavfi borligi uchun avval
juftlik tahlilini talab qiladi.
