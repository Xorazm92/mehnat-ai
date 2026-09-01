# Arxitektura va texnik qarz — ko'rik

**Sana:** 2026-09-01 · **Qamrov:** arxitektura, qatlamlar, saqlash, texnik qarz
· **O'lchov manbasi:** prod bazasi (faqat o'qish, `16.192.135.23`) + manba kodi
(90 859 qator TS/TSX, 71 Prisma modeli)

Bu hujjat **tashxis**, reja emas. Har bir da'vo yo prod o'lchovi, yo fayl
havolasi bilan ko'rsatilgan; §7 da o'sha o'lchovlarni qayta olish buyruqlari bor.

---

## Holat (2026-09-01)

**1-to'lqin PRODDA QO'LLANDI (2026-09-01)** — D1, D2, D4 va reja paytida
topilgan D2a. O'lchangan natija: `ReportProof` **128 MB → 848 kB**, baza
dump'i **79 MB → 4.9 MB**, `Notification` **37 480 → 23 884**. Fayllar endi
diskda (78 MB, 1 209 fayl — 245 tasi mazmun bo'yicha dublikat bo'lib
birlashdi) va zaxira ikki qismli.

**D5 yopildi (2026-09-01)** — pastga qarang. **D3 qayta baholandi** — u ham
pastda. **D11 ochildi va yopildi (2026-09-01)** — bank vipiskasidagi
postlanmagan chiqim. Qolgan ochiq: D6-D10.

## 0. Bir jumlada

Kod bazasi **sifat jihatidan sog'lom** (tiplar toza, ruxsat qatlami yagona
manbadan, 1 ta TODO) — asosiy qarz kodda emas, **saqlashda va sirt kengligida**:
fayllar Postgres ichida base64 bo'lib yotibdi (`ReportProof` 128 MB), bildirishnomalar
cheksiz o'sadi (avgustda 36 ming qator), va 71 modeldan 29 tasi prodda hech
qachon bir qator ham ko'rmagan.

---

## 1. Qamrov va usul

| Nima | Qanday |
|---|---|
| Tip xatolari | `npx tsc --noEmit -p tsconfig.json` → **0 xato** |
| Ruxsat qamrovi | `server/*.ts` dagi har `export async function` tanasida qo'riqchi qidirildi, 11 nomzod qo'lda tekshirildi |
| Jadval hajmi va qatorlar | `pg_stat_user_tables`, `pg_total_relation_size` (prod) |
| Indeks foydasi | `pg_stat_user_indexes.idx_scan = 0` (prod) |
| Model o'liklik darajasi | prod qatorlari + `prisma.<model>` murojaatlari soni |

**Nima o'lchanmadi:** bundle hajmi va so'rov kechikishlari.

**Test to'plami** (ko'rikdan keyin, 1-to'lqin ustida yurgizildi): 144 fayldan
142 tasi yashil, 1 448 test o'tdi. Ikki fayl yiqiladi va ikkalasi ham
1-to'lqinga bog'liq EMAS — o'zgarishlarni stash qilib tekshirildi:
`test/matrix-template-coverage.test.ts` yangi test bazasida `DeadlineTemplate`
urug'i yo'qligi uchun, `test/proxy-rbac.test.ts` esa `@/lib/prisma` mock'i
`test/setup.ts` ning ish vaqti tekshiruvi bilan to'qnashgani uchun.

---

## 2. Tegilmaydigan joylar

Bu bo'lim ataylab: keyingi ko'rik yoki agent shu qatlamlarni "tuzatish"ga
urinmasin — ular allaqachon to'g'ri va bir manbadan.

- **Tiplar toza.** `tsc --noEmit` 0 xato.
- **Ruxsat qatlami to'liq.** 229 ta `"use server"` action, **hammasida**
  qo'riqchi bor: `server/guards.ts` (`requireKassa`, `requireSenior`,
  `requireAdmin`, `requireStatementRole`), `lib/platform/access.ts`
  `assertCompanyPermission`, yoki `auth()` + rol tekshiruvi. Avtomatik skan 11
  ta "qo'riqchisiz" nomzod bergan edi — qo'lda tekshiruvda **hammasi noto'g'ri
  signal**: `server/credentials.ts` `assertCompanyAccess`,
  `server/documents.ts` `sessionFor`, `server/kassa.ts` `createExpense` →
  `createKassaEntry` kabi helper'lar orqali o'tadi.
- **Ekran darvozasi yagona manbadan.** `server/rbac.ts` `currentUserViews()` va
  `proxy.ts` bir xil uchta manbani (rol + admin override + biriktiruvlar)
  hisoblaydi. Faylning o'zida nega shunday qilingani yozilgan (prefetch sikli).
- **Sirlar shifrlangan.** `lib/crypto.ts` AES-256-GCM;
  `ClientCredential` (prodda 181 qator) vault sifatida ishlaydi.
- **Repo gigienasi.** `cookies.txt`, `mehnat_full_backup.sql`, `kassa/`,
  `others_json_files/` git'ga tushmagan. `.git` — 14 MB.
- **Izohlar NEGA ni yozadi.** Butun kod bazasida atigi **1 ta** `TODO/FIXME`.

---

## 3. Qarz reyestri

Tartib — jiddiylik bo'yicha. D1 va D2 birinchi, chunki ular **kutgan sari
qimmatlashadi**.

### D1 · Fayllar Postgres ichida base64 bo'lib yotibdi 🔴

**Dalil.** `ReportProof` prodda **128 MB**, 1 454 qator — qatoriga ~90 KB.
Butun bazadagi keyingi jadval undan 7 barobar kichik.

```
ReportProof          128 MB   (1 454 qator)
NotificationDelivery  17 MB
Notification          17 MB
Obligation           6.6 MB
```

Sabab: [`prisma/schema.prisma`](prisma/schema.prisma) — `ReportProof.imageData`
(`@db.Text`, majburiy) va `ReportProof.fileData`, hamda `Document.fileData`
`data:<mime>;base64,...` satrini to'g'ridan-to'g'ri saqlaydi. Schema'dagi izoh
buni ataylab qilinganini aytadi ("`pg_dump` zaxirasi ikkalasini ham qamraydi").

**Ta'sir.** 312 firma × ~15 hisobot ustuni × 12 oy ≈ 56 000 dalil/yil. Joriy
o'rtachada bu **yiliga ~5 GB** faqat skrinshotdan. Bu bitta baza faylini emas,
har bir `pg_dump` zaxirasini, har bir replikani va `scripts/backup.sh` ning har
bir yugurishini shuncha shishiradi. `Document` hozir bo'sh (§D3) — ya'ni bu
tomon hali ochilmagan, ochilsa yana shuncha qo'shiladi.

**Taklif.** Diskdagi saqlash qatlamiga ko'chirish. **Yechim reponing o'zida
allaqachon yozilgan:** [`lib/engines/evidence/store.ts`](lib/engines/evidence/store.ts)
— `createDiskEvidenceStore`, `refToPath`, `sha256Of`, `extForMime`. Bazada
faqat `storageRef` qoladi. Bu D4 ni ham yopadi.

**Mehnat.** ~2-3 kun (store'ni ulash + `server/proofs.ts` va `server/documents.ts`
ni o'tkazish + mavjud 1 454 qatorni ko'chiruvchi migratsiya skripti +
zaxira/deploy yo'liga fayl katalogini qo'shish).

---

### D2 · Bildirishnomalarga saqlash muddati yo'q 🔴

**Dalil.**

| Jadval | Qatorlar | Hajm |
|---|---|---|
| `NotificationDelivery` | 39 688 | 17 MB |
| `Notification` | 36 362 | 17 MB |

Oy kesimi: 2026-07 → **424**, 2026-08 → **35 938**. Ya'ni kuniga ~1 200 qator,
va o'sish endigina boshlangan. Kod bo'ylab `deleteMany` qidiruvi bu ikki
jadval uchun **hech qanday tozalash yo'lini topmadi** (yagona mos joy —
`scripts/recovery-b4b-clear.ts`, u bir martalik tiklash skripti).

**Ta'sir.** Yiliga ~450 ming qator. Hozircha og'riq bermaydi, lekin bu
bir yildan keyin `Notification` ro'yxati va hisoblagichlari sekinlashadigan
klassik yo'l.

**Taklif.** Saqlash muddati: o'qilgan bildirishnoma 90 kundan keyin, o'qilmagani
180 kundan keyin o'chadi (`deletedAt` emas — bu moliyaviy yozuv emas, jismonan
o'chsa bo'ladi). Joyi: [`bot/cron/scheduler.ts`](bot/cron/scheduler.ts) —
kunlik vazifa sifatida.

**Mehnat.** ~2-3 soat.

---

### D3 · Bo'sh modellar — QAYTA BAHOLANDI 🟡

> **2026-09-01 tuzatish.** Bu bandning dastlabki shakli ("29 model bo'sh →
> o'chirish kerak") **noto'g'ri xulosaga olib borardi** va shuni yozib
> qo'yish kerak, chunki keyingi o'quvchi ham xuddi shu tuzoqqa tushadi.

**Nega bo'shlik o'liklik emas.** Prod 2026-08 da ATAYLAB tozalangan
(`clean-start-2026-08`). Shu sababli ko'p jadval funksiya o'lgani uchun emas,
**ma'lumot hali kirmagani uchun** bo'sh. Kod izini o'lchaganda ko'rinadi:

| Model | Ilova fayllari | Holat |
|---|---|---|
| `Question` / `Answer` | 9 | botning savol-javob oqimi — tirik |
| `KpiEvent` | 5 | KPI dalil qatlami — tirik |
| `Attendance` | 4 | davomat — tirik |
| `Invoice` / `InvoiceLine` | `server/invoices.ts` | schyot yozadi — tirik |
| `Service`, `Lead`, `PosTerminal`, `ShiftCover` | har biri 1 modul + ekran | tirik |

**`InvoiceLine` alohida saboq:** `prisma.invoiceLine` bo'yicha qidiruv NOL
beradi, chunki u relation orqali yoziladi (`invoice.create({ lines: { create:
… } })`). Model o'likligini faqat `prisma.<model>` bo'yicha o'lchash
YETARLI EMAS — relation maydonlarini ham sanash kerak. Bu tekshiruvsiz
ishlaydigan schyot funksiyasi o'chib ketardi.

**Haqiqatan o'lik va nima qilindi:**

- `Expense` — **o'chirildi** (§D5).
- 1C klasteri (`OneCConnection`, `OneCCompanyMapping`, `IntegrationEvent`,
  `SyncRun`, `SyncError`) — **saqlanadi**, schema'da "rejalashtirilgan" deb
  belgilandi. Ilovada murojaat yo'q, lekin ADR-0008 dalil oqimining manba
  tomoni va `test/evidence-landing.test.ts` shular ustida ishlaydi.
  O'chirish qarori D4 (evidence engine) bilan birga ko'riladi.
- `ObligationAssignmentEvent` — saqlanadi, ikkita bot testi ishlatadi.

**Qolgan ish.** Yo'q — band yopilgan. §D8 dagi foydalanilmagan indekslar shu
sababdan ham o'z joyida qoladi: ular bo'sh, ammo tirik jadvallarga tegishli.

---

### D4 · `lib/engines/evidence` yozilgan, lekin ulanmagan 🟡

**Dalil.** 788 qator kod. Uni import qiladigan yagona joylar — o'z spec
fayllari va `test/evidence-landing.test.ts`. Ishlab turgan hech bir sahifa,
action yoki bot konteksti undan foydalanmaydi.

Taqqoslash uchun boshqa engine'lar tirik: `obligation` 12 import, `automation`
11, `workflow` 11, `analytics` 2.

**Ta'sir.** Sinalgan, lekin foydasiz kod — o'qiyotgan odam uni "dalil qatlami"
deb tushunadi, aslida dalil `ReportProof` orqali ketadi.

**Taklif.** D1 ni shu engine ustida bajarish — u holda kod o'lik bo'lishdan
chiqadi va ikkala topilma bitta ish bilan yopiladi. Agar D1 boshqa yo'l bilan
hal qilinsa, `evidence` engine testlari bilan birga o'chirilsin.

---

### D5 · `Expense` — YOPILDI (2026-09-01) ✅

**Kutilganidan sodda chiqdi.** `scripts/migrate-expense-to-kassa.ts` prodda
"ko'chiriladigan qator yo'q" dedi: uchala qator ham 2026-08-18 da yumshoq
o'chirilgan edi (`deletedAt` qo'yilgan), ya'ni ko'chiradigan ma'lumot yo'q.

Bajarildi: model schema'dan olib tashlandi, `DROP TABLE "Expense"`
migratsiyasi yozildi, ishini bajarib bo'lgan ko'chirish skripti o'chirildi,
uchta skriptdagi `prisma.expense` chaqiruvlari tozalandi.

Jurnal izi tegilmadi: `LedgerEntry.sourceTable = 'Expense'` qatorlari tarixiy
yozuv sifatida qoladi (FK yo'q edi).

---

### D6 · `lib/` da qatlam chegarasi yo'q 🟡

**Dalil.** `lib/` ichida **138 ta tekis `.ts` fayl** va 4 ta nomlangan qatlam
(`platform/`, `domains/`, `engines/`, `pos/` — jami 61 fayl) yonma-yon turibdi.
Nima qayerga tushishini aytadigan qoida hech qayerda yozilmagan, shuning uchun
yangi fayl odatda tekis ildizga tushadi.

Natijada bir mavzu bir necha joyga sochilgan: `lib/debt.ts`, `lib/debtAging.ts`,
`lib/debtReport.ts`; `lib/kpiLogic.ts`, `lib/kpiScoring.ts`, `lib/kpiEvidence.ts`,
`lib/kpiProjection.ts`, `lib/kpiLabels.ts`, `lib/fairKpi.ts`.

**Taklif.** §5 dagi chegara qoidasini `AGENTS.md` ga qo'shish va **yangi kod
yozilganda** amal qilish. Mavjud fayllarni ommaviy ko'chirish tavsiya
etilmaydi — u faqat git tarixini buzadi.

---

### D7 · 18 ta fayl 500 qatordan uzun 🟢

Eng kattalari:

```
1 704  components/OperationModule.tsx
1 391  server/bankImport.ts
1 274  components/CompanyDrawer.tsx
1 123  app/(dashboard)/kassa/kirim/KirimKassaClient.tsx
1 114  components/OnboardingWizard.tsx
```

`server/bankImport.ts` da 17 ta eksport qilingan action bor — bitta faylda
vipiska yuklash, moslashtirish, chiqim toifalash va oylik joylash.

**Taklif.** Refaktor sprinti **emas**. Shu fayllardan biriga tegilganda,
o'sha teginish doirasida bo'lak ajratiladi. `components/ui/` (25 primitiv) va
`DataTable` allaqachon bor — ajratilgan bo'lak ular ustiga tushadi.

---

### D8 · Foydalanilmagan indekslar 🟢

`idx_scan = 0` bo'lgan 25+ indeks. Ko'pchiligi §D3 dagi bo'sh jadvallarda —
ular D3 bilan birga ketadi. Lekin **jonli** jadvallarda ham bor:

```
LedgerEntry_transactionId_idx      (LedgerEntry — 6 572 qator)
PaymentAllocation_channelId_idx    (PaymentAllocation — 163 qator)
Company_debtNextContactAt_idx
CompanyAlias_companyId_idx         (CompanyAlias — 202 qator)
```

Kichik jadvalda Postgres indeksni ishlatmasligi normal (seq scan arzonroq), shuning
uchun bular shoshilinch emas. D3 bajarilgandan keyin qaytadan o'lchansin.

---

### D9 · Hujjat sochilishi 🟢

Repo ildizi va `docs/` da **32 ta `.md`**, ulardan 4 tasi to'liq audit:
`PROJECT_REVIEW.md` (2026-07-23), `ASRO_CPO_AUDIT.md` (2026-07-23),
`FINANCE_KPI_AUDIT.md` (2026-08-15), `KASSA_REVIEW.md` (2026-08-18) — va
endi beshinchisi (shu fayl).

`HANDOFF.md` ning o'zi ogohlantiradi: 2026-07-26 auditining "~60% i eskirgan".
Ya'ni muammo allaqachon tan olingan.

**Taklif.** Auditlarni `docs/audit/` ga ko'chirib, har birining boshiga bitta
holat qatori qo'yish (`AMALDA` / `QISMAN ESKIRGAN — o'rniga: X`). O'chirish
tavsiya etilmaydi: ular qaror tarixini saqlaydi.

---

### D10 · Tip chetlab o'tishlari 🟢

`any` / `as any` — **91 ta**, `@ts-ignore` / `@ts-expect-error` /
`eslint-disable` — **38 ta**. `tsc` toza bo'lgani shu 129 nuqta hisobiga
qisman. Fon ishi: yangi kodda qo'shilmasin, tegilgan joyda kamaysin.

---

## 4. Nima yaxshi ishlayapti

Qarz ro'yxati uzun ko'rinmasin — quyidagilar aynan **to'g'ri** qurilgan va
ular loyihaning asosiy qiymati:

- **Pul yo'li bitta darvozadan.** `lib/cashGate.ts` → `lib/ledger.ts` →
  `LedgerEntry` (6 572 qator). `assertSufficientFunds`, `assertPeriodOpen`,
  `serializable` TOCTOU qo'riqchisi — `server/transit.ts` `spendFromChannel`
  dagi izoh poyga qanday yopilganini yozib qo'ygan.
- **Moliyaviy yozuv jismonan o'chmaydi** (`deletedAt` + `reverseLedger`).
- **Ruxsat UI'da emas, action'da** — §2 ga qarang.
- **Domen bilimi kodda yozilgan.** Izohlar "nega shunday" ni tushuntiradi va
  ular real hodisalarga bog'langan (prefetch sikli, `partial` to'lov, davr qulfi).
- **73 ta test fayli**, jumladan `test/constitution.test.ts` — qoidalarni
  test bilan ushlab turadigan yondashuv.

---

## 5. Qatlam xaritasi

Amaldagi (va to'g'ri) oqim:

```
app/**            43 sahifa + 9 API route — faqat ko'rsatish va forma
  ↓ (server action chaqiruvi)
server/**         229 action · HAR BIRIDA qo'riqchi (server/guards.ts)
  ↓
lib/**            domen qoidalari — pul, davr, KPI, majburiyat
  ↓
prisma            yagona ma'lumot manbasi
```

`bot/` — parallel kirish nuqtasi (8 004 qator, 8 kontekst: digest 1 278,
monitoring 1 190, identity 1 183 …), bir xil Prisma va bir xil `lib/` ni
ishlatadi. Bu to'g'ri qaror (`kpi-bot-architecture-decision`).

**`lib/` uchun taklif qilinadigan chegara qoidasi** (D6):

| Papka | Nima tushadi |
|---|---|
| `lib/platform/` | rol, ruxsat, scope, audit — domendan mustaqil |
| `lib/domains/<nom>/` | bitta domenning qoidalari (`accounting` allaqachon shunday) |
| `lib/engines/<nom>/` | holat mashinasi / hisoblagich (obligation, automation, workflow) |
| `lib/*.ts` (tekis) | **faqat** sof yordamchi: `format`, `serialize`, `dateRange`, `phone` |

Yangi fayl tekis ildizga tushmasin, agar u sof yordamchi bo'lmasa.

---

## 6. Yopilish tartibi

**1-to'lqin — o'sishni to'xtatish** (kutgan sari qimmatlashadi)
1. **D1** — `ReportProof` / `Document` fayllarini `lib/engines/evidence/store.ts`
   orqali diskka. Yon foyda: **D4** yopiladi.
2. **D2** — bildirishnoma saqlash muddati + `bot/cron` tozalash vazifasi.

**2-to'lqin — sirtni kichraytirish**
3. **D5** — `Expense` → `KassaEntry`, jadval o'chadi (arzon, alohida bajarilsa bo'ladi).
4. **D3** — 29 bo'sh modelni ajratish, voz kechilganini migratsiya bilan olib
   tashlash. Yon foyda: **D8** ning katta qismi.

**3-to'lqin — shakl** (fon ishi, alohida sprint emas)
5. **D6** qoidasini `AGENTS.md` ga; **D7** faylga tegilganda bo'lish.
6. **D9** hujjatlarni `docs/audit/` ga + holat qatori; **D10** kamaytirish.

### D11 · Bank vipiskasidagi postlanmagan chiqim — YOPILDI (2026-09-01) ✅

`KASSA_REVIEW.md` §1 dagi 441,7 mln yopilganda (`KASSA_GAP_441M.md`) yonidan
alohida teshik chiqdi: avgustda **91 ta bank chiqimi / 73 323 355,03 so'm**
`unmatched` holatda — ya'ni `KassaEntry` ga ham, jurnalga ham tushmagan.

**Toifalagichda xato yo'q edi** — dastlabki tashxis noto'g'ri chiqdi.
"Maqsadda 16 raqam bormi" qidiruvi 20 xonali hisob raqamining ichiga ham
tushib, 53 ta komissiyadan 47 tasini "kartaga o'tkazma" ko'rsatgan. To'g'ri
qoida (`~` bilan ajratilgan aynan 16 raqam) bo'yicha bunday qator nolta.

**Bajarildi:** `scripts/post-bank-expenses.ts --apply` — 86 qator /
67 777 868,32 kassaga va jurnalga yozildi (101 ta kartaga o'tkazma va 5 ta
oylik ataylab olinmadi). `verify-kassa` ga yettinchi nazorat qo'shildi,
farq `test/bank-card-marker.test.ts` bilan qotirildi.

---

**Migratsiya eslatmasi.** `prisma migrate dev` ishlatilmaydi (schema'da commit
qilinmagan modellar bor — `AGENTS.md` "Tuzoqlar"). SQL qo'lda yoziladi, keyin
`migrate deploy`.

---

## 7. O'lchov skriptlari

Keyingi ko'rikda shu raqamlarni taqqoslash uchun.

```bash
# Tiplar
npx tsc --noEmit -p tsconfig.json

# Jadval qatorlari va hajmi (prod)
ssh -i ~/Downloads/ASRO.pem ubuntu@16.192.135.23 \
  'PGPASSWORD=root psql -U debora -h localhost -d inbola -c "
   select relname, n_live_tup, pg_size_pretty(pg_total_relation_size(relid)) sz
   from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 15"'

# Bildirishnoma o'sishi (D2)
... -c "select date_trunc('month',\"createdAt\")::date, count(*)
        from \"Notification\" group by 1 order by 1"

# Foydalanilmagan indekslar (D8)
... -c "select relname, indexrelname from pg_stat_user_indexes
        where idx_scan = 0 and indexrelname not like '%pkey%'"

# Model o'liklik darajasi (D3) — kodda necha marta chaqiriladi
for m in $(grep '^model ' prisma/schema.prisma | awk '{print $2}'); do
  lc=$(echo "$m" | sed 's/^\(.\)/\l\1/')
  echo "$(grep -rho "prisma\.$lc\b\|tx\.$lc\b" app lib server bot components scripts | wc -l) $m"
done | sort -n

# Tip chetlab o'tishlari (D10)
grep -rn ": any\|as any" app lib server components bot --include=*.ts --include=*.tsx | wc -l
grep -rn "@ts-ignore\|@ts-expect-error\|eslint-disable" app lib server components bot --include=*.ts --include=*.tsx | wc -l
```

Ruxsat qamrovini (§2) qayta o'lchash uchun skript: `server/*.ts` dagi har
`export async function` tanasida `require[A-Z]\w*\(|auth\(\)|assertRole|
isAdminRole|currentUserViews|companyScopeWhere` qidiriladi. **Muhim:** funksiya
tanasini `^}` bo'yicha kesish noto'g'ri — ko'p qatorli parametr obyekti `}) {`
bilan tugaydi va skan tanani bo'sh deb o'qiydi (shu xato dastlab 53 ta soxta
signal bergan edi). Tana keyingi `export async function` gacha olinsin.
