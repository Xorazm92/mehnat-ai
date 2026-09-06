# `matrixKey → service_key` mosligi — tasdiqlash uchun audit

> **Holat:** AUDIT. **Hech qanday o'zgarish kiritilmagan.**
> Faqat `SELECT` so'rovlari yurgizildi.
>
> **Manba:** prod `inbola` (16.192.135.23), 2026-09-06, SSH tunnel orqali o'qish.
> **Skript:** `scripts/audit-matrixkey-mapping.ts` (unda `--apply` YO'Q).
>
> **Kimga:** bosh buxgalter. Har bir moslikni tasdiqlash yoki rad etish kerak.

---

## 0. Nima hal qilinmoqda

ASROda ikkita ro'yxat bor va ular bir-biriga ulanmagan:

- **Firma tomonida** — `Company.activeServices`: shu firma qaysi hisobotlarni
  topshirishi (matritsa ustunlari). **239 / 270 firmada to'ldirilgan.**
- **Shablon tomonida** — `DeadlineTemplate.matrixKey`: shablon qaysi matritsa
  ustuniga tegishli ekani.

Ikkalasi bir xil lug'atdan (`tovar_ostatka`, `xatlar`, `inps`…), lekin ular
orasida **qoida yozilmagan**. Qoidasiz shablon *universal* bo'lib qoladi va
kaliti yo'q firmalarga ham majburiyat yaratadi.

**Taklif:** har shablonga bitta qator qo'shish —
`TemplateApplicability(criteriaType='service_key', criteriaValue = matrixKey)`.

---

## 1. Umumiy ta'sir

| Ko'rsatkich | Qiymat |
|---|---|
| Tekshirilgan shablon (matrixKey bor, qoidasi yo'q) | **24** |
| Bazadagi jami majburiyat | 14 159 |
| **Tegiladigan majburiyat** | **1 868** (13,2%) |
| — shundan **ochiq** (bekor bo'ladi) | **1 704** |
| — shundan yopilgan/allaqachon bekor (tegilmaydi) | 164 |
| **Ta'sirlanadigan firma** | **226** |
| Hisobdan chiqarilgan firma (kaliti umuman yo'q) | **31** |

---

## 2. Moslik jadvali — TASDIQLASH KERAK

### 2.1 Ta'siri BOR (14 ta) — bugun majburiyat yaratayotgan shablonlar

| # | Shablon | matrixKey | Davr | Kaliti bor | Kaliti yo'q | Bekor bo'ladi | ✔ / ✘ |
|---|---|---|---|---|---|---|---|
| 1 | `MATERIALS` — Material hisoboti | `tovar_ostatka` | oylik | 54 | 185 | **554** | |
| 2 | `PNL_REPORT` — Foyda va zarar | `foyda_va_zarar` | oylik | 172 | 67 | **201** | |
| 3 | `CASHFLOW` — Pul oqimlari | `pul_oqimlari` | oylik | 177 | 62 | **185** | |
| 4 | `AR_AP` — Debitor-kreditor | `debitor_kreditor` | oylik | 183 | 56 | **168** | |
| 5 | `FOYDA_YILLIK` — Foyda solig'i hisoboti | `foyda_soliq` | choraklik | 170 | 69 | **136** | |
| 6 | `ONEC_BASE` — 1C baza tayyor | `one_c` | oylik | 196 | 43 | **129** | |
| 7 | `TAX_SCHEDULE` — Soliq sana+summa | `chiqadigan_soliqlar` | oylik | 207 | 32 | **96** | |
| 8 | `PAYROLL_CALC` — Raschot zarplata | `hisoblangan_oylik` | oylik | 201 | 38 | **76** | |
| 9 | `LETTERS` — Xatlar hisobi | `xatlar` | oylik | 217 | 22 | **66** | |
| 10 | `INPS_IJTIMOIY` — INPS va ijtimoiy soliq | `inps` | oylik | 219 | 20 | **45** | |
| 11 | `DAROMAD_AGENT` — Daromad solig'i | `daromad_soliq` | oylik | 229 | 10 | **24** | |
| 12 | `QQS_DECL` — QQS deklaratsiyasi | `qqs` | oylik | 171 | 68 | **11** | ⚠️ |
| 13 | `MOLIYAVIY_YILLIK` — Moliyaviy hisobot | `moliyaviy_natija` | yillik | 230 | 9 | **9** | |
| 14 | `AYLANMA_SOLIQ` — Aylanma soliq | `aylanma` | oylik | 66 | 173 | **4** | ⚠️ |

> "Bekor bo'ladi" — ochiq (`planned / in_progress / ready / sent`) majburiyatlar.
> Yopilganlariga tegilmaydi.

### 2.2 Ta'siri YO'Q (10 ta) — hali `draft`, majburiyat yaratmaydi

Bu shablonlar hali faollashmagan, shuning uchun qoida qo'shish **bugun hech
narsani bekor qilmaydi**. Ular faollashtirilgunga qadar qoidani yozib qo'yish
eng xavfsiz payt.

| Shablon | matrixKey | Kaliti bor firma |
|---|---|---|
| `BUX_BALANS` | `buxgalteriya_balansi` | 230 |
| `MY_MEHNAT` | `my_mehnat` | 210 |
| `AVTOKAMERAL` | `avtokameral` | 209 |
| `DIDOX_FLOW` | `didox` | 202 |
| `YER_SOLIQ` | `yer_soligi` | 37 |
| `MOL_MULK_SOLIQ` | `mol_mulk_soligi` | 31 |
| `SUV_SOLIQ` | `suv_soligi` | 29 |
| `BONAK` | `bonak` | 27 |
| `EKOLOGIYA` | `ekologiya` | 20 |
| `ITPARK_OYLIK` | `itpark_oylik` | 14 |

---

## 3. ⚠️ Ikkita shablonda qo'shimcha shart bor

Mezon turlari **VA** (AND) bilan birlashadi — ya'ni ikkala shart ham bajarilishi
kerak. Bu ikkisida allaqachon soliq rejimi sharti bor:

| Shablon | Hozirgi shart | Qo'shiladigan shart | Hozir | Keyin |
|---|---|---|---|---|
| `QQS_DECL` | `tax_regime = vat` → 175 firma | `service_key = qqs` → 171 firma | 175 | **162** |
| `AYLANMA_SOLIQ` | `tax_regime = turnover` → 80 firma | `service_key = aylanma` → 66 firma | 80 | **58** |

Ya'ni QQS 13 ta, aylanma soliq 22 ta firmadan olib tashlanadi. **Savol:**
matritsa kaliti soliq rejimidan ustunmi, yoki rejim yetarlimi?

> Yo'l-yo'lakay: prodda 6 xil soliq rejimi bor (`vat` 175, `turnover` 80,
> `simplified_vat` 8, `yatt_turnover` 5, `yatt_vat` 1, `yatt_fixed` 1).
> `QQS_DECL` faqat `vat` ni oladi — `simplified_vat` va `yatt_vat`
> firmalari QQS majburiyatini umuman olmayapti. Bu alohida savol.

---

## 4. Firma misollari — `MATERIALS` (eng katta ta'sir)

**Kaliti BOR — o'zgarmaydi:**

| INN | Firma |
|---|---|
| 308023653 | RONICS MCHJ |
| 302242876 | GELATO ICE CREAM |
| 300524035 | AGRI-PARTS OSIYO MCHJ |

**Kaliti YO'Q, lekin boshqa kalitlari bor — ishonchli "topshirmaydi":**

| INN | Firma | Kalitlari |
|---|---|---|
| 309069570 | UMID HOSPITAL | 1 ta |
| 307053253 | TEN BRANCHES OOO | 2 ta |
| 313207381 | CONCORDIS MCHJ | 20 ta |

**Hozir majburiyat yaratilgan — bekor bo'ladi:**

| INN | Firma | Davr | Holat | Muddat |
|---|---|---|---|---|
| 204105398 | "AZIM DARYO" MCHJ | 2026-M09 | planned | 2026-10-15 |
| 305883924 | "MASHXUR TAOM BIZNES" | 2026-M09 | planned | 2026-10-15 |
| 303811412 | VIKTORIYA TIBBIY KO'RIK MCHJ | 2026-M09 | planned | 2026-10-15 |

> Qolgan 23 ta moslik uchun misollar:
> `npx tsx scripts/audit-matrixkey-mapping.ts --examples=3`

---

## 5. Tegilmaydigan 31 firma

Bu firmalarda `activeServices` **umuman bo'sh** — ya'ni ular hisobot
topshirmasligi emas, biz **bilmasligimiz**. Ular hisobdan butunlay
chiqarilgan va hech qanday qoida ularga ta'sir qilmaydi.

| INN | Firma | | INN | Firma |
|---|---|---|---|---|
| 312233724 | X PRO TEAM | | 52608006700020 | HOMEBAZAAR YATT |
| 312545350 | INFINITY GROUP OF INDUSTRY | | 309580515 | TOSHMI DIAGNOSTIKA MCHJ |
| 311636451 | SUHROBBEK PARIZODA MCHJ | | 311910064 | Vazifa Venchur |
| 311757809 | SAHARA UTD | | 310190353 | HALOL OSHPAZ |
| 42706701810028 | YULDUZ ALIBAYEVA YATT | | 310832408 | HALOL OSHPAZ JAMOASI |
| 313004216 | QUALITY MARKET | | 311985232 | Dilsevar Hojakbar MCHJ |
| 306033555 | MONTAJ TEPLO ENERGO MCHJ | | 309849898 | OOO HI-TECH ORIENT MED-BUSINESS |
| NO-STIR-005 | Raximjonova Dilnoza YATT | | 307605198 | MCHJ Home Spot - Qarshi |
| 310327837 | NURDEVAI | | 308147618 | "Home Spot Toshkent" MChJ |
| NO-STIR-007 | ROYAL BEAUTY | | 312919715 | MVI DIGITAL MCHJ |
| 301844182 | Dashtobod aloqa-service MCHJ | | 310398970 | SIFATLI VA TEZKOR ALOQA MCHJ |
| 312391054 | GRAYD GROUP MCHJ | | 305023458 | НТМ MALISH GERKULES |
| 312305364 | SALOHIDDIN SFX MCHJ | | 302595327 | OHANGARON RUSTAM FAYZ MCHJ |
| NO-STIR-006 | YATT (nomi aniqlanmagan) | | 123456789 | TEST BRO |
| | | | 312977755 | ISMAN MCHJ |
| | | | 313187528 | "DIAFREE" MCHJ |
| | | | 306951197 | LIDER ELITE XK |

> `123456789 TEST BRO` — sinov yozuvi, alohida tozalash kerak.

---

## 6. Tasdiqlash uchun savollar

1. **§2.1 dagi 14 ta moslikning qay biri to'g'ri?** Har qatorga ✔ yoki ✘.
2. **`MATERIALS`** — 185 firmada `tovar_ostatka` kaliti yo'q, lekin ularning
   hammasiga majburiyat yaratilgan (554 ta ochiq). Kalit ro'yxati to'g'rimi,
   yoki material hisobi haqiqatan hammaga tegishlimi?
3. **§3 — QQS va aylanma soliq**: matritsa kaliti soliq rejimidan ustunmi?
4. **§5 dagi 31 firma** bilan nima qilamiz — kalitlarini to'ldiramizmi?
5. **§2.2 dagi 10 ta draft** — ular faollashtirilishidan OLDIN qoida
   yozib qo'yilsinmi? (Bugun bepul, keyin 1 000+ majburiyatga tegadi.)

---

## 7. Tasdiqdan keyin (hali bajarilmaydi)

Tasdiqlangan mosliklar uchun migratsiya skripti yoziladi va u:

1. standart rejimda **dry-run** bo'ladi;
2. `--apply` dan **oldin** yakuniy sanoqni qayta chiqaradi va tasdiq so'raydi;
3. barcha yozuvni **bitta tranzaksiya** ichida bajaradi;
4. `--rollback` uchun qo'shilgan `TemplateApplicability` qatorlarining
   id'larini faylga yozadi (o'chirish — bitta `deleteMany`);
5. faqat tasdiqlangan mosliklarni yozadi, hammasini emas.

**Zaxira majburiy:** `bash scripts/backup.sh daily` — qoida qo'shilishi bilan
generator 1 704 ta ochiq majburiyatni bekor qiladi.
