# 1 331 391 067 so'm — balans qayerdan kelyapti

> **Holat: TARIX** · 2026-08-20 — o'sha kungi tashxis — bugungi kod bilan qayta solishtirilmagan.
> Bitta raqamning (1 331 391 067) manbagacha yoyilishi.
> Amaldagi hujjatlar xaritasi: [`docs/README.md`](../README.md)

**Sana:** 2026-08-20 · **Manba:** prod (16.192.135.23) · **Usul:** faqat o'qish so'rovlari

Bu hujjat `/kassa` va direktor hisobotida ko'rinadigan **1 331 391 067 so'm** raqamining har bir tiyinini manbasigacha ochadi.

---

## 1. Formula

Raqam `lib/balance.ts` `getAvailableBalance()` dan keladi. Formulasi:

```
balance = income − outflow

income  = Payment (status: paid|partial, deletedAt: null)   = 1 383 940 000
        + KassaEntry (type: income, status: approved)        =             0
outflow = KassaEntry (type: expense, status: approved)       =    52 548 933
        + Payout (deletedAt: null)                           =             0
        + Expense jadvali (KassaEntry ga birlashtirilgan)     =             0

balance = 1 383 940 000 − 52 548 933 = 1 331 391 067
```

---

## 2. Kirim: 1 383 940 000 so'm

284 ta `Payment` qatori. **Barchasi shartnoma to'lovlari** — kassa kirimi umuman yo'q (`incomeKassa = 0`).

### Davr bo'yicha

| Davr | Holat | Qator | Summa |
|---|---|---:|---:|
| 2026-07 | paid | 154 | 810 990 000 |
| 2026-07 | partial | 11 | 41 492 000 |
| 2026-08 | paid | 109 | 498 758 000 |
| 2026-08 | partial | 10 | 32 700 000 |
| | | **284** | **1 383 940 000** |

Ya'ni butun balans **ikki oylik** ma'lumotdan iborat. Bu kutilgan holat: prod 2026-08 da tozalangan ("clean start"), `BILLING_START_PERIOD = "2026-07"`.

### To'lov usuli bo'yicha

| Usul | Qator | Summa |
|---|---:|---:|
| schyot (bank o'tkazmasi) | 271 | 1 351 240 000 |
| plastik | 13 | 32 700 000 |

### Pul qayerdan aniqlangan (`PaymentAllocation`)

| Manba | Qator | Summa |
|---|---:|---:|
| bank (vipiska importi) | 307 | 1 341 740 000 |
| plastik (reestr) | 16 | 39 700 000 |
| **Jami** | **323** | **1 381 440 000** |

Bank tomonidan tasdiq: `BankTransaction` da `income/posted` = **307 ta / 1 341 740 000 so'm** — allocation bilan tiyinigacha mos.

⚠️ **Allocation jami (1 381 440 000) `Payment` jamidan 2 500 000 so'mga kam.** Demak 2,5 mln so'mlik to'lov bank vipiskasi yoki plastik reestriga bog'lanmagan — qo'lda kiritilgan bo'lishi mumkin. Bu alohida tekshirishga arziydi.

### Eng yirik 15 to'lovchi

| Firma | To'lov | Summa |
|---|---:|---:|
| MCHJ "ANVAR FARMSERVIS" | 2 | 40 000 000 |
| TRINITY TECHNOLOGY MCHJ | 2 | 40 000 000 |
| VERTEX BETON | 1 | 35 000 000 |
| Abduvali ota MCHJ | 2 | 30 000 000 |
| KOLBERG MEDICAL | 2 | 30 000 000 |
| Dilorom-Xidoyat | 2 | 28 500 000 |
| STANDART CHICKEN | 2 | 28 000 000 |
| INTEST MAX OOO | 1 | 28 000 000 |
| STROY SURXON INDUSTRY | 2 | 27 000 000 |
| Alfraganus University Hospital | 2 | 26 000 000 |
| ENGLIFY | 2 | 26 000 000 |
| RAMAZON PRODUCT LINE | 2 | 20 000 000 |
| RAHMATJON OTA BUSINESS | 1 | 20 000 000 |
| GREAT KOMAX | 1 | 20 000 000 |
| URBAN HEATING GROUP | 1 | 20 000 000 |

---

## 3. Chiqim: 52 548 933 so'm

713 ta tasdiqlangan `KassaEntry` chiqimi.

| Toifa | Qator | Summa |
|---|---:|---:|
| ovqat_xojalik | 691 | 32 312 100 |
| Ovqat | 1 | 13 596 000 |
| Other | 2 | 5 080 000 |
| Texnika | 4 | 602 866 |
| boshqa | 5 | 416 400 |
| Xarajat | 1 | 389 000 |
| bank_komissiya | 9 | 152 567 |
| | **713** | **52 548 933** |

### Davr bo'yicha

| Davr | Qator | Summa | | Davr | Qator | Summa |
|---|---:|---:|---|---|---:|---:|
| 2025-02 | 46 | 1 797 000 | | 2026-03 | 30 | 1 244 000 |
| 2025-06 | 90 | 9 863 700 | | 2026-04 | 58 | 2 683 000 |
| 2025-07 | 80 | 3 763 000 | | 2026-05 | 38 | 1 541 500 |
| 2025-08 | 60 | 1 828 400 | | 2026-06 | 57 | 1 989 000 |
| 2025-09 | 35 | 1 058 000 | | 2026-07 | 76 | 22 049 833 |
| 2025-10 | 49 | 1 680 500 | | 2026-08 | 12 | 450 000 |
| 2025-12 | 43 | 1 380 000 | | **2026-12** | **39** | **1 221 000** |

⚠️ **Ikkita anomaliya.** Kirim faqat 2026-07/08 dan, chiqim esa 2025-02 dan boshlanadi — ya'ni "clean start" chiqim tomoniga qo'llanmagan. Va **2026-12 da 39 ta qator bor — bu kelajak sanasi** (bugun 2026-08). Ikkalasi ham import qilingan ma'lumotdagi sana xatosiga o'xshaydi.

---

## 4. Balansga KIRMAGAN pul

Bu eng muhim bo'lim: 1,33 mlrd raqami **bankdagi pul emas**, u faqat yuqoridagi ikki jadvalning ayirmasi.

| Nima | Summa | Nega kirmagan |
|---|---:|---|
| Tasdiqlanmagan chiqim | 63 048 000 | 3 ta `pending` qator — pul hali chiqmagan, **to'g'ri** chiqarilgan |
| Tranzit kartalardagi qoldiq | 175 048 512 | Kartaga o'tkazish xarajat emas; pul hali firmaniki. `balance` ICHIDA turadi, `transitBalance` bo'lib alohida ko'rsatiladi |
| **Toifalanmagan bank chiqimi** | **923 735 992** | 446 ta `unmatched` `BankTransaction` — hali `KassaEntry` ga aylanmagan, shuning uchun **chiqim sifatida ayrilmagan** |
| Oylik to'lovlari | 0 | `Payout` jadvali bo'sh |

**Eng katta ogohlantirish shu:** bankda 446 ta, jami 923 735 992 so'mlik chiqim tranzaksiyasi toifalanmay turibdi. Ular toifalangach balans **shu miqdorga qadar kamayishi mumkin**. Ya'ni 1,33 mlrd — yuqori chegara, yakuniy raqam emas.

Taqqoslash uchun bank tomoni:

| Yo'nalish | Holat | Qator | Summa |
|---|---|---:|---:|
| income | posted | 307 | 1 341 740 000 |
| income | ignored | 15 | 82 364 125 |
| expense | posted | 73 | 515 319 432 |
| expense | **unmatched** | **446** | **923 735 992** |

Tranzit harakati (`TransitEntry`): kirim 94 ta / 616 801 848, chiqim 125 ta / 441 753 336 → kartalarda qoldiq **175 048 512**.

---

## 5. Jurnal (double-entry) bilan sverka

| Hisob | Debit | Kredit |
|---|---:|---:|
| CASH | 1 391 940 000 | 62 548 933 |
| CONTRACT_INCOME | 10 000 000 | 1 391 940 000 |
| OPERATING_EXPENSE | 52 548 933 | 0 |

`CASH` qoldiq = 1 391 940 000 − 62 548 933 = **1 329 391 067**

```
Manba jadvallar : 1 331 391 067
Jurnal CASH     : 1 329 391 067
TAFOVUT         :     2 000 000
```

### 2 mln so'm nima ekani — aniqlandi

284 ta to'lovning **283 tasida** jadval summasi jurnal nettosiga tiyinigacha teng. Farq **bitta** qatorda:

| Firma | Davr | Jadvalda | Jurnalda | Farq |
|---|---|---:|---:|---:|
| SHIRIN SUPER TAOM | 2026-07 | 3 000 000 | 1 000 000 | **−2 000 000** |

Batafsil: bu to'lovda **ikkita** allocation bor —

```
1 000 000  bank  2026-07-28
2 000 000  bank  2026-07-13
```

lekin jurnalda faqat bitta provodka bor (1 000 000, 2026-08-18 20:51 da yozilgan). Ya'ni 2 mln lik birinchi allocation `postLedger` kodidan **oldin** kirgan va o'shanda jurnalga tushmagan.

**Nega backfill buni tuzatmadi.** `scripts/backfill-ledger.ts` manbani "qamralgan" deb hisoblashda **nettosi nolmi** deb tekshiradi (`coveredIds`). SHIRIN nettosi 1 000 000 — nol emas, demak "qamralgan" deb belgilanib **butunlay o'tkazib yuborilgan**. Tekshiruv ikkilik ("bormi/yo'qmi"), "summasiga tengmi" emas.

> ⚠️ **Oldingi tushuntirishim noto'g'ri edi.** `lib/ledger.ts` dagi `LEDGER_DRIFT_TOLERANCE` izohida bu 2 mln "`lib/balance.ts` qaytarishlarni modellashtirmaydi" deb yozilgan. Bu **xato** — haqiqiy sabab yuqoridagi qisman post. `CONTRACT_INCOME` dagi 10 mln debit esa bitta to'lovning (`3f56649e…`) **to'rt marta takrorlangan 2,5 mln lik reversali** bo'lib, ular o'z postlari bilan juftlashgan va nettoga ta'sir qilmaydi.

**Xulosa: tafovut 0 ga tushirilishi mumkin.** Kerak bo'lgani — SHIRIN qatorining 1 mln lik provodkasini teskarilab, 3 mln qilib qayta yozish. Shundan keyin `LEDGER_DRIFT_TOLERANCE` ni `0.01` ga tushirish kerak.

---

## 6. Yakuniy javob

**1 331 391 067 so'm = 2026-07 va 2026-08 oylarida 284 ta firmadan tushgan 1 383 940 000 so'm shartnoma to'lovi, minus 713 ta tasdiqlangan xarajat 52 548 933 so'm.**

Raqam ichki jihatdan izchil va jurnal bilan 99,85% mos (farq 2 mln, sababi aniq va tuzatilishi mumkin). Lekin uni **bankdagi mavjud pul deb o'qib bo'lmaydi**:

1. 923 735 992 so'mlik bank chiqimi hali toifalanmagan va ayrilmagan;
2. 175 048 512 so'm xodimlar kartalarida turibdi (balans ichida, lekin kassada emas);
3. chiqim tomonida 2025-yil va 2026-12 sanali qatorlar bor — sana ma'lumoti tozalanmagan.

### Tavsiya etilgan tartib

| # | Ish | Ta'siri |
|---|---|---|
| 1 | SHIRIN provodkasini qayta yozish | tafovut → 0, tolerans 0.01 ga tushadi |
| 2 | `backfill-ledger.ts` da "qamralgan" mezonini `netto == summa` ga o'zgartirish | shu sinfdagi xato qaytalanmaydi |
| 3 | 446 ta `unmatched` bank chiqimini toifalash | balans haqiqiy qiymatga keladi |
| 4 | 2,5 mln lik bog'lanmagan to'lovni topish | kirim tomoni to'liq asoslanadi |
| 5 | 2026-12 va 2025-yil sanalarini tekshirish | davr hisobotlari to'g'rilanadi |

---

## Tekshirish usuli

Bu hujjatdagi har bir raqam quyidagilardan olingan (barchasi read-only):

```bash
npx tsx scripts/recovery-status.ts        # umumiy sverka
npx tsx scripts/backfill-ledger.ts        # jurnal bo'shliqlari (dry-run)
npx tsx scripts/contract-amount-audit.ts  # shartnoma summalari
```

Qolgan kesimlar (davr/toifa/kanal bo'yicha guruhlash) prodda bir martalik `prisma.groupBy` so'rovlari bilan olindi.
