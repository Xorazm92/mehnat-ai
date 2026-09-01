# Pul qoldig'i — to'liq solishtirma

**Sana:** 2026-09-01 · **Manba:** prod bazasi (`inbola`), faqat o'qish
**Usul:** har bir raqam SQL natijasi; farqlar so'migacha yopilgan.

---

## 0. Bir jumlada

Ikki raqamning ham noto'g'ri joyi bor edi va **farq to'liq tushuntirildi**:
jurnal 01.08 dan OLDINGI pul harakatlarini ham saqlaydi, holbuki ular
allaqachon ochilish qoldig'i ichida — ya'ni **ikki marta sanalgan**.

**31.08.2026 dagi haqiqiy pul qoldig'i — 354 445 041 so'm.**

---

## 1. Ikki hisob va ular orasidagi farq

| | Manba | Qiymat |
|---|---|---|
| Jurnal | `LedgerEntry` dagi `CASH` hisobi | **−31 592 462** |
| Ekran | `lib/balance.ts` `getAvailableBalance` | **+289 445 041** |
| **Farq** | | **321 037 503** |

Farq tasodifiy emas — uchta aniq sababdan iborat va yig'indisi **aynan** mos:

| # | Element | Jurnal | Ekran | Farq |
|---|---|---|---|---|
| 1 | Ochilish qoldig'i | 544 727 918 | 544 727 918 | 0 |
| 2 | Shartnoma to'lovlari | 699 958 000 | 660 258 000 | **+39 700 000** |
| 3 | Kassa (kirim − chiqim) | −1 341 278 380 | −915 540 877 | **−425 737 503** |
| 4 | Oylik (`Payout`) | 0 | 0 | 0 |
| 5 | Moliyaviy yordam (bank) | +65 000 000 | — | **+65 000 000** |
| | **JAMI** | **−31 592 462** | **+289 445 041** | **−321 037 503** |

`39 700 000 − 425 737 503 + 65 000 000 = −321 037 503` ✓

---

## 2. Har bir farqning sababi

### 2.1 · Shartnoma to'lovlari: +39 700 000

Jurnalda `CONTRACT_INCOME` davr kesimi:

| Davr | Summa | Yozuv |
|---|---|---|
| 2026-07 | **39 700 000** | 320 |
| 2026-08 | 660 258 000 | 407 |

Ekran `Payment.period >= '2026-08'` bilan filtrlaydi (`lib/constants.ts`
`KASSA_START_PERIOD`), jurnalda esa bunday filtr yo'q. Farq — **aynan iyul
oyining 39 700 000 so'mi**.

### 2.2 · Kassa: −425 737 503

`KassaEntry` (tirik, tasdiqlangan) davr kesimi:

| Davr | Tur | Summa | Yozuv |
|---|---|---|---|
| 2026-01 | chiqim | **1 221 000** | 39 |
| 2026-07 | chiqim | **424 516 503** | 104 |
| 2026-08 | chiqim | 951 726 283 | 383 |
| 2026-08 | kirim | 36 185 406 | 10 |

Ekran `date >= 01.08.2026` bilan filtrlaydi. Oynadan tashqarida qolgan
chiqim: `424 516 503 + 1 221 000 = 425 737 503` — **farqqa aynan teng**.

### 2.3 · Moliyaviy yordam: +65 000 000

Jurnalda `CASH` ning `BankTransaction` manbasi bo'yicha oyog'i — 4 yozuv:

```
kirim  100 000 000  Khorezm Golden Building, shartnoma №1 24.04.2026 qaytdi
kirim   25 000 000  Khorezm Golden Building, shartnoma №1 15.04.2026 qaytdi
chiqim  55 000 000  Khorezm Golden Building, moliyaviy yordam berildi
chiqim   5 000 000  Shirin Super Taom, olingan yordam qaytarildi
──────────────────
netto  +65 000 000
```

`getAvailableBalance` bu oqimni umuman ko'rmaydi — u faqat `Payment`,
`KassaEntry` va `Payout` ni o'qiydi. Qarz berish va qaytarish esa haqiqiy
pul harakati.

---

## 3. Ildiz sabab — ikki marta sanash

Ochilish qoldig'i **01.08.2026 holatiga** kiritilgan: 544 727 918.

Lekin jurnalda 01.08 dan OLDINGI pul harakatlari ham bor:

```
2026-07 shartnoma to'lovlari   +39 700 000
2026-07 kassa chiqimlari      −424 516 503
2026-01 kassa chiqimlari        −1 221 000
──────────────────────────────────────────
netto                        −386 037 503
```

Bu 386 mln **allaqachon 544 727 918 ning ichida** — iyul oxiridagi qoldiq
shu harakatlardan keyin qolgan pul edi. Jurnal ularni yana bir marta
ayirgani uchun `CASH` manfiyga tushgan:

```
354 445 041 (haqiqiy)  −  386 037 503 (takroriy)  =  −31 592 462 (jurnal)
```

Ya'ni jurnaldagi manfiy qoldiq **ma'lumot xatosi emas, davr chegarasi
xatosi**.

---

## 4. Haqiqiy qoldiq — hisob-kitob

01.08.2026 dagi qoldiqdan boshlab, FAQAT avgust harakatlari:

| Element | Summa | Manba |
|---|---|---|
| Ochilish qoldig'i 01.08.2026 | **+544 727 918** | bank + kassa (tashqi ma'lumot) |
| Shartnoma to'lovlari, avgust | +660 258 000 | `CONTRACT_INCOME` 2026-08, 407 yozuv |
| Kassa kirimlari, avgust | +36 185 406 | `KassaEntry(income)` 2026-08, 10 yozuv |
| Kassa chiqimlari, avgust | −951 726 283 | `KassaEntry(expense, approved)` 2026-08, 383 yozuv |
| Moliyaviy yordam, netto | +65 000 000 | 4 bank yozuvi (§2.3) |
| **31.08.2026 QOLDIQ** | **354 445 041** | |

Joylashuvi bo'yicha: kartalarda (tranzit) **176 610 118**, qolgani naqd va
hisobvaraqlarda — **177 834 923**.

### Hisobga OLINMAGAN qism

**81 500 000** — 25–28.08 sanalaridagi 17 ta bank kirimi firmaga
biriktirilgan (`matched`), lekin hisobga olinmagan: o'sha importlarda bitta
ham `posted` yozuv yo'q. Kassada aksi ham yo'q (mos `KassaEntry` — 0 ta),
ya'ni ikki marta sanash xavfi yo'q.

Ular hisobga olingach: **354 445 041 + 81 500 000 = 435 945 041**.

Bu qadam skript bilan emas, **Kirim navbati** ekranidan bajariladi — har
qator qaysi shartnomaga va qaysi davrga tegishli ekani qaror talab qiladi
(`PaymentAllocation`).

---

## 5. Boshqa hisoblarning holati

| Hisob | Qoldiq | Ma'nosi |
|---|---|---|
| `CONTRACT_INCOME` | 699 958 000 | shartnoma daromadi (iyul 39,7 + avgust 660,3) |
| `KASSA_INCOME` | 36 185 406 | boshqa kassa kirimlari |
| `OPERATING_EXPENSE` | 240 469 655 | operatsion xarajat |
| `SALARY_EXPENSE` | 650 654 246 | iyul 269 344 938 (kassa usuli) + avgust 381 309 308 (hisoblanma) |
| `ACCRUED_SALARIES` | 9 660 000 | avgustda hisoblangandan ORTIQ to'langan |
| `OWNER_DISTRIBUTION` | 476 679 885 | ta'sischiga taqsimot — xarajat emas |
| `LOAN_GIVEN` | 55 000 000 | Khorezm Golden Building, ochiq qarz |
| `LOAN_RECEIVED` | 0 | Shirin Super Taom bilan hisob yopilgan |
| `OPENING_BALANCE` | −664 727 918 | kapital tomoni (544,7 pul + 120,0 qarz) |

Jurnal tengligi: debet **10 298 873 436** = kredit **10 298 873 436** ✓

### Bank yozuvlarining holati

| Holat | Yo'nalish | Summa | Soni |
|---|---|---|---|
| `posted` | kirim | 639 758 000 | 144 |
| `posted` | chiqim | 104 091 282 | 160 |
| `matched` | kirim | **81 500 000** | 17 |
| `unmatched` | kirim | 42 298 400 | 5 |
| `unmatched` | chiqim | 688 665 217 | 106 |
| `ignored` | kirim | 135 000 000 | 4 |
| `ignored` | chiqim | 137 777 868 | 90 |

`unmatched` chiqim 688 665 217 — bu asosan kartaga o'tkazmalar (ichki
harakat), ular `TransitEntry` orqali yuritiladi: chiqim 1 209 160 469 /
kirim 1 385 770 587, farqi **176 610 118** — kartalarda turgan qoldiq.

---

## 6. Nima qilinishi kerak

1. **Davr chegarasini jurnalga ham qo'yish.** Ochilish qoldig'i 01.08 ga
   kiritilgan bo'lsa, jurnalda 01.08 dan oldingi pul harakati bo'lmasligi
   kerak. Ikki yo'l: yo iyul/yanvar yozuvlari `reverseLedger` bilan
   bekor qilinadi, yo ochilish qoldig'i eng erta yozuv sanasiga ko'chiriladi
   (u holda 01.01.2026 dagi qoldiq kerak bo'ladi).

2. **81,5 mln ni Kirim navbatidan o'tkazish** — §4 ga qarang.

3. **Iyul oyligini hisoblanma usuliga o'tkazish** — tabeldagi summa kerak:
   `npx tsx scripts/post-payroll-accrual.ts --period=2026-07 --amount=<summa> --apply`

4. **Yagona manba tanlash** (`ARCHITECTURE_DEBT.md` §D11) — 1-band
   bajarilgach ikki hisob teng bo'ladi va tanlov texnik masalaga aylanadi.
