# Pul qoldig'i — to'liq solishtirma

> **Holat: TARIX** · 2026-09-01 — o'sha kungi tashxis — bugungi kod bilan qayta solishtirilmagan.
> Bir martalik solishtirma; raqamlar o'sha kungi prod kesimi.
> Amaldagi hujjatlar xaritasi: [`docs/README.md`](../README.md)

**Sana:** 2026-09-01 (2-tahrir) · **Manba:** prod bazasi + `kassa/` fayllari
**Usul:** har raqam SQL yoki fayl natijasi bilan ko'rsatilgan.

> **1-tahrir NOTO'G'RI edi.** Unda `CASH` ga 544 727 918 so'mlik ochilish
> qoldig'i kiritilgan va shunga tayanib "31.08 qoldig'i 354 445 041" degan
> xulosa chiqarilgandi. Raqam tashqaridan berilgan va **tekshirilmagan** edi.
> Tekshirilganda ikki xato chiqdi (§2). Yozuv prodda bekor qilindi
> (`scripts/reverse-cash-opening.ts`), bu hujjat esa qaytadan yozildi.

---

## 1. Qarzdorlik fayllari — bu yerda xato YO'Q

Ikkala fayl ham **mijozlar qarzi** (bizga qarzdorlar), pul qoldig'i emas.
Tuzilishi uch pog'onali va har summa uch marta takrorlanadi: mijoz → shartnoma
→ bizning firma. Shuning uchun xom yig'indi (1 489 899 000) uch barobar katta.
To'g'ri daraja — **shartnoma**:

| Fayl | Qarz | Avans | Netto |
|---|---|---|---|
| `31.07.2026 qarzdorlik.json` | 496 633 000 | 162 640 000 | **333 993 000** |
| `01.08.2026. qani qarzdorlik (2).json` | 1 291 533 000 | 83 290 000 | **1 208 243 000** |

Ikkinchi faylda `Итого` qatori bor va u **1 291 533 000 / 83 290 000** —
hisobim bilan aynan mos, ya'ni yechim to'g'ri.

**Tizim bilan solishtirish** (Qarzdorlik → Hisob-kitob ekrani):

```
BOSHI 333 993 000  +  HISOBLANDI 882 250 000  −  TO'LANDI 8 000 000
                                                = 1 208 243 000  ✓
```

Ya'ni **qarzdorlik tomoni to'g'ri ishlayapti** va unga tegish shart emas.
31.07 → 01.08 farqi (882 250 000) — bu iyul ishlab bo'lingandan keyin
qo'shilgan oylik xizmat haqlari, siz aytganingizdek.

---

## 2. Ochilish qoldig'i — mening xatoyim

544 727 918 raqami ikki jihatdan noto'g'ri edi.

### 2.1 · Hajmi

01.08.2026 dagi haqiqiy pul, ma'lumotdan o'lchangan:

| Manba | Summa | Dalil |
|---|---|---|
| Bank hisoblari (10 ta) | **36 185 406** | `BankStatementImport.openingBalance`, `periodFrom = 01.08.2026` |
| Naqd va kartalar | **2 728 855** | `cash_transactions_2026-07.json`: kirim 444 482 191 − chiqim 441 600 769 − komissiya 152 567 |
| **JAMI** | **38 914 261** | |

Naqd raqami mustaqil tasdiqlangan: `O'zini-o'zi band Iyul.json` dagi
"kartadagi qoldiq" jami — **2 728 854,58**.

Ya'ni berilgan raqam haqiqiydan **~14 barobar** katta edi.

### 2.2 · Ikki marta sanash

Ochilish qoldig'i **allaqachon tizimda** bor edi. `KassaEntry` da
01.08.2026 sanali, `Boshlang'ich qoldiq` toifasidagi **10 ta kirim**:

```
FININFO             8 833 493      THE POWERFULL TEAM  7 890 259
FINANCE COUNCIL     6 575 415      SARDORBEK HOUSE     3 270 999
BAROKAT TEAM        2 464 727      SEVEN'S UP          2 331 693
TOOLSTREK CA        2 252 074      TASTIFY             2 010 243
MOLIYA AI             529 619      SOFI TEAM              26 884
─────────────────────────────────────────────────────────────────
JAMI                                                  36 185 406
```

Bu — o'sha bank ochilish qoldiqlarining o'zi, kassaga kirim sifatida
kiritilgan. Ustiga yana ochilish yozuvi qo'yish o'sha pulni ikkinchi marta
sanardi.

**Bajarildi:** yozuv `reverseLedger` bilan bekor qilindi (jurnal append-only,
qator o'chirilmaydi). `CASH` −31 592 462 → **−576 320 380**,
`OPENING_BALANCE` endi faqat qarzlardan iborat: −120 000 000.

**Qolgan haqiqiy bo'shliq:** naqd/karta qoldig'i **2 728 855** hech qayerda
yo'q — bank qoldiqlari kiritilgan, naqd qismi kiritilmagan.

---

## 3. Balans nega manfiy — haqiqiy sabab

Ochilish qoldig'i emas. Avgust harakati:

| | Summa |
|---|---|
| Kirim: shartnoma to'lovlari | 660 258 000 |
| Kirim: kassa (ochilish qoldig'i ham shunda) | 36 185 406 |
| **Jami kirim** | **696 443 406** |
| Chiqim: kassa (tasdiqlangan) | −951 726 283 |
| **Kamomad** | **−255 282 877** |

Chiqimning tarkibi (toifa kesimi, avgust):

```
O'ziga oylik      324 380 652      Ovqat            20 580 000
Otabek akaga      321 508 320      Xarajat          19 334 386
soliq             130 556 095      boshqa           14 314 396
Oylik              66 588 656      Vosstanovleniya  14 000 000
ijara              21 287 464      qolganlari       18 126 315
```

`O'ziga oylik + Oylik = 390 969 308` — avgust oyligi bilan aynan mos.
`Otabek akaga` — ta'sischiga taqsimot, jurnalda `OWNER_DISTRIBUTION` ga
ajratilgan. Ya'ni **chiqim tomonida soxta yozuv ko'rinmayapti**.

### Hisobga olinmagan kirimlar

| Holat | Summa | Izoh |
|---|---|---|
| `matched`, postlanmagan | **81 500 000** | 17 ta, 25–28.08; o'sha importlarda bitta ham `posted` yo'q |
| `unmatched` | **42 298 400** | 5 ta: 20 mln + 15 mln + 2 mln iyul uchun bux. xizmat haqi; 3 798 400 va 1 500 000 — qaytarilgan pul |
| **Aniqlangan bo'shliq** | **123 798 400** | |

`ignored` kirimlar (135 000 000) **bo'shliq emas**: 125 mln — Khorezm qarz
qaytarishi (jurnalda `LOAN_GIVEN` sifatida bor), 10 mln — firmalararo
o'tkazma (mijoz to'lovi emas).

### Qolgan tushunarsiz qism

```
kamomad                       255 282 877
aniqlangan kirim bo'shlig'i  −123 798 400
naqd ochilish qoldig'i         −2 728 855
──────────────────────────────────────────
TUSHUNTIRILMAGAN              128 755 622
```

Bu **128,8 mln** hali izohlanmagan. Tekshirish kerak bo'lgan yo'nalishlar:
`unmatched` chiqim 688 665 217 (106 ta) ichida kartaga o'tkazma bo'lib,
allaqachon kassaga yozilgani takroran chiqim sifatida sanalganmi; va
kartalardagi 176 610 118 qoldiq balansda qanday hisobga olinayotgani.

---

## 4. Jurnal holati (2026-09-01, bekor qilishdan keyin)

| Hisob | Qoldiq |
|---|---|
| `CASH` | −576 320 380 |
| `CONTRACT_INCOME` | 699 958 000 |
| `KASSA_INCOME` | 36 185 406 |
| `OPERATING_EXPENSE` | 240 469 655 |
| `SALARY_EXPENSE` | 650 654 246 (iyul 269 344 938 kassa usuli + avgust 381 309 308 hisoblanma) |
| `ACCRUED_SALARIES` | 9 660 000 |
| `OWNER_DISTRIBUTION` | 476 679 885 |
| `LOAN_GIVEN` | 55 000 000 |
| `LOAN_RECEIVED` | 0 |
| `OPENING_BALANCE` | −120 000 000 |

Debet = kredit ✓

---

## 5. Keyingi qadamlar

1. **81 500 000 ni Kirim navbatidan o'tkazish** — har qator uchun shartnoma
   va davr qarori kerak (`PaymentAllocation`).
2. **42 298 400 ni tasniflash** — 37 mln mijoz to'lovi, 5,3 mln qaytarilgan pul.
3. **Naqd ochilish qoldig'i 2 728 855** ni kiritish (bank qismi allaqachon bor).
4. **128,8 mln ni izlash** — §3 dagi ikki yo'nalish.
5. Shundan keyingina jurnal va ekran hisobini tenglashtirish
   (`ARCHITECTURE_DEBT.md` §D11) ma'noga ega bo'ladi.

**Saboq:** tashqaridan kelgan raqam, agar u bazadan tekshirilishi mumkin
bo'lsa, tekshirilmasdan jurnalga yozilmaydi. Bu safar tekshiruv mavjud edi —
`BankStatementImport.openingBalance` va `Boshlang'ich qoldiq` kassa
kirimlari — va u ishlatilmadi.
