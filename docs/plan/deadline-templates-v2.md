# Muddat shablonlari v2 — bosh buxgalter bilan intervyu uchun qoralama

> **Holat:** QORALAMA. AI yordamida tayyorlangan, **tasdiqlanmagan**.
> Bosh buxgalter tasdiqlaguncha hech bir shablon `active` ga o'tkazilmaydi.
>
> **O'lchangan:** 2026-09-06, **prod** `inbola` (16.192.135.23) — faqat o'qish.
> Lokal nusxa tozalangan; qamrov tahlili unga qarab o'lchanmaydi.
> **Maqsad:** 2 hafta ichidagi uchrashuvga tayyor material.

---

## 0. Bir jumlada

Kutilgani "21 ta shablon yetishmayapti" edi; o'lchov boshqasini ko'rsatdi —
**shablonlar soni bugungi to'siq emas.** Prodda 41 ta shablon (30 faol,
11 tasi tasdiq kutmoqda) va 14 159 ta majburiyat bor.

Uchta haqiqiy to'siq boshqa joyda: **normativ mehnat hech bir shablonda
yozilmagan**, **kalendarda bayramlar yo'q**, va eng kattasi —
**majburiyatlarning 19% i firma o'zi topshirmaydigan hisobot uchun
yaratilgan** (§1.4).

Shuning uchun intervyu tartibi teskari qilindi: avval **to'siqlar**, keyin
**yangi shablonlar**.

---

## 1. Bugungi haqiqat — o'lchangan raqamlar

| O'lchov | Qiymat | Manba |
|---|---|---|
| Faol shablon (`lifecycle='active'`) | **30** | `DeadlineTemplate` |
| Tasdiq kutayotgan (`draft`) | **11** | `DeadlineTemplate` |
| Jami shablon | **41** | `DeadlineTemplate` |
| `normativeMinutes` to'ldirilgan | **0 / 41** | `DeadlineTemplate` |
| `service_key` qoidasi bor shablon | **9 / 41** | `TemplateApplicability` |
| `matrixKey` bor, lekin qoidasi YO'Q | **14** | `DeadlineTemplate` |
| Mavjud majburiyat | **14 159** / 277 firma | `Obligation` |
| — firma kaliti "yo'q" deydigani | **2 737 (19%)** | `Obligation ⋈ Company` |
| `BusinessCalendarDay` qatorlari | **0** | `BusinessCalendarDay` |
| Faol mijoz firma | **270** | `Company` |
| `activeServices` to'ldirilgan | **239 / 270 (88%)** | `Company` |
| `requiredReports` to'ldirilgan | **0 / 270** | `Company` |

**Uchta to'siq, uchalasi ham shablon sonidan muhimroq:**

1. **Normativ mehnat yo'q.** `normativeMinutes` 40 shablonning hammasida
   `NULL`. Bu ustunni Digital Twin yuklama hisobi o'qiydi
   (`computeStaffCapacity`) — bo'sh bo'lgani uchun yuklama "taxminiy"
   bayrog'i bilan chiqadi va kokpitdagi "kim ko'milgan?" bloki taxminga
   tayanadi.
2. **Kalendarda BAYRAMLAR yo'q** (hafta oxiri esa ishlaydi).
   `BusinessCalendarDay` bo'sh, lekin `makeWorkdayPredicate` aniq yozuv
   topmasa standart qoidaga tushadi: shanba va yakshanba ish kuni emas.
   Ya'ni **dam olish kunidan surish allaqachon ishlaydi**. Yetishmayotgani
   faqat bayramlar — 1-yanvar, Navro'z, hayitlar: ularni standart qoida
   bila olmaydi va bugun muddat o'sha kunlarda qolib ketadi.
3. **14 ta shablon UNIVERSAL bo'lib ishlayapti** — matritsa kaliti kimga
   tegishli ekanini allaqachon aytsa ham. Bu eng katta to'siq; §1.4 da
   alohida yozilgan.

### 1.4 Majburiyatlarning 19% i noto'g'ri firmada

⚠️ **Bu bo'lim dastlab XATO yozilgan edi.** Birinchi tahlil lokal bazaga
qarab "`activeServices` 259 firmadan bittasida to'ldirilgan, ya'ni qaysi
firma qaysi hisobotni topshirishi bazada yo'q" degan xulosaga kelgan edi.
Prodda o'lchanganda holat teskari chiqdi:

| | Lokal (tozalangan) | **Prod** |
|---|---|---|
| `activeServices` to'ldirilgan | 1 / 259 | **239 / 270** |
| `MonthlyReport` qatorlari | 8 | **323** (277 firma) |
| Majburiyatlar | 7 221 | **14 159** |

Ya'ni **ma'lumot bor**. Bo'shliq teskari tomonda: firmada kalit bor, lekin
**shablonda o'sha kalitga ko'rsatuvchi `TemplateApplicability` qatori yo'q**.
Qoidasi yo'q shablon UNIVERSAL bo'lib qoladi (`templateApplies` bo'sh
mezonda `true`) va kaliti yo'q firmalarga ham tushaveradi.

Ko'prik allaqachon mavjud: `DeadlineTemplate.matrixKey` matritsa ustunini
nomlaydi, `Company.activeServices` esa xuddi shu lug'atdan. 14 ta shablonda
`matrixKey` bor, lekin `service_key` qoidasi yo'q.

**Narxi (prodda o'lchangan):**

| | Majburiyat | Firma |
|---|---|---|
| Firma kaliti "bu hisobot menda yo'q" deydi | **2 737** | — |
| — ishonchli (firmada boshqa kalitlar bor) | **2 096** | 239 |
| — noaniq (firmada umuman kalit yo'q) | 641 | 19 |
| Ishonchlilarning `planned` (hali ochiq) qismi | **1 897** | — |

Eng og'irlari: `MATERIALS` (642 ortiqcha), `PNL_REPORT` (285),
`CASHFLOW` (270), `AR_AP` (252), `ONEC_BASE` (213), `FOYDA_YILLIK` (190).
Har biri kechikadi, eskalatsiya qiladi va buxgalterning KPI siga tushadi.

**Yechim firmaga emas, SHABLONGA yoziladi** — 14 ta
`TemplateApplicability(service_key = matrixKey)` qatori. 259 firmani
tahrirlashdan kichikroq va qaytarib olinadigan.

⚠️ Lekin bu **prod ma'lumotini o'zgartiradi**: qoida qo'shilishi bilan
generator kaliti yo'q firmalarning ochiq majburiyatlarini bekor qiladi
(`skippedNotApplicable` → `cancelStaleRuleObligations`). 1 897 ta yozuvga
tegadi — avval bosh buxgalter tasdig'i va zaxira.

> Intervyuning eng qimmatli natijasi — **yangi shablonlar emas**, shu
> to'rttasining javobi.

---

## 2. "21 ta yetishmayapti" — qayta hisoblandi

Topshiriqdagi ro'yxat 90xxx ko'rinishidagi kodlar bilan berilgan
(`90101 ФОЙДА`, `90105 ҚҚС`…). **Bu kodlar ASROda yo'q** — bazada semantik
kodlar ishlatiladi (`QQS_DECL`, `FOYDA_AVANS`). 90xxx — boshqa reestrning
(ehtimol soliq shakllari ro'yxatining) raqamlari; ular ASRO kodlariga
avtomatik moslanmaydi. Quyida qo'lda solishtirildi.

| Topshiriqdagi | ASROdagi holat | Xulosa |
|---|---|---|
| 90101 ФОЙДА (oylik) | `FOYDA_AVANS`, `FOYDA_TOLOV`, `FOYDA_YILLIK` — **choraklik** | ⚠️ davriylik ziddiyati |
| 90105 ҚҚС | `QQS_DECL` + `QQS_TOLOV` (oylik, 20-kun) | ✅ bor |
| 90106 АЙЛАНМА | `AYLANMA_SOLIQ` + `AYLANMA_TOLOV` (oylik, 15-kun) | ✅ bor |
| 90107 ИЖТИМОИЙ | `INPS_IJTIMOIY` + `INPS_TOLOV` (oylik, 15-kun) | ✅ bor |
| 90108 МУЛК (oylik) | `MOL_MULK_SOLIQ` — **draft**, **yillik** | ⚠️ draft + davriylik ziddiyati |
| 90201 ФОЙДА ҲИСОБОТИ | `FOYDA_YILLIK` (choraklik) | ✅ bor |
| 90202 ЕР СОЛИҒИ (chorak) | `YER_SOLIQ` — **draft**, **yillik** | ⚠️ draft + davriylik ziddiyati |
| 90203 СУВ СОЛИҒИ (chorak) | `SUV_SOLIQ` — **draft**, **yillik** | ⚠️ draft + davriylik ziddiyati |
| 90204 ЙИЛЛИК ҲИСОБОТ (chorak) | nomi "yillik", davriyligi "chorak" — ziddiyatli | ❓ aniqlashtirish |
| 90301 ФОЙДА YILLIK | `FOYDA_YILLIK` (choraklik) | ⚠️ nomi "yillik", o'zi choraklik |
| 90302 БУХГАЛТЕРЛИК ҲИСОБОТИ | `BUX_BALANS` — **draft**, choraklik; `MOLIYAVIY_YILLIK` — faol, yillik | ⚠️ ikkitasi bir-birini qoplaydimi? |
| 90303 СТАТИСТИКА ҲИСОБОТИ | 7 ta aniq stat shakli bor (`STAT_*`) | ❓ qaysi biri nazarda tutilgan? |
| 90401 СТАТИСТИКА 1-ТОМОР | yo'q | 🆕 nomzod (nomi aniqlanmagan) |
| 90402 СОЛИҚ ҲИСОБОТИ | juda umumiy | ❓ aniqlashtirish |
| 90403 2-СОНЛИ ШАКЛ | yo'q | 🆕 nomzod |
| 90404 4-СОНЛИ ШАКЛ | `STAT_4_MOLIYA`, `STAT_4_QX`, `STAT_4_FX` bor | ⚠️ qaysi biri? |
| 90405 МЕҲНАТ ҲИСОБОТИ | yo'q | 🆕 nomzod |
| 90501 МЕҲНАТ ШАРТНОМАСИ (bir martalik) | yo'q | ❌ **ifodalab bo'lmaydi** — pastga qarang |
| 90502 ИШ ҲАҚИ ҲИСОБОТИ | `PAYROLL_CALC`, `PAYROLL_POSTED` (oylik) | ✅ bor |
| 90503 ТАЪТИЛ ЖАДВАЛИ | yo'q | 🆕 nomzod (yillik) |
| 90504 КАСАБА УЮШМАСИ | yo'q | 🆕 nomzod (yillik) |

**Natija:** 21 emas — **haqiqiy bo'shliq 5-6 ta**, ustiga **10 ta draft**
tasdiq kutmoqda va **7 ta band aniqlashtirishni** talab qiladi.

> ❌ **"Bir martalik" shablon bugun ifodalab bo'lmaydi.** `Periodicity`
> enumida faqat `monthly | quarterly | annual` bor. Mehnat shartnomasi kabi
> bir martalik ish — bu takrorlanuvchi MUDDAT emas, u `Task` yoki
> `CompanyService` bandi bo'lishi kerak. Buni shablonga aylantirish
> generatorni har oy soxta majburiyat yaratishga majbur qilardi.

---

## 3. Tasdiq kutayotgan 10 ta draft

Bular **allaqachon yozilgan** — faqat bosh buxgalterning tasdig'i yetishmaydi.
Uchrashuvda eng tez natija shu jadvaldan chiqadi.

| Kod | Nomi | Davriylik | Muddat | Mezon (`service_key`) |
|---|---|---|---|---|
| `AVTOKAMERAL` | Avtokameral nazorat | oylik | 15-kun | `avtokameral` |
| `BONAK` | Bo'nak (avans) | oylik | 10-kun | `bonak` |
| `DIDOX_FLOW` | Didox (e-aylanma) | oylik | 10-kun | `didox` |
| `EKOLOGIYA` | Ekologiya hisoboti | oylik | 15-kun | `ekologiya` |
| `MY_MEHNAT` | my.mehnat.uz nazorati | oylik | 10-kun | `my_mehnat` |
| `BUX_BALANS` | Buxgalteriya balansi | choraklik | 30-kun | `buxgalteriya_balansi` |
| `ITPARK_OYLIK` | IT Park hisoboti | choraklik | 10-kun | `itpark_chorak` |
| `MOL_MULK_SOLIQ` | Mol-mulk solig'i | yillik | 25-kun | `mol_mulk_soligi` |
| `SUV_SOLIQ` | Suv solig'i | yillik | 25-kun | `suv_soligi` |
| `YER_SOLIQ` | Yer solig'i | yillik | 25-kun | `yer_soligi` |

⚠️ `MOL_MULK_SOLIQ` / `SUV_SOLIQ` / `YER_SOLIQ` bazada **yillik**, topshiriqda
esa oylik/choraklik deb yozilgan. Ikkisidan biri xato — bu intervyuning
birinchi savoli.

---

## 4. Yangi shablon nomzodlari (qoralama qiymatlar)

Quyidagi qiymatlar **taxmin** — har biri tasdiqlanishi kerak.
`normativeMinutes` ataylab bo'sh qoldirilgan: uni faqat bosh buxgalter
aytadi (§5.1).

| Taklif kod | Nomi | Davriylik | Anchor | dueDay | dueMonth | Mezon | Normativ |
|---|---|---|---|---|---|---|---|
| `STAT_1_TOVAR` | 1-tovar (statistika) | yillik | `fixed_day_of_month` | ? | ? | `service_key=stat_1_tovar` | ? |
| `STAT_2_SHAKL` | 2-sonli shakl | yillik | `fixed_day_of_month` | ? | ? | `service_key=stat_2_shakl` | ? |
| `STAT_1_MEHNAT` | Mehnat hisoboti (1-mehnat) | yillik | `fixed_day_of_month` | ? | ? | `service_key=stat_1_mehnat` | ? |
| `TATIL_JADVAL` | Ta'til jadvali | yillik | `fixed_day_of_month` | ? | 12 | `has_employees=true` | ? |
| `KASABA_UYUSHMA` | Kasaba uyushmasi hisoboti | yillik | `fixed_day_of_month` | ? | ? | `has_employees=true` | ? |

**Kod uslubi:** ASROda kod — barqaror semantik kalit (`QQS_DECL`), raqam emas.
Raqamli 90xxx kodlar kerak bo'lsa, ular alohida ustunga (`matrixKey` yoki yangi
`externalCode`) yozilishi kerak — `code` ni raqamga aylantirish mavjud
majburiyatlarning `templateVersion` snapshotini uzib qo'yadi.

**Kod yozish shart emas:** `obligationType` — erkin `String`, ya'ni yangi soliq
turi migratsiyasiz qo'shiladi. Faqat `DeadlineTemplate` qatori va
`TemplateApplicability` mezoni kerak.

---

## 5. Intervyu savollari

### 5.1 To'siqlar — bular birinchi (javobsiz qolsa yangi shablon foydasiz)

1. **Normativ mehnat.** "Har bir hisobot uchun bitta firmada o'rtacha necha
   daqiqa ketadi?" — 40 shablonning hammasi uchun kerak. Aniq raqam
   bo'lmasa, oraliq ham bo'ladi (masalan "20-40 daqiqa"), lekin `NULL`
   qolmasin: Twin yuklamani shundan hisoblaydi.
2. **Bayram kunlari.** "2026-2027 bayram sanalari va ko'chirilgan dam olish
   kunlari qaysilar?" Hafta oxiri allaqachon ishlaydi; kerak bo'lgani —
   bayramlar. Yettita qat'iy sana kodda bor
   (`lib/domains/accounting/uzHolidays.ts`), lekin **Ramazon va Qurbon
   hayit sanalari TAXMINIY** — ular har yili hukumat qarori bilan e'lon
   qilinadi. Tasdiqlash kerak. Ko'chirilgan ish shanbalari ham shu savolda.
3. **Ortiqcha majburiyatlar (§1.4).** Prodda 2 096 ta majburiyat firmaning
   O'Z matritsa kaliti "yo'q" deb turgan holatda yaratilgan (239 firma,
   1 897 tasi hali ochiq). Shablonga qoida qo'shilsa ular bekor bo'ladi.
   Savol: matritsa kalitlari ishonchlimi? Kaliti umuman yo'q 19 ta firma
   bilan nima qilamiz?

### 5.2 Ziddiyatlar — qaysi biri to'g'ri?

4. **Yer / suv / mol-mulk solig'i** — yillikmi (bazada shunday) yoki
   choraklik/oylikmi (topshiriqda shunday)?
5. **Foyda solig'i** — choraklikmi (bazada `FOYDA_AVANS` + `FOYDA_TOLOV` +
   `FOYDA_YILLIK`) yoki oylik bo'nak ham bormi?
6. **Buxgalteriya balansi va Moliyaviy hisobot** — `BUX_BALANS` (choraklik,
   draft) va `MOLIYAVIY_YILLIK` (yillik, faol) ikki xil hujjatmi yoki bir
   narsaning ikki nusxasimi?
7. **4-sonli shakl** — `STAT_4_MOLIYA`, `STAT_4_QX`, `STAT_4_FX` dan qaysi
   biri nazarda tutilgan? Uchalasi ham keraklimi?

### 5.3 Bo'shliqlar

8. **Mening ro'yxatim to'g'rimi?** §4 dagi 5 ta nomzod — kerakmi? Muddati
   qaysi kun? Kimga tegishli (barcha firmalarga yoki xodimi bor firmalargami)?
9. **"1-tovar", "2-sonli shakl", "mehnat hisoboti"** — rasmiy nomlari
   qanday va topshirish organi kim (Statistika qo'mitasi? Soliq? Mehnat
   vazirligi?)
10. **Mehnat shartnomasi** — bu takrorlanuvchi muddat emas. Uni firma
    kartochkasidagi bir martalik vazifa qilib qo'ysak yetadimi?
11. **Yetishmagan yana nima bor?** Ro'yxatda umuman yo'q, lekin har oy/chorak
    bajariladigan ish bormi?

### 5.4 Qoidalar

12. **Muddat dam olish kuniga tushsa** — oldingi ish kuniga surilsinmi yoki
    keyingisiga? (Bugun hamma shablonda `next_workday`.)
13. **Deklaratsiya va to'lov** — ASROda ular ALOHIDA shablon
    (`QQS_DECL` / `QQS_TOLOV`). Shu to'g'rimi yoki bitta ish sifatida
    hisoblanadimi?
14. **Kechikish sababi** — qaysi sabablar KPI dan chiqarishga arziydi?
    (Bugun: mijoz kechikishi, tashqi organ, tizim nosozligi, rahbariyat
    qarori.)

---

## 6. Bilish kerak bo'lgan (uchrashuvga tayyorgarlik)

**Vaqt — Toshkent, UTC emas.** Muddat hisobining devor soati
`Asia/Tashkent` (UTC+5) ga qadalgan. Prod server UTC da yuradi, shuning
uchun `lib/platform/format.ts` va `periodWindowFor` ataylab `Asia/Tashkent`
o'qiydi — aks holda soat 00:00–04:59 oralig'ida sana bir kunga surilardi.

**Davr kaliti ikki xil ko'rinadi, adashtirmang.**
`Obligation.periodKey` → `2026-M09` (oylik), `2026-Q3` (chorak), `2026-Y`
(yillik). Sig'im hisobidagi oy kaliti esa `2026-09`. Ikkisi bir xil
ko'rinadi, lekin bir-biriga mos kelmaydi.

**Uch xil anchor.**
- `fixed_day_of_month` — davrdan KEYINGI oyning N-kuni (aksariyat soliqlar).
- `period_end_offset` — davr tugashidan +N kun.
- `period_end_month_day` — davrning OXIRGI oyidagi N-kun. Bu muddat davr
  ICHIDA tugaydigan hisobotlar uchun (`STAT_4_MOLIYA`: 1-sentabr holatiga,
  18-sentabrgacha). Boshqa ikkisi buni ifodalay olmaydi.

**Shablon darhol ishlamaydi — lifecycle bor.**
`draft → approved → active → retired`. Admin to'g'ridan-to'g'ri
productionga chiqara olmaydi; bu ataylab, chunki shablon o'zgarishi
mingtalab majburiyat yaratadi.

**Qoida o'zgarsa — yangi versiya.** `templateVersion` majburiyatga snapshot
bo'lib yoziladi, ya'ni eski majburiyatlar eski qoida bilan tarixda qoladi.
Mavjud shablonning davriyligini o'zgartirish eski davr kalitiga ega ochiq
majburiyatlarni bekor qiladi (`cancelStaleRuleObligations`) — bu kutilgan
xatti-harakat, lekin uchrashuvda aytib qo'yilsin.

---

## 7. Uchrashuvdan keyin

Tasdiq olingach, tartib shunday:

1. `normativeMinutes` — 40 shablonga yozish (bitta migratsiya emas, seed
   skripti: `scripts/seed-deadline-templates.ts`).
2. `BusinessCalendarDay` — 2026 kalendarini ekish.
3. 10 ta draftni `active` ga o'tkazish (tasdiqlanganlarini).
4. §4 nomzodlarini yozish — tasdiqlangan qiymatlar bilan.
5. `activeServices` — firma-firma to'ldirish (eng uzun ish, alohida sprint).
6. `npx tsx scripts/generate-obligations.ts` — quruq yurish bilan tekshirish.

**Hujjat holati:** bosh buxgalterga yuborishga tayyor.
