# Kassa moduli — UX review va qayta loyihalash rejasi

**Sana:** 2026-08-25 · **Shox:** `nextjs-v2` · **Qamrov:** 4 ta sahifa (~5 200 qator UI),
`server/kassa.ts`, `server/kassaReport.ts`, `server/bankImport.ts`, eski modullar
(`KassaModule`, `ExpenseModule`)

Bu hujjat kassa modulining ISHLATISH QULAYLIGINI ko'rib chiqadi. Ma'lumot qatlami
holati alohida yozilgan: `KASSA_REVIEW.md` (takroriylik, 2026-08-18) — undagi
og'ir ishlar bajarilgan, bu yerda takrorlanmaydi.

---

## 0. Bir jumlada

Server qatlami (yozuv yo'li, jurnal, tasdiq oqimi, RBAC) **yaxshi holatda**.
Muammo UI qatlamida: bir sahifada ikki xil dizayn tili yashaydi, kundalik
kiritish (firma tanlash, tez yozuv) og'riqli, bir xil ma'lumot 2–3 ekranda
ko'rinadi va filtrlar URL'ga bog'lanmagan — F5 bosilsa hammasi yo'qoladi.

---

## 1. Nima YAXSHI ishlayapti (tegmang)

- **Bitta yozuv yo'li:** `createKassaEntry` → tasdiq chegarasi → `postExpenseLegs`.
  Jurnalsiz kassa yozuvi paydo bo'la olmaydi (`server/kassa.ts:125`).
- **Expense → KassaEntry birlashtirilgan**, `getKassaSummary` o'lik kod sifatida
  olib tashlangan, `getCashByChannel` endi kanal qoldig'ining kanonik manbasi.
- **Bo'lim navigatsiyasi** (`KassaSectionNav`) — RBAC bilan bir manba,
  mobil'da grid bilan sig'adi.
- **Har tab bitta savolga javob beradi** — qarzdorlikning 9 bloki 4 tabga
  yig'ilgan; hisobotlar `/kassa` da `<details>` ichida yig'ilgan.
- **Xato xabarlari tushunarli** — vipiska yuklashda server xatosi ekranga
  chiqadi (toast emas), ikki xil "hisob topilmadi" muammosi ajratilgan.
- Typecheck toza (`npx tsc --noEmit` → exit 0).

---

## 2. Muammolar

### A. Bir sahifada ikki xil dizayn tili

Yangi sahifalar toza stilga ega (var(--token), ixcham jadval), lekin ichiga
ko'chirilgan eski modullar o'z dunyosini olib keladi:

| Joy | Eski komponent | Muammosi |
|---|---|---|
| Qarzdorlik → "To'lovlar" tab | `components/KassaModule.tsx` (487 qator) | Gradient kartochka, UPPERCASE mikro-yozuvlar, `translations[lang]` tizimi, o'z qidiruvi va oy pickeri |
| Chiqim → "Xarajat" tab | `components/ExpenseModule.tsx` (573 qator) | O'z balans kartasi, o'z formasi — sahifa qolganiga o'xshamaydi |

Foydalanuvchi bitta bo'limda sahifa almashtirgandek stil almashadi — "noqulay"
degan his-tuyg'uning asosiy manbalaridan biri shu.

### B. Kundalik kiritish og'riqli

1. **Firma tanlash hamma joyda native `<select>`**
   - Qo'lda kirim: `app/(dashboard)/kassa/kirim/KirimKassaClient.tsx:533`
   - Bog'lanmaganlar navbati: shu fayl :1090
   - Yuzlab firma orasidan qidiribsiz tanlash mumkin emas. Loyihadagi eng
     katta kundalik friction shu. `components/ui/` da combobox yo'q.

2. **Jurnal tez kiritishida firma umuman yo'q** —
   `JournalClient.tsx:156` `createKassaEntry` ni `companyId`siz chaqiradi →
   nomsiz yozuv. Pastdagi matn "/kassa/kirim ga boring" deydi (:404) —
   foydalanuvchi boshqa sahifaga haydaladi.

3. **Enter faqat izoh maydonida saqlaydi** (`JournalClient.tsx:395`) —
   summa/toifa/kassada Enter ishlamaydi, sichqoncha majburiy.

4. **Tab va filtrlar URL'da emas:**
   - Kirim tablari: `useState("reyestr")` (`KirimKassaClient.tsx:93`)
   - Qarzdorlik tablari: `QarzdorlikClient.tsx:150`
   - Jurnal preset/kind/kassa/qidiruvi: hammasi lokal state
   Faqat chiqim `?tab=` ni biladi. F5 → holat yo'qoladi, havola ulashib
   bo'lmaydi. (`UI_AUDIT_2026-07.md` da ham xuddi shu topilgan edi.)

5. **Duplikat ogohlantirishi 2 bosqichli** — avval "Saqlash", keyin inline
   warning, keyin "Baribir saqlash" (`KirimKassaClient.tsx:215-229`).

6. **Stat kartochkalarda button-ichida-button hack** —
   `KirimKassaClient.tsx:418-469`: butun karta `<button>`, ichida yana
   `role="button" tabIndex={-1}` plius belgisi. Klaviatura uchun buzilgan.

### C. Bir xil ma'lumot 2–3 joyda

- **Pending xarajat tasdig'i:** jurnal satrida (`JournalClient.tsx:507-511`)
  VA ExpenseModule ichida (`ChiqimKassaClient.tsx:482-497`). Buxgalter bir xil
  tugmani ikki joyda ko'radi — qaysi biri "haqiqiy" oqim ekanligi noaniq.
- **Balans raqami 3 kontekstda:** `/kassa` dagi BalanceOverview, chiqim
  "Xarajat" tabidagi `expenseBalance`, qarzdorlik "To'lovlar" tabidagi
  KassaModule statlari. Uchtasi turbiroq asosdan hisoblanadi va raqamlar
  mos kelmasa ishonch ketadi.

### D. Texnik qarz

- `JSON.parse(JSON.stringify(...))` 8 joyda (3 ta page.tsx da) —
  `lib/serialize.ts` mavjud, ishlatilmagan.
- Jurnal 1000 qatorgacha DOM'ga mount qiladi — virtualizatsiya yo'q;
  `@tanstack/react-virtual` allaqachon `package.json` da bor.
- Kassa sahifasi ~8 ta so'rov tugmaguncha butunlay bloklanadi — route-level
  `loading.tsx` / `<Suspense>` yo'q (faqat `(dashboard)` umumiy darajada).
- Inline `style={{ }}` kassa fayllarida ~500 ta (butun loyihada 2 049 —
  qarang `docs/UI_AUDIT_2026-07.md`).
- `useAutoRefresh` har 15s da butun sahifani refresh qiladi — og'ir oylik
  hisobotlar bilan birga DB yukini oshiradi.

---

## 3. Qayta loyihalash rejasi

Har bosqich mustaqil build/deploy qilinadi. Tartib muhimligi sababi:
Faza 0 komponentlari qolgan hamma fazada ishlatiladi.

### Faza 0 — Asos ✅ BAJARILDI (2026-08-31)

- [x] `components/ui/CompanySelect.tsx` — qidiriladigan combobox:
      **nom VA STIR** bo'yicha qidiruv, ↑↓/Enter/Escape, taklif guruhi
      ro'yxat tepasida. O'zaro ta'sir naqshi `GlobalSearch` dan olindi
      (noldan yozilmadi); ko'rinish `.erp-input`.
- [x] URL holati — yangi hook YOZILMADI: mavjud `hooks/useTabParam.ts` +
      `lib/tabs.ts` naqshi yetarli edi (`lib/kirimTabs.ts` qo'shildi).
      Rejadagi `useQueryParam` — ortiqcha abstraksiya bo'lardi.
- [x] `hooks/useDismissable.ts` uchinchi argument oldi (`ignoreRef`) —
      PORTALdagi panel uchun: tetik "tashqi bosish" deb sanalmasin.

### Faza 1 — Kirim ekrani ✅ BAJARILDI (2026-08-31)

- [x] Firmali selectlar → `CompanySelect` (3 joy: qo'lda forma, navbat,
      reyestr filtri).
- [x] Tablar `?tab=` da (`useTabParam` + serverda `readTabParam`).
- [x] Forma `<form onSubmit>` — istalgan maydonda Enter saqlaydi.
      **Butun kassa modulida bu BIRINCHI `onSubmit` edi.**
- [x] Duplikat oqimi `useConfirm` dialogiga o'tdi — 2 bosish → 1.
- [x] Navbatda BITTA aniq STIR-taklif bir bosishli chipga chiqarildi.
- [x] Qolgan 3 ta kichik tanlagich `ui/Select` ga (bir formada ikki xil
      maydon ko'rinishi qolmasin).
- [x] Button-ichida-button hack — allaqachon tuzatilgan edi (tekshirildi).

### Faza 2 — Jurnal (1 kun)

- [ ] Filtrlar (preset/kind/kassa/qidiruv) URL query'ga ko'chadi.
- [ ] Tez kiritish formasi `onSubmit` orqali — Enter har joyda saqlaydi.
- [ ] 100 qator + "Yana 100" ko'rsatish (virtualizatsiya keyin, agar kerak bo'lsa).
- [ ] **Ehtiyotkorlik qarori:** tez kiritishga firma maydoni QO'SHILMAYDI —
      `KassaEntry(income)` mijoz qarzini kamaytirmaydi (AGENTS.md tuzog'i).
      Variant: kirim turini jurnaldan olib tashlab, `/kassa/kirim?add=1` ga
      deep-link berish. Qaror egasi — buxgalter o'zi.

### Faza 3 — Chiqim ekrani (1–2 kun)

- [ ] `ExpenseModule` o'rniga jurnalning chiqim-kesimi ko'rinishi
      (yangi stil, Bitta tasdiq nuqtasi). −573 qator eski UI ketadi.
- [ ] `ExpenseQueue` ga qator tanlash (checkbox) + tanlanganlarga massiv amal
      (toifa-bo'yicha bulk allaqachon bor, satr tanlash qo'shiladi).

### Faza 4 — Qarzdorlik ekrani (1 kun)

- [ ] `KassaModule` ni `DataTable` asosida yangi stilda qayta yozish:
      status matni o'zbekcha (hozir `PAID`/`PENDING` xom enum chiqadi),
      modal `ui/Modal` asosiga o'tadi (`role="dialog"`), stats faqat
      `debtByCompany` dan o'qiydi. −400 qator eski UI ketadi.

### Faza 5 — Silliqlik (1 kun)

- [ ] Route-level `loading.tsx`; hisobotlar `<Suspense>` ichida stream bo'ladi.
- [ ] `JSON.parse(JSON.stringify())` → `serialize()` (8 joy).
- [ ] Kassa sahifalarida autoRefresh intervali 30s (jurnalda 15s qoladi).

### Har fazadan keyin majburiy tekshiruv

```bash
npx tsc --noEmit -p tsconfig.json
npm run build
npx vitest run          # tegishli test fayllari
```

### Hajm

| Faza | Ish | Taxmin |
|---|---|---|
| 0 | CompanySelect + useQueryParam | yarim kun |
| 1 | Kirim | 1 kun |
| 2 | Jurnal | 1 kun |
| 3 | Chiqim | 1–2 kun |
| 4 | Qarzdorlik | 1 kun |
| 5 | Silliqlik | 1 kun |
| **Jami** | | **~5–6 ish kuni** |

---

## 4. Nima QILMASLIK kerak

- **Jurnal tez kiritishga `applyAllocation` bog'lamang** — `KassaEntry(income)`
  va `Payment+PaymentAllocation` ikkalasiga yozish bitta pulni ikki marta
  sanaydi (AGENTS.md).
- **Oylik hisobotlarni jurnalga aralashtirmang** — `getMonthBreakdown`
  oylik kesim, `getAvailableBalance` yig'ma; ularni bir raqamga birlashtirish
  rahbarni chalg'itadi (AGENTS.md tuzog'i, BalanceOverview.tsx:26 izohida
  yozilgan).
- **`useAutoRefresh` ni butunlay olib tashlamang** — ko'p seansli ishda
  yangilanish kerak; interval va qamrovni sozlash yetarli.
- **Eski modullarni "bir oz yangilab" qoldirmang** — KassaModule va
  ExpenseModule ning maqsadi ularni BUTUNLAY olib tashlash; yarim migratsiya
  uchinchi dizayn tilini tug'diradi.
