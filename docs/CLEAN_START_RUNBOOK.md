# ASRO — Toza start runbook (production)

Firma tizimni **1-avgustda** xodimlarga topshiradi. Shu sababli proddagi
operatsion ma'lumot (pul, ball, hisobot, xabar tarixi) tozalanadi, spravochnik
(kim ishlaydi, qaysi firmalar, qanday qoidalar) esa joyida qoladi.

Bu hujjat — qadam-baqadam tartib. Har bir qadamning **nega** kerakligi va
**kutilgan chiqishi** yozilgan. Tartibni buzmang: qadamlar bir-biriga bog'liq.

> **Bu hujjat ma'lumot o'chiradi.** 6-qadam qaytarib bo'lmaydi. Unga
> yetgunga qadar 3-qadam (zaxira) bajarilgan va tekshirilgan bo'lishi shart.

## Bajarilgan: 2026-07-31

Bu tartib prodda to'liq bajarildi. Natija — keyingi safar nimani kutish
kerakligining o'lchovi:

| Qadam | Natija |
|---|---|
| Zaxira | `asro_20260730T190631Z.dump` (820K, 60 TABLE DATA bloki), sha256 tasdiqlangan, offsite nusxa olingan |
| Billing | `false` (`.env` + `.env.local`), bot restartdan keyin `billing reminders scheduled` logi yo'q |
| Shablon | 15 ta; 211 firmaga `contractDate` backfill |
| Reset | **15 260** qator o'chdi (dry-run'da 11 868 edi — oradagi vaqtda bot 2 544 majburiyat va 983 eslatma yaratib ulgurgan) |
| Verify | `✓ CLEAN START OK`, `AuditLog = 54` saqlangan |
| Generatsiya | **2 544** majburiyat: `2026-M07` 1 935, `2026-Q3` 185, `2026-Y` 424. Kechikkan **0**, mas'ulsiz **0** |
| Catch-up sinovi | Kunlik cron logi: `generate: [ 2544, 0, 0 ]` — 1 va 2 oy orqaga **0** yaratildi, ya'ni `effectiveFrom` chegarasi ishlaydi |

Yaratilgan muddatlar taqsimoti (dam olish kunlari surilgan):

```
2026-08-05  424    pul oqimi + 1C baza
2026-08-10  424    soliq sana+summa (09-avgust yakshanba → surildi) + xatlar
2026-08-17  636    INPS + daromad + material (15-avgust shanba → surildi)
2026-08-20   27    QQS (faqat QQS to'lovchilar)
2026-08-25  424    debitor-kreditor + foyda-zarar
2026-10-15  185    aylanma soliq (2026-Q3)
2027-02-15  212    moliyaviy hisobot
2027-03-01  212    foyda solig'i
```

Tegishli fayllar: [`lib/operationalTables.ts`](../lib/operationalTables.ts)
(nima o'chadi, nima qoladi), [`scripts/reset-operational-data.ts`](../scripts/reset-operational-data.ts),
[`scripts/verify-clean-start.ts`](../scripts/verify-clean-start.ts),
[`docs/DEPLOYMENT.md`](./DEPLOYMENT.md) (umumiy deploy).

---

## 0. Oldindan shartlar

```bash
ssh -i ~/Downloads/ASRO.pem ubuntu@16.192.135.23
cd ~/mehnat-ai
git pull                      # yangi skriptlar shu yerdan keladi
npm ci                        # lockfile o'zgargan bo'lsa
pm2 list                      # asro-web va asro-bot ko'rinishi kerak
```

> **Hamma amal SERVERDA bajariladi.** Lokal bazadagi ma'lumot boshqa —
> u yerda ishlatish natijani ham, hisobotni ham yolg'on qiladi.

**30-iyul holatidagi bazaviy raqamlar** (o'zgarishi mumkin, har qadamda
o'zingiz ko'rgan sonni ishlating):

| Ko'rsatkich | Qiymat |
|---|---|
| O'chiriladigan operatsion qator | ~11 868 (15 jadval) |
| `auditLog` (saqlanadi) | 54 |
| Faol firma / `contractDate` yo'q | 212 / 211 |
| Faol xodim / Telegramga bog'langan | 26 / **0** |
| `DeadlineTemplate` | **0** ← asosiy muammo |

---

## 1. Yozuvni to'xtatish

Reset paytida fon jarayonlari yozishda davom etsa, tozalash "teshik" bo'lib
qoladi: sweep yangi `NotificationDelivery` yozadi, webhook yangi
`TelegramMessage` qo'shadi, cron KPI hisoblaydi.

```bash
pm2 save                                  # joriy ro'yxatni eslab qol
pm2 stop asro-bot asro-web
pm2 list                                  # ikkalasi ham "stopped" bo'lsin
```

> **Telegram webhook haqida.** `asro-web` to'xtaganda webhook javob bermaydi va
> Telegram yangilanishlarni ~24 soat qayta uradi. Bu kutilgan holat — ular bot
> qaytgach yetib keladi va `ProcessedUpdate` dedupi ularni ikki marta
> ishlashdan saqlaydi. Webhookni o'chirish shart emas.

---

## 2. Billing eslatmalarini o'chirish

Reset `payment` jadvalini o'chiradi. Qarz esa `contractAmount − paidAmount`
deb hisoblanadi ([`bot/contexts/billing/domain/debt.ts`](../bot/contexts/billing/domain/debt.ts)),
ya'ni to'lovlar o'chgach **har bir mijoz firmasi to'liq qarzdor** bo'lib
ko'rinadi va guruhlarga to'g'ridan-to'g'ri 🟠/🔴 to'lov talabi ketadi.

Prodda bayroq **ikkala faylda** turibdi va botga `.env.local` ustun keladi —
shuning uchun ikkalasini ham tahrirlang:

```bash
sed -i 's/^BILLING_ENABLED=.*/BILLING_ENABLED=false/' .env .env.local
grep -H '^BILLING_ENABLED' .env .env.local     # ikkalasida ham false bo'lsin
```

> **`BILLING_CRON_HOUR=2`** — eslatma yarim tundan keyin soat 02:00 da ketadi,
> ya'ni tunda. Bayroqni bot qayta yoqilgunga qadar `false` da ushlang.

Bayroq faqat jarayon **ishga tushganda** o'qiladi, shuning uchun u 12-qadamdagi
`pm2 start` da kuchga kiradi.

---

## 3. Zaxira

```bash
bash scripts/backup.sh daily
```

Chiqishda fayl yo'li va sha256 ko'rinadi. Tekshiring va **boshqa mashinaga
nusxalang** — bir serverdagi zaxira server bilan birga o'ladi:

```bash
ls -lh backups/daily/ | tail -3
cd backups/daily && sha256sum -c "$(ls -t *.sha256 | head -1)" && cd ~/mehnat-ai
# lokal mashinangizga:
# scp -i ~/Downloads/ASRO.pem ubuntu@16.192.135.23:~/mehnat-ai/backups/daily/asro_*.dump ~/
```

`.env` ni ham alohida saqlang (unda sirlar bor, `chmod 600`):

```bash
cp .env ~/asro-env-$(date -u +%Y%m%dT%H%M%SZ).bak && chmod 600 ~/asro-env-*.bak
cp .env.local ~/asro-envlocal-$(date -u +%Y%m%dT%H%M%SZ).bak && chmod 600 ~/asro-envlocal-*.bak
```

> **Diskda yuklangan fayl yo'q.** Hisobot dalili skrinshotlari
> `ReportProof.imageData` da base64 ko'rinishida, Telegram media esa `file_id`
> orqali — hech narsa serverga tushmaydi. Ya'ni `pg_dump` **to'liq** zaxira.

---

## 4. Muddat shablonlarini ekish

Prodda `DeadlineTemplate = 0`. Shablonsiz majburiyat generatsiya qilinmaydi va
bot muddat eslatmasi yubora olmaydi — tozalash ma'nosiz bo'lardi.

Shablon **spravochnik**, ya'ni reset uni o'chirmaydi. Shuning uchun uni
reset'dan **oldin** ekish xavfsiz va tartibni soddalashtiradi.

```bash
npx tsx scripts/seed-deadline-templates.ts --no-generate
```

Skript idempotent (`@@unique([code, version])` bo'yicha upsert), qayta ishga
tushirilsa dublikat yaratmaydi. U uch ish qiladi:

1. **`contractDate` backfill** — 211 firmaga 2026-01-01 qo'yadi. Busiz
   `isCompanyEligible` ularni "hali shartnoma yo'q" deb chetlab o'tadi va
   majburiyat atigi 1 ta firmaga yaratilardi.
2. **15 ta shablon** upsert qiladi (`lifecycle=active`).
3. `--no-generate` tufayli **majburiyat yaratmaydi** — u 8-qadamda.

Kutilgan chiqish (oxirgi ustun — `effectiveFrom`):

```
1) contractDate backfill: 211 firma → 2026-01-01
   ✓ QQS_DECL          monthly   2026-07-01 → tax_regime=vat
   ✓ AYLANMA_SOLIQ     quarterly 2026-07-01 → tax_regime=turnover
   ✓ INPS_IJTIMOIY     monthly   2026-07-01 → universal
   …
   ✓ PAYROLL_CALC      monthly   2026-08-01 → universal
   ✓ PAYROLL_POSTED    monthly   2026-08-01 → universal

2) Shablon: 15 ta faol. Generatsiya o'tkazib yuborildi (--no-generate).
```

> **Nega ikki xil `effectiveFrom`?** Bu sana faqat "shablon qachondan amal
> qiladi" degani emas — u **catch-up'ni ham to'sadi**. Kunlik 06:00
> generatsiyasi `catchUpMonths: 2` bilan ishlaydi va `ref` ni 2 oy orqaga
> suradi; generator esa shablonni `effectiveFrom <= ref` bo'yicha filtrlaydi.
> - **2026-07-01** (13 ta shablon) — iyun va undan oldingi davrlar hech qachon
>   yaratilmaydi, iyul davri esa yaratiladi. Iyul davrining muddatlari avgustga
>   tushadi (QQS 20-avgust, INPS 17-avgust va h.k.) — bu xodimlar avgustda
>   bajaradigan **real ish**.
> - **2026-08-01** (`PAYROLL_CALC`, `PAYROLL_POSTED`) — bular oyning o'zida
>   bajariladi, ya'ni iyul davri muddati 31-iyul. Ular iyulda, tizimsiz
>   bajarilgan; iyul davri yaratilsa 212 × 2 = **424 ta soxta "kechikkan"**
>   paydo bo'lardi. Shuning uchun ular avgust davridan boshlanadi.

---

## 5. Quruq ishlash (dry-run) va bazaviy sonlar

```bash
npx tsx scripts/reset-operational-data.ts | tee ~/reset-dryrun-$(date -u +%Y%m%dT%H%M%SZ).log
```

Hech narsa o'chmaydi — bu faqat hisobot. Chiqishdan **ikki narsani oling**:

1. `JAMI` soni — 6-qadamdan keyin shuncha qator o'chgan bo'lishi kerak.
2. `auditLog` soni (30-iyulda **54**) — 7-qadamda `--audit-min` ga aynan shuni
   berasiz. Skript buni alohida eslatib turadi.

Endi `DeadlineTemplate = 0` ogohlantirishi **chiqmasligi** kerak — 4-qadam
uni hal qildi. Chiqsa, 4-qadamga qayting.

---

## 6. ⛔ RESET

> **QAYTARIB BO'LMAYDI.** Faqat 3-qadam (zaxira) bajarilgan, offsite nusxa
> olingan va 5-qadam chiqishi ko'zdan kechirilgan bo'lsa bosing.
> **Buyruq egasi tomonidan alohida tasdiqlanmaguncha ishga tushirilmaydi.**

```bash
npx tsx scripts/reset-operational-data.ts --apply --confirm=RESET
```

Ikki mustaqil bayroq ataylab: yolg'iz `--apply` ni tasodifan yozib yuborish
mumkin, ikkitasini esa yo'q.

`AuditLog` o'chmaydi. `--with-audit` bayrog'i mavjud, lekin **bu runbookda
hech qachon ishlatilmaydi** — kim nima qilganining izi qolishi kerak.

---

## 7. Tekshirish

```bash
npx tsx scripts/verify-clean-start.ts --audit-min=54
```

`54` o'rniga 5-qadamda yozib olgan sonni qo'ying. Skript mustaqil tekshiradi:

| Tekshiruv | Xato bo'lsa |
|---|---|
| 38 ta operatsion jadval bo'sh | ✗ tozalash to'liq o'tmagan |
| Spravochnik joyida (`user`, `company`, `contractAssignment`, `kpiRule`, `systemSetting`, `deadlineTemplate`) | ✗ zaxiradan tiklash |
| `DeadlineTemplate` bor **va** `lifecycle=active` | ✗ 4-qadamga qaytish |
| `auditLog >= 54` | ✗ audit izi o'chgan |
| Faol firmada `contractDate` / buxgalter bor | ⚠ ogohlantirish |

Kutilgan yakun: `✓ CLEAN START OK`. Xato bo'lsa `exit(1)` va **davom etmang**.

`--audit-min` nega muhim: yolg'iz `> 0` tekshiruvi 54 tadan 3 tasi qolgan
holatni ham "joyida" deb ko'rsatardi.

---

## 8. Majburiyatlarni generatsiya qilish

```bash
npx tsx scripts/generate-obligations.ts
```

`--catch-up` berilmaydi (standart 0) — faqat joriy davr. Idempotent, qayta
ishga tushirish xavfsiz.

Kutilgan natija (212 firma, 30-iyul holatiga ko'ra ~2 544 ta):

| Davr | Taxminiy soni | Nima |
|---|---|---|
| `2026-M07` | ~1 935 | 9 universal oylik × 212 + QQS × 27 (faqat QQS to'lovchilar) |
| `2026-Q3` | 185 | Aylanma soliq (faqat turnover rejimi) |
| `2026-Y` | 424 | Foyda solig'i + moliyaviy hisobot |

Eng yaqin muddatlar 2026-08-05 (pul oqimi, 1C baza), so'ng 08-10, 08-17,
08-20, 08-25. **Kechikkan majburiyat 0 bo'lishi kerak** — skript aks holda
ogohlantiradi.

So'ng qayta tekshiring:

```bash
npx tsx scripts/verify-clean-start.ts post-generate --audit-min=54
```

`post-generate` rejimida `Obligation > 0` talab qilinadi, uning bola
jadvallari (topshirish/hodisa) esa baribir 0 bo'lishi kerak.

> **1-avgust 06:00 da nima bo'ladi.** Kunlik cron `catchUpMonths: 2` bilan
> ishlaydi: `ref` = 1-avgust → **2026-M08** davri yaratiladi (~2 359 ta,
> muddatlari sentyabrda; payroll 31-avgust); `ref` = 1-iyul → hammasi
> allaqachon mavjud, `skip`; `ref` = 1-iyun → **shablonlar ko'rinmaydi**
> (`effectiveFrom` chegarasi), 0 yaratiladi. Aynan shu kutilgan xatti-harakat.

---

## 9. Nol ekanini ko'z bilan tekshirish

`verify` skripti bazani tekshiradi, bu qadam esa **ekranni** tekshiradi —
keshlangan yoki noto'g'ri hisoblangan ko'rsatkich qolmasin.

`asro-web` ni vaqtincha yoqing (bot hali yo'q):

```bash
pm2 start ecosystem.config.cjs --only asro-web
```

Brauzerda admin bilan kiring va tekshiring:

- [ ] `/dashboard` — daromad/xarajat/KPI ko'rsatkichlari **0**
- [ ] `/kassa` — bo'sh, balans 0
- [ ] `/expenses` — bo'sh
- [ ] `/payroll` — hisoblangan oylik yo'q
- [ ] `/kpi` va `/fair-kpi` — ball yo'q
- [ ] `/reports` — matritsa bo'sh
- [ ] `/deadlines` — **to'la**, avgust muddatlari ko'rinadi (8-qadam natijasi)
- [ ] `/organizations` — 212 firma joyida
- [ ] `/staff` — 26 faol xodim joyida

Buyruq qatoridan auth darvozasini tekshirish (kirmagan foydalanuvchi
`/login` ga uloqtirilishi kerak, 404 emas):

```bash
for p in /dashboard /kassa /expenses /payroll /kpi /reports /deadlines /organizations /staff; do
  printf "%-16s → %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' "https://asro.uz$p")"
done   # hammasi 307 bo'lishi kerak
```

---

## 10. Xodim ma'lumotlarini kiritish

Telefon raqamlari (avval quruq ishlash, keyin qo'llash):

```bash
npx tsx scripts/import-staff-phones.ts            # dry-run
npx tsx scripts/import-staff-phones.ts --apply
```

Qolgan import/tuzatishlarni shu bosqichda qiling — bular spravochnik, ya'ni
keyingi tozalashlardan omon qoladi.

---

## 11. Staff smoke test

Bitta haqiqiy buxgalter hisobi bilan (admin emas) o'ting:

- [ ] Login ishlaydi
- [ ] Dashboard o'z firmalarini ko'rsatadi
- [ ] `/deadlines` — o'ziga biriktirilgan majburiyatlar ko'rinadi
- [ ] Amallar matritsasida katak "topshirildi" qilinadi + skrinshot yuklanadi
- [ ] Ilova ichidagi qo'ng'iroq (bell) ochiladi

---

## 12. Botni yoqish (billing o'chiq holda)

```bash
pm2 start ecosystem.config.cjs --only asro-bot
pm2 save
npm run bot:webhook                    # webhookni qayta ro'yxatdan o'tkazish
pm2 logs asro-bot --lines 40 --nostream
```

Logda tekshiring:

- [ ] `[cron] billing reminders scheduled` qatori **CHIQMASLIGI** kerak —
      chiqsa, 2-qadam kuchga kirmagan, botni to'xtatib `.env.local` ni qayta
      tekshiring.
- [ ] `[cron] month-closing: …` chiqadi — bu normal.
- [ ] `[obligation.worker] sweep:` birinchi soatlik yugurish natijasi.

> **Birinchi sweep nima qiladi.** 2026-08-05 muddatli ~424 majburiyat uchun
> "D-5" bosqichi ishga tushadi va **ilova ichida** eslatma yaratadi. Telegramga
> hech narsa ketmaydi: hozircha **0 xodim** botga bog'langan (`telegramUserId`
> bo'sh), shuning uchun sweep ularni `noTelegram` deb sanaydi. Xodimlar
> `/link_me` qilgach eslatmalar shaxsiy chatga bora boshlaydi — mijoz
> guruhiga hech qachon emas (ADR-0007).

---

## 13. Topshirish va billingni qaytarish

1-avgustda tizim xodimlarga beriladi. Botga bog'lanish tartibi:
[`docs/BOT_ONBOARDING.md`](./BOT_ONBOARDING.md) (`/bind`, so'ng `/link_me`).

**Billingni qachon yoqish mumkin:**

- [ ] Avgust oyi uchun `Payment` yozuvlari haqiqatga mos kiritilgan
      (aks holda hamma firma to'liq qarzdor ko'rinadi)
- [ ] Mijoz guruhlari to'g'ri bog'langan (hozir `TelegramGroup` = 1 ta)
- [ ] Firma `paymentDay` qiymatlari tekshirilgan

Uchalasi bajarilgach:

```bash
sed -i 's/^BILLING_ENABLED=.*/BILLING_ENABLED=true/' .env .env.local
pm2 restart asro-bot --update-env
pm2 logs asro-bot --lines 20 --nostream | grep billing   # "scheduled daily at 2:00"
```

---

## Rollback

Reset'dan keyin biror narsa noto'g'ri chiqsa:

```bash
pm2 stop asro-bot asro-web                   # avval yozuvni to'xtating
pg_restore --clean --no-owner --dbname="$DATABASE_URL" backups/daily/asro_<STAMP>.dump
npx tsx scripts/preflight.ts                 # baza va admin joyidami
pm2 start ecosystem.config.cjs
```

Ishonchsiz bo'lsangiz, avval alohida bazaga tiklab ko'ring:
`createdb asro_restore && pg_restore --clean --no-owner --dbname=asro_restore <fayl>`.

---

## Nima o'chmaydi

Tasnif [`lib/operationalTables.ts`](../lib/operationalTables.ts) da — reset ham,
verify ham **o'sha bitta ro'yxatni** o'qiydi, shuning uchun ular ajralib keta
olmaydi. `lib/operationalTables.spec.ts` esa schema'ga yangi model qo'shilsa
qulaydi va uni tasniflashga majbur qiladi.

| Chelak | Tarkibi |
|---|---|
| **Saqlanadi** | `User`, `Company`, `Department`, `ContractAssignment`, `KpiRule`, `CompanyKpiRule`, `SlaPolicy`, `DeadlineTemplate` + yo'ldoshlari, `BusinessCalendarDay`, `SystemSetting`, `ClientCredential`, `ClientUser`, `TelegramGroup`, `InventoryItem`, `Document`, `EmployeeCostRate`, `OneCConnection`, `OneCCompanyMapping` |
| **Alohida saqlanadi** | `AuditLog` — kim nima qilganining izi |
| **O'chiriladi** | 38 ta operatsion jadval: majburiyat zanjiri, bot xabar tarixi, vazifa/SLA, xabarnomalar, moliya (ledger/payout/payment/expense/kassa/invoice), KPI ballari, davomat, hisobot matritsasi, 1C integratsiya tarixi |
