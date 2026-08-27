# Soliq Hisobotlari va To'lov Kodlari Reestri

Quyida rasmdagi yozuvlar asosida tayyorlangan oylik, kvartal va yillik soliq hisobotlari hamda tegishli to'lov kodlari jadvali keltirilgan.

---

## 1. Oylik soliq hisobotlari va to'lov kodlari

| T/r | Hisobot va to'lov turi | Qisqartma / Tushuntirish | To'lov kodi |
| :---: | :--- | :--- | :---: |
| **1** | QQS hisoboti | Qo'shilgan qiymat solig'i | **1** |
| **2** | Daromad solig'i (JShODS) | Jismoniy shaxslardan olinadigan daromad solig'i | **46** |
| **3** | Aylanmadan olinadigan soliq | Aylanma soliq hisoboti va to'lovi | **100** |
| **4** | INPS (ShJBPH) | Shaxsiy jamg'arib boriladigan pensiya hisobi | **101** |
| **5** | Aksiz solig'i | Aksiz solig'i hisoboti va to'lovi | **43** |
| **6** | Nedra (Yer qa'ri solig'i) | Yer qa'ridan foydalanganlik uchun soliq | **50** |
| **7** | Norezident foyda solig'i | Norezidentlardan olinadigan foyda solig'i | **137** |
| **8** | Norezident QQS | Norezidentlar bo'yicha to'lanadigan QQS | **29** |
| **9** | Mol-mulk solig'i | Mol-mulk solig'i bo'yicha oylik avans to'lovi | **44** |
| **10** | Yer solig'i | Yer solig'i bo'yicha oylik avans to'lovi | **53** |
| **11** | Suv solig'i | Suv resurslaridan foydalanganlik uchun oylik avans to'lovi | **52** |
| **12** | Jismoniy shaxs ijara to'lovi | Jismoniy shaxsdan bino/joy ijarasi bo'yicha soliq | **186** |
| **13** | Dividend solig'i | Dividendlar bo'yicha soliq hisoboti va to'lovi | **138** |
| **14** | Foyda solig'i avans to'lovi | Foyda solig'i bo'yicha oylik bo'nak (avans) to'lovi | **32** |

---

## 2. Kvartal soliq hisobotlari

| T/r | Hisobot turi | Izoh | To'lov kodi |
| :---: | :--- | :--- | :---: |
| **1** | Foyda solig'i hisoboti | Har chorak (kvartal) yakuni bo'yicha hisobot | **32** |
| **2** | Foyda solig'i avans hisoboti | Keyingi chorak uchun bo'nak ma'lumotnomasi | — |

---

## 3. Yillik hisobotlar

| T/r | Hisobot nomi | Shakl / Turi |
| :---: | :--- | :--- |
| **1** | Buxgalteriya balansi | 1-son shakl |
| **2** | Moliyaviy natijalar to'g'risida hisobot | 2-son shakl |
| **3** | Mol-mulk solig'i yillik hisoboti | Yillik yakuniy hisob-kitob |
| **4** | Yer solig'i yillik hisoboti | Yillik yakuniy hisob-kitob |
| **5** | Suv solig'i yillik hisoboti | Yillik yakuniy hisob-kitob |

---

## 4. Reestr tizimda qanday qo'llangan

### 4.1. Guruhlar = davriylik

| Guruh | Ichida |
| :--- | :--- |
| **Oylik ish** | Didox, Xatlar, Avtokameral, My Mehnat, 1C, Pul oqimlari, Chiq. soliqlar, His. oylik, Deb/Kred, Foyda/Zarar, Tovar ost. — ichki reglament, soliq emas |
| **Oylik soliq** | Reestr 1-bo'limining 14 qatori — har biri **hisobot + to'lov** juftligi |
| **Kvartal soliq** | Foyda solig'i hisoboti + to'lovi, Foyda avans (bo'nak) ma'lumotnomasi |
| **Yillik hisobot** | Bux. balansi (1-shakl), Mol. natija (2-shakl), Mol-mulk / Yer / Suv yillik yakuniy hisob-kitobi |
| Statistika / IT Park / Komunalka / Maxsus | o'zgarishsiz |

### 4.2. Byudjet kodi bor har bir soliq — hisobot + to'lov

Reestrda kodi bor qator = pul harakati bor degani, shuning uchun har biri
matritsada IKKI katak: hisobot (yashil) va to'lov (amber, `#kod`).
To'lov yarmi qo'shilgan ustunlar: Aksiz, Nedro, Nor. foyda, Nor. NDS,
Jism. ijara, Bo'nak, Dividend.

**Mol-mulk / yer / suv — istisno: FAQAT to'lov.** Oyiga ular bo'yicha hech
qanday hisobot topshirilmaydi, faqat avans to'lanadi. Shuning uchun matritsada
bitta katak va uning yorlig'i so'z emas, kod: `#44`, `#53`, `#52` (amber
rangda, to'lov degani). Hisoboti yillik: yil boshida **ma'lumotnoma**, yil
oxirida **yakuniy hisob-kitob** — ikkalasi "Yillik hisobot" guruhida. Ilgari ular yakka katak
edi — hisobot topshirilgani ko'rinardi, pul to'langani esa hech qayerda
kuzatilmasdi.

Yorliq matn emas, faqat **kod**: matritsa sarlavhasida `#1`, `#46`, `#100`;
firma sozlamalarida ham shunday, to'liq nomi tooltip'da (`serviceFullLabel`).
Manba bitta — `TAX_PAYMENT_CODES` (`lib/reportColumns.ts`).

### 4.3. Ustun ↔ kod ↔ guruh

| Ustun kaliti | Nom | Guruh | Kod |
| :--- | :--- | :--- | :---: |
| `qqs` | QQS Hisobot / to'lov | Oylik soliq | 1 |
| `daromad_soliq` | DS Hisobot / to'lov | Oylik soliq | 46 |
| `aylanma` | Aylanma Hisobot / to'lov | Oylik soliq | 100 |
| `inps` | INPS Hisobot / to'lov | Oylik soliq | 101 |
| `ijtimoiy_soliq` | Ijtimoiy soliq Hisobot / to'lov | Oylik soliq | 36 |
| `aksiz_soligi` | Aksiz Hisobot / to'lov | Oylik soliq | 43 |
| `nedro_soligi` | Nedro Hisobot / to'lov | Oylik soliq | 50 |
| `norezident_foyda` | Nor. Foyda Hisobot / to'lov | Oylik soliq | 137 |
| `norezident_nds` | Nor. NDS Hisobot / to'lov | Oylik soliq | 29 |
| `mol_mulk_soligi` | `#44` — FAQAT to'lov | Oylik soliq | 44 |
| `yer_soligi` | `#53` — FAQAT to'lov | Oylik soliq | 53 |
| `suv_soligi` | `#52` — FAQAT to'lov | Oylik soliq | 52 |
| `jismoniy_ijara` | Jism. ijara / to'lov | Oylik soliq | 186 |
| `dividend_soligi` | Dividend Hisobot / to'lov | Oylik soliq | 138 |
| `bonak` | Bo'nak (foyda avansi) / to'lov | Oylik soliq | 32 |
| `foyda_soliq` | FS Hisobot / to'lov | Kvartal soliq | 32 |
| `foyda_avans_hisobot` | Foyda avans hisoboti | Kvartal soliq | — |
| `buxgalteriya_balansi` | Bux. balansi (1-shakl) | Yillik hisobot | — |
| `moliyaviy_natija` | Mol. natija (2-shakl) | Yillik hisobot | — |
| `mol_mulk_malumotnoma` | Mol-mulk ma'lumotnomasi (yil boshi) | Yillik hisobot | — |
| `suv_malumotnoma` | Suv solig'i ma'lumotnomasi (yil boshi) | Yillik hisobot | — |
| `mol_mulk_yillik` | Mol-mulk yakuniy hisob-kitob (yil oxiri) | Yillik hisobot | — |
| `yer_yillik` | Yer solig'i (yillik) | Yillik hisobot | — |
| `suv_yillik` | Suv solig'i (yillik) | Yillik hisobot | — |

### 4.4. Muddat shablonlari

O'zgartirildi: `AYLANMA_SOLIQ` / `AYLANMA_TOLOV` — choraklikdan **oylikka**
(15-kun); `FOYDA_YILLIK` / `FOYDA_TOLOV` — yillikdan **choraklikka** (20-kun);
yangi `FOYDA_AVANS` (choraklik, 20-kun), `DIVIDEND_DECL` / `DIVIDEND_TOLOV`
(oylik, 20-kun).

**Hali seed qilinmagan** (xarita tayyor, muddat kuni tasdiqlanmagan):
`AKSIZ_TOLOV`, `NEDRO_TOLOV`, `NOREZ_FOYDA_TOLOV`, `NOREZ_NDS_TOLOV`,
`MOL_MULK_TOLOV`, `YER_TOLOV`, `SUV_TOLOV`, `JISM_IJARA_TOLOV`, `BONAK_TOLOV`,
`MOL_MULK_YILLIK`, `YER_YILLIK`, `SUV_YILLIK` — hamda ilgaridan beri
seedsiz turgan `YER_SOLIQ`, `SUV_SOLIQ`, `MOL_MULK_SOLIQ`, `BONAK`.
Matritsada kataklar ishlaydi; "Ishlar" ro'yxatiga chiqishi uchun har biriga
muddat kuni kerak.
