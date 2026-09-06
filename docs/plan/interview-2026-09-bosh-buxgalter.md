# Intervyu — bosh buxgalter bilan (M2.3-2.4 yakunlash)

**Sana:** 2026-09-XX (rejalashtirilgan, 2-3 hafta ichida)
**Davomiyligi:** 1.5-2 soat
**Ishtirokchilar:** Siz (PM) + bosh buxgalter
**Oldindan yuborish:** `docs/plan/deadline-templates-v2.md` (250 qator, taxminiy shablonlar)
**Olib kelish:** `audit-active-services.ts --csv=...` dan chiqqan jadval (259 firma × 19 kalit)

---

## Maqsad

M2 ning domen qismini yakunlash. Bugun texnik qismi (kod, skriptlar, testlar) tugagan. Qolgani — **qaysi firma qaysi hisobotni topshiradi** va **normativ tariflar**. Buni faqat bosh buxgalter biladi.

3 ta savol bloki bor. Har birida javob yozib boriladi.

---

## 1-blok: Normativ tariflar (30-40 daqiqa)

Hozir `lib/engines/obligation/normativePresets.ts` da taxminiy qiymatlar bor. Har bir shablonga tasdiqlangan daqiqa kerak — Twin shu ustundan yuklamani hisoblaydi.

**Qoida:** 1 normativ kun = 8 soat = 480 daqiqa. 1 soat = 60 daqiqa. Qiymat 1-480 oralig'ida.

### 1.1 Oylik soliq deklaratsiyalari

| Shablon | Taxmin | Sizning javobingiz |
|---|---|---|
| QQS deklaratsiyasi | 30 | ? |
| Aylanma soliq deklaratsiyasi | 30 | ? |
| Ijtimoiy sug'orta deklaratsiyasi | 30 | ? |
| Foyda solig'i avans | 20 | ? |

**Savol:** Kichik firma (1-5 xodim) va katta firma (50+) uchun farq bormi? Agar ha — qaysi mezon? (`Company.complexity` bazada bor.)

### 1.2 Oylik to'lovlar

| Shablon | Taxmin | Sizning javobingiz |
|---|---|---|
| QQS to'lovi | 20 | ? |
| Ijtimoiy sug'orta to'lovi | 20 | ? |
| Foyda solig'i avans to'lovi | 20 | ? |

**Savol:** "To'lov" — bu kvitansiya to'ldirish (10 daqiqa) yoki hisoblash (30 daqiqa)? Qaysi birini o'lchaymiz?

### 1.3 Kvartal hisobotlar

| Shablon | Taxmin | Sizning javobingaz |
|---|---|---|
| QQS hisoboti | 90 | ? |
| Foyda hisoboti | 90 | ? |
| Statistika hisoboti | 90 | ? |
| Ijtimoiy sug'orta hisoboti | 90 | ? |
| Statistika buxgalter (yangi) | 60 | ? |

**Savol:** Kvartal hisobot — bu faqat shu chorak ma'lumotlari (90 daqiqa) yoki shu chorak + o'tgan choraklar tuzatishlari (120-150 daqiqa)?

### 1.4 Yillik hisobotlar

| Shablon | Taxmin | Sizning javobingiz |
|---|---|---|
| Foyda solig'i yillik | 240 | ? |
| Buxgalteriya hisoboti (moliyaviy) | 240 | ? |
| Statistika yillik | 240 | ? |
| Mehnat shartnomalari ro'yxati (yangi) | 60 | ? |

**Savol:** Yillik hisobot — qachon tayyorlanadi? Yil yakunlangandan keyinmi yoki yil oxirgi choragida?

### 1.5 Statistik shakllar

| Shablon | Taxmin | Sizning javobingiz |
|---|---|---|
| 1-TOMOR | 45 | ? |
| 2-SHAKL | 45 | ? |
| 4-SHAKL | 45 | ? |
| MEHNAT_HISOBOT | 45 | ? |

**Savol:** Bu shakllar har firma uchun alohida shablonmi yoki birlashtiriladimi?

### 1.6 Mehnat hujjatlari

| Shablon | Taxmin | Sizning javobingaz |
|---|---|---|
| Mehnat shartnomasi (yillik) | 60 | ? |
| Ta'til jadvali | 60 | ? |
| Kasaba uyushmasi | 60 | ? |

**Savol:** "Mehnat shartnomasi" — bu ro'yxat (yillik) yoki har shartnoma alohida (oylik)? Bazada `Contract` modeli bor, qaysi biri bog'lanadi?

---

## 2-blok: Shablon qamrovi (60-80 daqiqa)

Audit natijasi: **11 ta shablon hech qaysi firmaga tushmaydi** — applicability qoidasi bo'sh yoki mos kelmaydigan firmalar yo'q. Ularni qaysi firmaga bog'lash kerak?

Quyidagi jadvalni to'ldirasiz. Har bir shablon uchun: **criteriaType** va **criteriaValue** ko'rsatiladi.

### 2.1 Statistik shakllar

| Shablon | Qaysi firmaga? | criteriaType | criteriaValue |
|---|---|---|---|
| 1-TOMOR | ? | ? | ? |
| 2-SHAKL | ? | ? | ? |
| 4-SHAKL | ? | ? | ? |
| MEHNAT_HISOBOT | ? | ? | ? |

**Imkoniyatlar:**
- `criteriaType="tax_regime"` + `criteriaValue="usumtizim|qqs|patent|yagona"`
- `criteriaType="company_form"` + `criteriaValue="mchj|aj|dk|ytt"`
- `criteriaType="industry"` + `criteriaValue="savdo|qurilish|ishlab_chiqarish|qishloq_xojaligi"`
- `criteriaType="employee_count"` + `criteriaValue="<50|50-200|>200"`

**Qaysi biri to'g'ri?**

### 2.2 Soliqlar

| Shablon | Qaysi firmaga? | criteriaType | criteriaValue |
|---|---|---|---|
| MOL_MULK_SOLIQ | ? | ? | ? |
| YER_SOLIQ | ? | ? | ? |
| SUV_SOLIQ | ? | ? | ? |
| EKOLOGIYA | ? | ? | ? |
| DIVIDEND_DECL | ? | ? | ? |
| DIVIDEND_TOLOV | ? | ? | ? |

**Savol:** "MOL_MULK_SOLIQ" — barcha korxonalar to'laydimi yoki faqat mol-mulki borlar? Bazada `Company.hasRealEstate` kabi ustun bormi? Agar yo'q — yangi qo'shiladimi yoki `taxRegime` ga bog'lanadimi?

### 2.3 Yangi taklif qilingan 5 ta

Quyidagi shablonlarning 3 tasi allaqachon bazada draft, 2 tasi yangi:

| Shablon | Holat | Qaysi firmaga? |
|---|---|---|
| MOL_MULK_SOLIQ | draft, faollashtirilsin | ? |
| YER_SOLIQ | draft, faollashtirilsin | ? |
| SUV_SOLIQ | draft, faollashtirilsin | ? |
| STAT_BUXGALT | yangi, draft yaratilgan | ? |
| MEHNAT_SHARTNOMA_ROYXAT | yangi, draft yaratilgan | ? |

**Savol:** Boshqa soliq/hisobot bormi? 21 ta taxminiy shablondan tashqari.

---

## 3-blok: Yangi shablonlar va yakuniy (20-30 daqiqa)

### 3.1 Qo'shimcha shablonlar

`docs/plan/deadline-templates-v2.md` da 21 ta taxminiy shablon bor. Ulardan qaysilari kerak?

| # | Shablon | Kerakmi? | Periodik | Izoh |
|---|---|---|---|---|
| 1 | Ijtimoiy sug'orta deklaratsiyasi (BORMI?) | ? | oylik | ? |
| 2 | Foyda solig'i avans (BORMI?) | ? | oylik | ? |
| 3 | Statistika 1-TOMOR (BORMI?) | ? | yillik | ? |
| 4 | Statistika 2-SHAKL (BORMI?) | ? | kvartal | ? |
| 5 | Statistika 4-SHAKL (BORMI?) | ? | kvartal | ? |
| 6 | EKOLOGIYA (BORMI?) | ? | kvartal | ? |
| 7 | DIVIDEND (BORMI?) | ? | yillik | ? |
| 8 | Bo'lim hujjati: kadrlar | ? | ? | ? |
| 9 | Bo'lim hujjati: mehnat | ? | ? | ? |
| 10 | Soliq tekshiruvi hujjati | ? | ? | ? |
| 11-21 | ... | ? | ? | ? |

### 3.2 Mezonalar (applicability) sxemasi

Bugun `lib/engines/obligation/applicability.ts` da `criteriaType` erkin satr. Bu moslashuvchan, lekin **tartibsiz**.

**Savol:** Mezonalar ro'yxatini aniqlaymizmi?
- `tax_regime` (usumtizim, qqs, patent, yagona) — bor
- `company_form` (mchj, aj, dk, ytt) — bor
- `industry` (savdo, qurilish, ishlab chiqarish, qishloq xo'jaligi) — bor
- `employee_count` — bor
- `service_key` — yangi kerakmi? (qaysi firma qaysi xizmatni oladi)
- `region` (Toshkent, Samarqand, ... ) — kerakmi?

**Yangi mezon qo'shish** — bu schema o'zgarishi, intervyudan keyin.

### 3.3 Tanqidiy nuqta

**Hozirgi holat:** `scripts/audit-active-services.ts --csv=...` da 259 firma va 19 ta shablonning qaysi firmaga tushishi ko'rsatilgan (hozir bo'sh).

**Intervyudan keyin:** shu jadval to'ldiriladi va `scripts/migrate-firms-to-services.ts` (yangi yoki kengaytirilgan) yoziladi.

**Bu — eng muhim natija.** Intervyuning 70% qiymati shu jadvalda.

---

## 4-blok: Va'da 1 o'lchovi (5-10 daqiqa)

PRODUCT.md §2 da 5 ta va'da bor. Va'da 1: "Hech narsa unutilmaydi. Hech qaysi soliq, muddat yoki vazifa e'tibordan qolmaydi." O'lchovi: **"Muddat o'tgandan keyin aniqlangan majburiyat = 0"**.

**Bugungi holat:** Twin M3 da hisoblanadi — `firstOverdueAt` bor. KPI yashil bo'lishi uchun 0 bo'lishi kerak.

**Intervyu savoli:** Hozir 213 firmada majburiyat generatsiya qilinadimi? Yangi 5 ta shablon qo'shilganda 95% firmalar qamrab olinadimi? 11 ta "qaysi firmaga tushadi" aniqlangach — 100%mi?

**Maqsad:** 2026-yil yakunida 0 ta "aniqlanmagan muddat".

---

## Intervyudan keyin — siz qiladigan ishlar

1. **Normativ yangilash:** `lib/engines/obligation/normativePresets.ts` da tasdiqlangan qiymatlar.
2. **Jadval to'ldirish:** `audit-active-services --csv` natijasi + bosh buxgalter ko'rsatmasi.
3. **Yangi shablonlar:** `seed-deadline-templates-v2.ts` ga 21 tadan keraklilarini qo'shish.
4. **Mezonlar sxemasi:** `applicability.ts` da yangi mezonlar (agar qaror bo'lsa).
5. **Migratsiya:** `prisma migrate dev` EMAS, faqat `deploy`.

**Taxminiy vaqt:** 1-2 kunlik ish (intervyudan keyin).

---

## Eslatmalar

- Hech qanday kod yozilmaydi intervyu vaqtida — faqat yozib olish.
- Bosh buxgalter 1-2 soat ajratadi. Unga material oldindan yuboring.
- Savollarga aniq raqam (daqiqa) va mezon (criteria) so'rang.
- Agar bosh buxgalter "bilmayman" desa — keyingi uchrashuvga qoldiring.
- Hech qanday "taxminan 30 daqiqa" qabul qilinmaydi — aniq raqam kerak.

---

## Versiya

v1 — 2026-09-06, sizning auditingiz asosida.
Keyingi versiyalar intervyu natijasi bilan.
