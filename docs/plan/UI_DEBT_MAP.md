# UI DEBT MAP — ASRO

**Sana:** 2026-08-31 · **Shox:** `nextjs-v2` · **Asos:** `docs/UI_AUDIT_2026-07.md` (4.2/10)

Bu hujjat auditning davomi emas, uning **hisobkitob varag'i**: har bir qarz turi
qaysi faylda, qanchaligi, qaysi primitiv bilan yopilishi va navbati.
Har bir raqam `grep` bilan olingan va qayta o'lchash mumkin (pastda buyruqlar).

---

## 0. Muhim tuzatish — bazaviy raqamlarning ikkitasi noto'g'ri o'qilgan

Ishni boshlashdan oldin uchta ko'rsatkich qayta o'lchandi va ikkitasi
**muammoni bo'rttirib ko'rsatayotgani** aniqlandi. Bu tekinga ish qilishdan
saqladi:

| Ko'rsatkich | Aytilgan | Haqiqat | Nima uchun farq qiladi |
|---|---:|---|---|
| `loading.tsx` | 4 / 43 route | **Qamrov ~100%** | Next.js'da `loading.tsx` ROUTE GROUP darajasida ham ishlaydi. `app/(dashboard)/loading.tsx` va `app/(admin)/loading.tsx` o'z guruhidagi HAMMA sahifani qoplaydi. 43 ta nusxa yozish — foyda emas, yangi qarz. |
| `components/ui` import qiluvchi fayllar | 11 | **62** | 11 — faqat `from "@/components/ui"` (barrel) yozganlar. Ko'pchilik faylni to'g'ridan-to'g'ri (`./ui/Button`) import qiladi. |
| `style={{ }}` | 2 632 | 2 595, shundan **2 327 tasi TOKENLI** | Ularning 90%i `var(--token)` yozadi, ya'ni dizayn tizimining O'ZI. Haqiqiy buzilish — 62 ta xom rang (hex/rgba). |

**Xulosa:** "2 632 ta inline style" — soxta signal. Uni ta'qib qilish ~2 300 ta
to'g'ri qatorni tegib chiqish, natijasi nol. Haqiqiy qarz pastda.

---

## 1. Xom `<button>` — 265 ta, 65 faylda

**Nega muhim:** har fork o'z rangini tanlaydi va HAMMASI `text-white` ni
qotiradi. Qorong'i temada `--brand` yorishadi, matn esa oq qolib, tugma
o'qilmay qoladi. `Button` primitivi `--on-brand` tokenini ishlatadi.

| Fayl | Soni | Jiddiylik | Primitiv | Navbat |
|---|---:|---|---|---|
| ~~`components/CompanyDrawer.tsx`~~ | ~~27~~ → **1** | ✅ | `Button` | **bajarildi** |
| `components/OperationModule.tsx` | 18 | Yuqori | `Button` | **1** |
| `components/OrganizationModule.tsx` | 14 | Yuqori | `Button` | **2** |
| `components/StaffModule.tsx` | 12 | O'rta | `Button` | 3 |
| `components/ExpenseModule.tsx` | 10 | O'rta | `Button` | 4 |
| `components/ReportInsightModal.tsx` | 9 | O'rta | `Button` | 5 |
| `StaffDrawer` / `ReportProofModal` / `PayrollTable` / `ImageZoomModal` | 8 | O'rta | `Button` | 6 |
| qolgan 57 fayl | ≤7 | Past | `Button` | fon |

**Istisnolar (ataylab qoldirilgan):**
`components/CompanyDrawer.tsx` — 1 ta: maydonga yopishgan `%`/`UZS`
o'lchov-birligi tugmasi (input-affix). `Button` o'z radiusi va
`uppercase tracking-widest` tipografiyasi bilan maydon bilan bir butun
ko'rinishni buzadi; bitta joy uchun "affix" varianti qo'shish — forkning
boshqa turi. `eslint-disable-next-line` + izoh bilan hujjatlashtirilgan,
fayl bazaviy ro'yxatdan CHIQARILDI.

`components/operation/StatusCell.tsx` — 3 ta.
Matritsa katagi 24×28px, `Button` esa `uppercase tracking-widest` bilan
kelib, zich jadvalda buziladi. Bu yerda xom `<button>` — TO'G'RI qaror,
`aria-*` va fokus qo'lda berilgan.

---

## 2. Xom `<table>` — 28 faylda

Auditning "hammasini `DataTable` ga ko'chir" tavsiyasi **noto'g'ri** bo'lardi.
Jadvallar tasniflandi:

| Toifa | Fayl soni | Qaror |
|---|---:|---|
| **Statik / 3-10 qatorli ro'yxat** (`RolePermissionMatrix`, `RoleViewEditor`, `CategoryBreakdown`, `InvoiceDocument`, `SverkaMatrix`, `ShiftCoverPanel`, `BusinessCalendarClient`) | 7 | `.erp-table` sinfi. `DataTable` (saralash+tanlash+eksport) bu yerda ortiqcha yuk. |
| **Interaktiv ro'yxat** — saralash/filtr/sahifalash allaqachon QO'LDA yozilgan | 6 | **`DataTable` ga ko'chirilsin.** Aynan shu yerda foyda bor. |
| **Matritsa shaklidagi** (`OperationModule`, `SverkaMatrix`, `PayrollDrafts`) | 3 | `DataTable` MOS EMAS — muzlatilgan ustunlar, guruh sarlavhalari, virtualizatsiya. O'z yo'lida qoladi. |
| **Pul reyestri** (kassa oilasi) | 12 | Aralash; avval `DataTable` ning pul ustuni qo'llab-quvvatlashi tekshirilsin. |

### `DataTable` ga ko'chirish navbati

| Fayl | LOC | Qo'lda yozilgani | Navbat |
|---|---:|---|---|
| ~~`app/(dashboard)/deadlines/WorkInboxClient.tsx`~~ | ~~613~~ → **249** | **bajarildi** → `DataTable` | ✅ |
| `components/AuditLogModule.tsx` | 233 | filtr | **1** |
| `components/admin/AdminUserManager.tsx` | 319 | filtr | 2 |
| `app/(dashboard)/kassa/kirim/IncomeRegister.tsx` | 366 | filtr | 3 |
| `app/(dashboard)/kassa/chiqim/ExpenseQueue.tsx` | 315 | filtr | 4 |
| `app/(dashboard)/kassa/JournalClient.tsx` | 546 | filtr | 5 |

> **O'LCHOV XATOSI — tuzatildi.** Yuqoridagi "qo'lda yozilgani" ustuni
> `grep -c "filter\|Filter"` bilan olingan edi va u `Array.filter()`
> chaqiruvlarini ham sanagan. `WorkInboxClient` da 13 ta FILTR emas,
> **4 ta yorliq** bor edi; "qo'lda sahifalash" ham yo'q edi (`Yana 50 ta`
> tugmasi bilan bosqichma-bosqich chizish), saralash esa bitta qotirilgan
> tartib edi. Qolgan qatorlarni ishga olishdan oldin FAYLNI OCHIB tekshiring,
> `grep` soniga ishonmang.

---

## 3. Inline style — 2 583 ta, lekin qarz 60 ta

| Toifa | Soni | Qaror |
|---|---:|---|
| **A. Tokenli** (`var(--…)`) | 2 327 | **TEGILMAYDI.** Bu dizayn tizimining o'zi. Tailwind v4 bu tokenlarni utility sifatida bermaydi. |
| **B. Xom rang** (hex / rgba) | **60** | **QARZ — tuzatilsin.** Pastdagi jadval. |
| **C. Dinamik** (hisoblangan kenglik, `transform`) | ~45 | To'g'ri — CSS bilan yozib bo'lmaydi. |

| Fayl | Xom rang | Jiddiylik | Izoh |
|---|---:|---|---|
| `app/(admin)/admin/crm/page.tsx` | 19 | Yuqori | `var(--token, #hex)` shaklidagi ZAXIRA qiymatlar — boshqa palitradan (to'q binafsha `#1a1a2e`). Token yo'qolsa sahifa begona temada chiziladi. |
| `app/(auth)/login/page.tsx` | 12 | O'rta | Brend gradienti — ataylab bo'lishi mumkin, tekshirilsin. |
| `app/portal/page.tsx` | 6 | O'rta | Portal alohida tema — asoslansin yoki tokenga o'tsin. |
| `components/OnboardingWizard.tsx` | 4 | Past | |
| qolganlari (7 fayl) | ≤2 | Past | |

~~`app/(dashboard)/director/page.tsx` — 21~~ → **bu o'tishda tuzatildi** (4-bo'lim).

---

## 3b. Xom `<select>` — 58 ta, 29 faylda (yangi bo'lim)

`components/ui/Select` **yaratildi** (2026-08-31). O'lchov: 75 ta xom
tanlagichdan **60 tasi uslubni qayta yozardi** (`style={{ background:
'var(--input-bg)', border: '1px solid var(--card-border)' }}` + har ekranda
o'z `INPUT_CLASS`/`inputStyle` konstantasi), atigi 15 tasi `.erp-input`
sinfidan foydalanardi. Ramka rangi bir ekranda `--card-border`, boshqasida
`--input-border` edi.

**Migratsiya qilindi (17 ta, 6 fayl):** `WorkTaskForm` · `WorkInboxColumns`
(zich, `size="sm"`) · `MyCabinet` · `KPIRulesManager` · `StaffModule` (4/6) ·
`ui/FundingSourceSelect` (u ham o'z uslubini yozardi).

**Hujjatlashtirilgan istisnolar:** `StaffModule` (2) va `DocumentsModule` (1)
— CHAP tomonida ikonkasi bor tanlagich (`pl-12`). Butun ilovada 3 ta; primitivga
`icon` sloti qo'shish uchun yetarli dalil emas. Kodda izoh bilan belgilangan.

**Darvoza:** xom `<select>` endi `no-restricted-syntax` xatosi,
`RAW_SELECT_BASELINE` bilan. Bazaviy bloklar ENDI GENERATSIYA QILINADI —
uch qoida × sakkiz kombinatsiyani qo'lda yozish xatoga olib kelardi.

---

## 4. Ulkan komponentlar (>800 qator)

| Fayl | LOC | Mas'uliyatlar | Navbat |
|---|---:|---|---|
| ~~`OperationModule.tsx`~~ | ~~2 444~~ → **1 703** | **bu o'tishda ajratildi** → `components/operation/` | ✅ |
| ~~`CompanyDrawer.tsx`~~ | ~~1 558~~ → **1 273** | **ajratildi** → `components/company-drawer/` | ✅ |
| `OnboardingWizard.tsx` | 1 114 | ko'p qadamli forma | **1** |
| `cabinets/MyCabinet.tsx` | 861 | 4 jadval + KPI | 2 |
| `OrganizationModule.tsx` | 821 | jadval + karta + drawer boshqaruvi | 3 |

**Ajratish qolipi** (`components/operation/` da qo'llangan):
`matrixVisuals.ts` (rang/belgi, React'siz) · `types.ts` · `StatusCell.tsx`
(katak + menyu) · `OperationRow.tsx` (qator) · ota-komponent = **orkestratsiya**.

---

## 5. Regressiya darvozasi (`eslint.config.mjs`)

Uchta qoida, `no-restricted-syntax` orqali, `components/ui/**` dan tashqari
hamma joyda:

1. **Dialog** — `fixed inset-0` qo'lda yozilgan qatlam (bazaviy ro'yxatsiz,
   migratsiyasi tugagan).
2. **Xom `<button>`** — bazaviy ro'yxat bilan.
3. **Xom `<table>`** — `className` da `erp-table` YO'Q bo'lsa. `.erp-table`
   bilan yozilgan statik jadval — ruxsat etilgan yo'l.
4. **Xom `<select>`** — bazaviy ro'yxat bilan (3b-bo'lim).

**Bazaviy ro'yxat qanday ishlaydi:** `RAW_BUTTON_BASELINE` va
`RAW_TABLE_BASELINE` — fayl nomlari ro'yxati. Yangi fayl ro'yxatda yo'q →
qoida darhol ishlaydi. Eski faylni ko'chirdingiz → **nomini ro'yxatdan
o'chiring**, u qayta qarzga tusha olmaydi.

> Ro'yxat faqat qisqarishi kerak. Uzayishi = regressiya.

Darvoza sinaldi: ro'yxatda bo'lmagan yangi faylda `<button>` + sinfsiz
`<table>` → 2 ta **error**; bazaviy fayl → 0.

---

## 6. Qayta o'lchash

```bash
grep -rn 'style={{' components app --include=*.tsx | wc -l                    # jami inline
grep -rho 'style={{[^}]*}' components app --include=*.tsx | grep -c 'var(--'  # tokenli (qarz EMAS)
grep -rho 'style={{[^}]*}' components app --include=*.tsx | grep -cE '#[0-9a-fA-F]{3,6}|rgba?\('  # QARZ
grep -rno '<button' components app --include=*.tsx | wc -l
grep -rl '<table'  components app --include=*.tsx | grep -vc '^components/ui/'
npx eslint            # darvoza: 0 error bo'lishi shart
```
