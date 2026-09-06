# service_key migratsiyasi — runbook

**Holat:** 🟢 skript tayyor · ⛔ **APPLY BLOKLANGAN** — biznes tasdig'i kutilmoqda
**Skript:** [`scripts/migrate-service-key-applicability.ts`](../../scripts/migrate-service-key-applicability.ts)
**Tasdiq fayli:** [`scripts/data/service-key-mappings.json`](../../scripts/data/service-key-mappings.json)
**Audit:** [`business-rule-audit-2026-09.md`](business-rule-audit-2026-09.md)

---

## 0. Nima qiladi

Har bir **tasdiqlangan** moslik uchun bitta `TemplateApplicability(service_key = matrixKey)`
qatori qo'shadi va shu shablon bo'yicha **kaliti yo'q** firmalarning `planned`
majburiyatlarini bekor qiladi.

| Firma toifasi | Nima bo'ladi |
|---|---|
| kaliti **bor** | tegilmaydi |
| kaliti **yo'q** (boshqa kalitlari bor) | `planned` majburiyati bekor qilinadi |
| **hech qanday kaliti yo'q** (31 firma) | **butunlay chetlab o'tiladi** |

| Majburiyat holati | Nima bo'ladi |
|---|---|
| `planned` | ✅ `cancelled` + `ObligationStatusEvent` |
| `in_progress` (20) · `sent` (11) | ❌ tegilmaydi — bajarilgan ish dalili |
| `accepted` · `cancelled` (164) | ❌ tegilmaydi — yopilgan |

> **Nega bekor qilishni generatorga tashlamaymiz.** `generateObligations` "mos emas"
> tarmog'ida faqat **joriy oynadagi** qatorni qidiradi, runner esa joriy oy + 2 oyni
> ko'radi. Oyna har oy suriladi — migratsiya kechiksa eski `planned` qatorlar
> generator ko'rish doirasidan chiqib ketadi va abadiy ochiq qoladi. Shuning uchun
> bekor qilishni migratsiyaning **o'zi** bajaradi, davridan qat'i nazar.

---

## 1. Tasdiq — birinchi va majburiy qadam

`scripts/data/service-key-mappings.json` da 24 qator bor. Har biriga:

```json
{ "code": "MATERIALS", "confirmed": true,  "confirmedBy": "F.I.Sh.", "confirmedAt": "2026-09-10" }
```

| Qiymat | Ma'no | Migratsiya |
|---|---|---|
| `true` | moslik to'g'ri | qamrovga **kiradi** |
| `false` | moslik noto'g'ri, rad etildi | **qo'shilmaydi**, qaror yozib qolinadi |
| `null` | hali javob yo'q | **butun migratsiyani BLOKLAYDI** |

`null` va `false` ataylab ajratilgan: `false` — qaror, `null` — qarorsizlik.
Bitta `null` qolsa ham migratsiya yurmaydi (yarim holat jimgina paydo bo'lmasligi uchun).

---

## 2. Bosqichlar — ataylab ajratilgan

| Bosqich | Buyruq | Ta'sir | Xavf |
|---|---|--:|---|
| **(a)** draft shablonlar | `--scope=draft` | **0** majburiyat | juda past |
| **(b)** active shablonlar | `--scope=active` | 1 673 bekor | yuqori |

10 ta draft shablon hozir 0 majburiyat yaratadi — ularga qoida qo'shish bugun
**bepul**, faollashtirilgandan keyin esa 1 000+ soxta majburiyat oldini oladi
(`EKOLOGIYA` 219, `ITPARK_OYLIK` 225).

**(a) ni birinchi qiling.** Xavfsiz o'zgarishni xavfli o'zgarish bilan bitta
tranzaksiyaga qo'yish uchun sabab yo'q.

---

## 3. APPLY CHECKLIST

Har bandi bajarilmaguncha keyingisiga o'tmang.

- [ ] **1.** Manifestdagi 24 qatorning **hammasi** to'ldirilgan (`null` qolmagan)
- [ ] **2.** Tasdiq git ga commit qilingan — kim, qachon tasdiqlagani tarixda qoladi
- [ ] **3.** Prodga tunnel ochilgan:
      `ssh -i ~/Downloads/ASRO.pem -N -L 15432:localhost:5432 ubuntu@16.192.135.23`
- [ ] **4.** **Dry-run** yurgizilgan va natijasi ko'zdan kechirilgan:
      ```
      DATABASE_URL="postgresql://…@127.0.0.1:15432/inbola?schema=public" \
        npx tsx scripts/migrate-service-key-applicability.ts --scope=draft
      ```
- [ ] **5.** «KUTILGAN vs HAQIQIY» jadvalida **hamma qator ✅** — bittasi ⚠️ bo'lsa **TO'XTANG**
      (auditni qayta yurgizing; raqamlar tabiiy o'sishi mumkin, lekin qarorni odam qabul qiladi)
- [ ] **6.** «MIGRATSIYA REJASI» dagi shablonlar va sonlar kutilganidek
- [ ] **7.** **ZAXIRA OLINGAN** va tiklanishi tekshirilgan:
      ```
      pg_dump -Fc "$DATABASE_URL" > asro-$(date +%F-%H%M).dump
      ```
- [ ] **8.** Bot to'xtatilgan (`pm2 stop asro-bot`) — 06:00 generatsiyasi tranzaksiyaga xalaqit bermasin
- [ ] **9.** APPLY:
      ```
      npx tsx scripts/migrate-service-key-applicability.ts \
        --scope=draft --apply --backup=asro-2026-09-10-1430.dump
      ```
- [ ] **10.** Rollback fayli (`.migrations/svckey-….json`) **zaxira yoniga ko'chirilgan**
      — bu fayl yo'qolsa rollback qilib bo'lmaydi
- [ ] **11.** Post-audit o'tgan (§4)
- [ ] **12.** Bot qayta yoqilgan (`pm2 start asro-bot`)
- [ ] **13.** (b) bosqichi uchun 3–12 ni `--scope=active` bilan takrorlang

### Skript o'zi to'xtatadigan holatlar

| Holat | Natija |
|---|---|
| `confirmed: null` qolgan | ⛔ APPLY bloklanadi |
| Bazada nomzod bor, manifestda yo'q | ⛔ ABORT — manifest eskirgan |
| Manifestdagi `matrixKey` bazadagidan farq qiladi | ⛔ ABORT |
| Kutilgan va haqiqiy raqam farq qiladi | ⛔ APPLY bloklanadi (`--accept-drift` bilan ochiladi) |
| `--backup=` berilmagan | ⛔ ABORT |
| Tranzaksiya ichidagi yakuniy sanoq rejadan farq qiladi | ⛔ tranzaksiya bekor, hech narsa yozilmaydi |
| Invariantlardan biri buzilgan | ⛔ tranzaksiya bekor |

---

## 4. POST-AUDIT CHECKLIST

```
npx tsx scripts/migrate-service-key-applicability.ts --post-audit=.migrations/svckey-….json
```

Faqat o'qiydi. Sakkiz bandni tekshiradi:

- [ ] Tasdiqlangan shablonlarda `service_key` qoidasi bor
- [ ] **Tasdiqlanmagan moslik qo'shilmagan**
- [ ] Kalitsiz 31 firma tegilmagan (`planned` soni o'zgarmagan)
- [ ] `in_progress` mavjud, bekor qilinmagan
- [ ] `sent` mavjud, bekor qilinmagan
- [ ] Bekor qilinganlar kutilgan miqdorda
- [ ] Boshqa shablonlarning majburiyatlari o'zgarmagan
- [ ] Migratsiyadan keyin noto'g'ri majburiyat yaratilmagan

**Muhim:** oxirgi bandni **kunlik generatsiya bir marta ishlaganidan keyin**
qayta yurgizing — qoida haqiqatan yangi qator yaratilishini to'xtatganini
faqat shu isbotlaydi.

Qo'shimcha, qo'lda:

- [ ] `/deadlines` ekranida tegilgan firmalar bo'yicha soxta ish qolmagan
- [ ] Botdan shu majburiyatlar bo'yicha eskalatsiya kelmayapti
- [ ] `npx tsx scripts/audit-matrixkey-mapping.ts` → nomzodlar soni kamaygan

---

## 5. ROLLBACK

```
npx tsx scripts/migrate-service-key-applicability.ts --rollback=.migrations/svckey-….json          # dry-run
npx tsx scripts/migrate-service-key-applicability.ts --rollback=.migrations/svckey-….json --apply
```

- **Faqat shu migratsiya yaratgan** `TemplateApplicability` qatorlari o'chiriladi (ID bo'yicha).
  Boshqa mavjud qoidalarga tegilmaydi.
- Bekor qilingan majburiyatlar `planned` ga qaytariladi — **faqat hali ham `cancelled`**
  bo'lganlari. Kimdir oradan keyin holatni o'zgartirgan bo'lsa, u qator tegilmaydi va
  hisobotda ko'rsatiladi.
- Har tiklash uchun `ObligationStatusEvent` yoziladi — jim o'zgarish yo'q.
- Fayl boshqa bazaga tegishli bo'lsa skript ishlamaydi.

Rollback fayli yo'qolsa — **zaxiradan tiklashdan boshqa yo'l yo'q**. Shuning uchun
uni dump yoniga ko'chirish APPLY CHECKLIST ning 10-bandi.

---

## 6. Skript qanday isbotlangan

`test/migration-service-key.test.ts` — skriptni **CLI sifatida** (sohta nusxasini emas)
test bazasida yurgizadi, 15 ta holat:

| Isbotlangan | |
|---|---|
| dry-run bazaga tegmaydi | ✅ |
| `confirmed=null` → APPLY bloklanadi va hech narsa yozilmaydi | ✅ |
| `--backup` bo'lmasa APPLY rad etiladi | ✅ |
| apply: qoida yaratiladi, `planned` bekor qilinadi | ✅ |
| `sent` tegilmaydi | ✅ |
| **kalitsiz firma tegilmaydi** | ✅ |
| kaliti bor firma tegilmaydi | ✅ |
| bekor qilish `ObligationStatusEvent` bilan izlanadi | ✅ |
| post-audit hamma bandni o'tkazadi | ✅ |
| rollback: qoida o'chadi, majburiyat tiklanadi | ✅ |
| rollback tegmasligi kerak bo'lganlarga tegmaydi | ✅ |

Qo'shimcha: `test/mapping-manifest.test.ts` (12) · `test/service-key-gate.test.ts` (17) ·
`test/obligation-service-key-cancel.test.ts` (10).
