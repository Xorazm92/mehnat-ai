# Kassa moduli — takroriylik ko'rigi

**Sana:** 2026-08-18 · **Manba:** prod bazasi (o'qish) · **Qamrov:** 4 277 qator server/lib + 3 127 qator UI

Bu hujjat kassa modulidagi TAKRORIYLIKNI sanaydi: bir xil ish necha joyda
qilinadi, qaysi kod o'lik, va nimani nima bilan birlashtirish kerak.

---

## 0. Bir jumlada

Kassada **ikkita parallel "pul chiqdi" jadvali** bor va ulardan biri amalda
o'lik. Shu ajratmadan kelib chiqib, prodda **441,7 mln so'mlik karta xarajati
balansga umuman kirmayapti**. Qolgan takroriyliklar mayda (helper nusxalari),
lekin ular ham bir xil ildizdan: umumiy qatlam yo'q joyda har modul o'zi yozgan.

---

## 1. ENG KATTASI — `Expense` va `KassaEntry(expense)`

Ikkala jadval ham bitta savolga javob beradi: "pul chiqdi". Prod holati:

| Jadval | Qatorlar | Summa |
|---|---|---|
| `Expense` | **3 ta, hammasi `pending`** | 63 048 000 |
| `KassaEntry(expense)` | 691 ta | 32 312 100 |

`Expense` atrofida to'liq modul qurilgan va u **ishlatilmayapti**:

- tasdiq oqimi (1 mln avto · 1–10 mln bosh buxgalter · >10 mln superadmin)
- `approveExpense` / `rejectExpense` / `updateExpense` / `deleteExpense`
- alohida ekran `/expenses` + `components/ExpenseModule.tsx` (559 qator)
- `lib/balance.ts`, `lib/monthClose.ts`, `lib/reconciliation.ts`,
  `scripts/backfill-ledger.ts` — hammasida alohida `Expense` shoxi

Ya'ni oltita modul ikkinchi jadval uchun alohida kod olib yuradi, holbuki
u nol tasdiqlangan qatorga ega.

### Oqibati — 441,7 mln balansdan tushib qolgan

`lib/transit.ts` qoidasi: kartadan xarajat `TransitEntry(out)` **va**
`KassaEntry(expense)` yozadi — balans ikkinchisidan o'qiydi. Lekin prodda:

```
TransitEntry(out):            125 ta / 441 753 336 so'm
  KassaEntry bilan bog'langan:  0 ta / 0
  BOG'LANMAGAN:               125 ta / 441 753 336   ← balansda YO'Q
```

Import skripti `recordTransitOut` ni chetlab o'tib to'g'ridan-to'g'ri
`TransitEntry` yozgan. Natijada karta qoldig'i to'g'ri, firma balansi esa
441,7 mln ga **ortiqcha** ko'rsatmoqda (666 mln raqamining ichida).

**Tavsiya:** `Expense` ni `KassaEntry` ga yig'ish — tasdiq maydonlari
(`status`/`approvedBy`/`approvedAt`) `KassaEntry` ga ko'chadi, `Expense`
jadvali va `/expenses` ekrani olib tashlanadi. Bitta "pul chiqdi" jadvali
qolsa, tranzit bog'lanmagan qator umuman paydo bo'la olmaydi.

---

## 2. O'LIK KOD

| Nima | Qayerda | Holat |
|---|---|---|
| `getKassaSummary` | `server/kassa.ts:200` | **hech kim chaqirmaydi** |
| `getCashByChannel` | `lib/ledger.ts` | **hech kim chaqirmaydi** (Faza 1 da qo'shildi) |
| `getSubjectBalances` | `lib/ledger.ts` | **hech kim chaqirmaydi** (Faza 1 da qo'shildi) |
| `Expense` tasdiq oqimi | `server/kassa.ts` | 0 ta tasdiqlangan qator |

`getCashByChannel` ayniqsa muhim: u kanal qoldig'ini **jurnaldan** hisoblaydi,
`getChannelBalances` esa **`TransitEntry` dan**. Ya'ni endi kanal qoldig'ining
IKKI mustaqil manbai bor va ular hech qachon solishtirilmaydi. Bu aynan
tuzatayotgan xatolar sinfi — men uni Faza 1 da o'zim qo'shganman.

---

## 3. HELPER NUSXALARI

### Davr kaliti — 6 nusxa

```
lib/debt.ts:53                    periodKeyOf   → "YYYY-MM"
lib/cashGate.ts:58                periodOf      → "YYYY-MM"
lib/bank/importStatement.ts:224   periodOf      → "YYYY-MM"  (eksport qilingan)
server/kassa.ts:33                monthOf       → "YYYY-MM"
scripts/backfill-ledger.ts:49     periodOfDate  → "YYYY-MM"
scripts/backfill-financial-core.ts:19  monthOf  → "YYYY-MM"
```

Ustiga **NOM TO'QNASHUVI**: `periodKeyOf` `lib/debt.ts` da satr qaytaradi,
`lib/periodLock.ts` da esa `{year, month}` obyekti. Bir xil nom, boshqa tip —
noto'g'ri import qilinsa TypeScript ushlaydi, lekin o'qiyotgan odam adashadi.

**Tavsiya:** `lib/periods.ts` allaqachon bor (`normalizePeriodKey`,
`toYearMonthKey`, `periodsEqual`). Hammasi shundan olsin.

### Summa formatlash — 6 nusxa

`lib/balance.ts:271`, `render-director-report.ts:23`, `backfill-ledger.ts:48`,
`ExpenseModule.tsx:178`, `BalanceOverview.tsx:8`, `HisobotlarModule.tsx:32`.

Uchtasi `toLocaleString("ru-RU")`, uchtasi `formatNum`. `lib/format.ts`
`formatNum` yagona manba bo'lishi kerak edi — hydration xatosi aynan shundan
chiqqan (xotira: `hydration-safe-date-formatting`).

### Rol darvozalari — har faylda qayta yozilgan

`requireAdmin` 4 faylda, `requireSenior` 3 faylda, `requireKassa` 2 faylda —
har biri bir xil 6 qator (`auth()` → rol → `Forbidden`).

**Tavsiya:** `lib/guards.ts` — `requireRole(predicate, label)` bitta joyda.

---

## 4. QARZ FORMULASI — hali 3 joyda

| Joy | Holat |
|---|---|
| `lib/debt.ts` | kanonik, testlangan |
| `components/KassaModule.tsx:83` va `:304` | **inline nusxa, BIR FAYLDA IKKI MARTA** |
| `bot/contexts/billing/domain/debt.ts` | ataylab alohida (sof domen), hujjatlangan |

Uchinchisi to'g'ri qaror. Ikkinchisi tuzatilishi kerak: klient qayta
hisoblamasin, serverdan tayyor raqam olsin. Ustiga u `PAYMENT_TERM_MONTHS` ni
bilmaydi, ya'ni ekranda "iyulning puli avgustda" qoidasi ishlamaydi.

---

## 5. BALANS — 4 xil hisob

| Funksiya | Nimani sanaydi |
|---|---|
| `getAvailableBalance` (`lib/balance.ts`) | Payment + Kassa + Expense + Payout |
| `getLedgerCashBalance` (`lib/ledger.ts`) | jurnal CASH |
| `getKassaSummary` (`server/kassa.ts`) | faqat KassaEntry — **o'lik** |
| `getBankCabinetData` (`server/cabinet.ts:452`) | KassaEntry, createdBy bo'yicha |

Prodda birinchi ikkitasi: **666 019 900 ↔ 2 500 000**. Farq backfill
bosilmagani uchun (815 qator kutmoqda).

---

## 6. TO'G'RI QILINGAN (tegmang)

- **`lib/transitChannels.ts`** — konstantalar sof modulda, `lib/transit.ts`
  qayta eksport qiladi. Mijoz/server chegarasi uchun ataylab ajratilgan va
  sababi fayl boshida yozilgan. Bu dublikat emas, naqsh.
- **`bot/contexts/billing/domain/debt.ts`** — eskalatsiya darajasi uchun sof
  domen; `lib/debt.ts:21-24` nima uchun birlashtirilmaganini tushuntiradi.
- **`lib/bank/*`** — parserlar formatga qarab ajratilgan, takror yo'q.

---

## 7. TAVSIYA QILINGAN TARTIB

| # | Ish | Foyda | Hajm |
|---|---|---|---|
| 1 | Tranzit chiqimini `KassaEntry` ga bog'lash (125 qator) | 441,7 mln balansga qaytadi | skript, 1 kun |
| 2 | Backfill `--apply` | ikki balans yaqinlashadi | 1 buyruq |
| 3 | `Expense` → `KassaEntry` birlashtirish | −1 jadval, −559 qator UI, −6 modulda shox | 3–4 kun |
| 4 | `KassaModule.tsx` inline qarzini serverdan olish | "iyul puli avgustda" ekranda ham to'g'ri | yarim kun |
| 5 | Helper nusxalarini yig'ish (davr, som, guard) | −6 nusxa, nom to'qnashuvi ketadi | 1 kun |
| 6 | O'lik kodni olib tashlash (`getKassaSummary`, `getCashByChannel`, `getSubjectBalances`) | −3 funksiya | 1 soat |

1 va 2 birinchi: ular raqamni to'g'rilaydi. 3 eng katta ixchamlashtirish.
4–6 tozalash.

---

## 8. Nima QILMASLIK kerak

- **`TransitEntry` ni tashlab yubormang.** U kanal qoldig'ini beradi va
  `KassaEntry` bunga javob bera olmaydi (kartaga kirim xarajat emas).
- **Kanal qoldig'ini ikki manbadan hisoblashni davom ettirmang** — biri
  tanlansin (`TransitEntry`), ikkinchisi (`getCashByChannel`) o'chirilsin
  yoki sverkada solishtirilsin.
- **`lib/kassaCategories.ts` ni kodga qaytarmang** — u sozlamada bo'lgani
  to'g'ri qaror.
