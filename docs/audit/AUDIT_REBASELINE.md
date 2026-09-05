# UI/UX audit — qayta bazalash

> **Holat: TARIX** · 2026-08-07 — o'sha kungi tashxis — bugungi kod bilan qayta solishtirilmagan.
> `UI_AUDIT_2026-07.md` ning qayta bazalashi.
> Amaldagi hujjatlar xaritasi: [`docs/README.md`](../README.md)

**Sana:** 2026-08-07 · **Asl audit:** 2026-07-26, `hardening/sprint-1` shoxi

Asl audit `product/constitution` shoxidagi ishdan **oldin** yozilgan. Uning taxminan
60% i eskirgan. Bu hujjat nima yopilganini va nima qolganini qayd etadi.

> **Asl auditni xom holida ishlatmang.** U sizni allaqachon tuzatilgan narsalarga
> yuboradi. Quyidagi jadval uning o'z metrikalari bo'yicha qayta o'lchandi.

---

## Yopilgan — regressiya bo'lmasa qayta ko'tarilmasin

| Audit | 2026-07-26 | 2026-08-07 | Qayerda |
|---|---|---|---|
| **C1** kredensiallar Excel eksportida | `['…','Login','Parol',…]` | eksportdan chiqarilgan | `OrganizationModule.tsx:244` — sababi izohda |
| **C2** yangi xodim paroli 15s toast'da | bor | yo'q | `StaffModule.tsx` |
| **C3** `window.confirm` | 15 | **0** | `components/ui/ConfirmDialog.tsx` |
| **S5** `window.alert` | 20 | **0** | — |
| **S5** `window.prompt` | 3 | **0** | `usePrompt()` primitivi |
| **C4** DB yiqilganda `percent: 100` | bor | yo'q | `dashboard/page.tsx:26` — sababi izohda |
| **C5** dialog semantikasi | 0 fayl | 4 fayl + primitiv | `components/ui/Modal.tsx`, `hooks/useModalA11y.ts` |
| **S1** `components/ui/` primitivlari | 2 | **13** | `components/ui/index.ts` |
| **S1** `loading/error/not-found.tsx` | 0 | 3 | `app/(dashboard)/` |
| **S3** JS bilan hover (`onMouseEnter`+style) | 57 | **1** | — |
| **S4** `lib/validations.ts` (0 importer) | 72 qator | o'chirilgan | commit `6ec0db2` |
| **E3** Inventar moduli (faqat super_admin) | bor | o'chirilgan | commit `8e63eaa` |
| **S7** `xlsx` statik import (~800KB) | bor | 0 | commit `2e231af` — `exceljs`, 4 eksport → 1 |

**Tekshiruv:** `typecheck` ✅ · `build` ✅ · `lint` 0 xato ✅ · **640/640 test** ✅

---

## Qolgan — modal migratsiyasi

**Holat: 16 → 15.** Ratchet: [`lib/modalSemantics.spec.ts`](../../lib/modalSemantics.spec.ts).
Yangi semantikasiz modal qo'shib bo'lmaydi.

Bu faqat a11y masalasi emas. `hooks/useAutoRefresh.ts` ochiq dialog ustida
polling'ni to'xtatish uchun DOM'dan `[role="dialog"]` ni qidiradi — semantikasiz
modal o'sha tekshiruvga **ko'rinmaydi**, ya'ni foydalanuvchi formaga yozib
turganda 15 soniyalik `router.refresh()` uning ostidan ishlaydi. Yetishmayotgan
atribut — **ma'lumot yo'qolishi yo'li**.

Ko'chirilgan: `PayrollTable` tuzatish modali (audit P5 — Escape yo'q, fokus tuzog'i
yo'q, saqlash tugmasi submit paytida faol qolib ikki marta yozish mumkin edi;
ustiga `amount: 0` validatsiyasiz yozilardi).

**Qasddan kechiktirilgan** — B blokda baribir qayta yoziladi yoki jiddiy o'zgaradi:
`OperationModule` · `OrganizationModule` · `PayrollDrafts` · `ExpenseModule`.

---

## Qolgan — arxitektura, qasddan kechiktirilgan

Hammasi matritsa yoki Cockpit hududida, ya'ni B va C bloklarga tegishli.
Batafsil sabab va ochilish sharti: [`ICEBOX.md`](../ICEBOX.md).

| | Holat | Qaysi blokda |
|---|---|---|
| Virtualizatsiya (matritsa ~5 700 katak) | yo'q | B — matritsa `Obligation` proyeksiyasiga aylanadi |
| `useSearchParams` — ulashiladigan ko'rinishlar | **0** | C — Cockpit baribir shu mexanizmni talab qiladi |
| `.erp-table` migratsiyasi | 20 jadvaldan 1 tasida | B |
| Inline `style={{}}` | 2 049 → 2 005 | B/C bilan birga, alohida emas |

---

## O'lchovlarni qayta yuritish

Ishonish shart emas — qayta o'lchang:

```bash
# yopilganlar
grep -roh "window\.confirm(\|window\.alert(\|window\.prompt(" --include="*.tsx" components app | sort | uniq -c
ls components/ui/*.tsx | wc -l
find app -name "loading.tsx" -o -name "error.tsx" -o -name "not-found.tsx" | wc -l
grep -roh "onMouseEnter={" --include="*.tsx" components app | wc -l

# qolganlar
npx vitest run lib/modalSemantics.spec.ts        # ratchet
grep -rl "useSearchParams" --include="*.tsx" app components | wc -l
grep -rl "erp-table" --include="*.tsx" components app | wc -l
grep -roh "style={{" --include="*.tsx" components app | wc -l
```

`ConfirmDialog.tsx` ichidagi ikkita `window.confirm`/`window.prompt` —
provayder bo'lmaganda ishlaydigan SSR fallback'i, ya'ni **to'g'ri**, sanamang.
