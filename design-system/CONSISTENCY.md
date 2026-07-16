# Component Consistency Report — Mehnat ERP

**Audited** 2026-07-16 · 94 `.tsx` files (~16,500 LOC) against the token system in `app/globals.css`
**Method** exhaustive grep; every count below is reproducible from the working tree.

## Verdict

`globals.css` is a **good design system that the application largely ignores.** The tokens are
complete, semantic, and theme-correct. The components mostly don't use them — they hand-roll the same
thing, slightly differently, 200 times.

The tell: **93% of buttons and 82% of inputs bypass the classes written for them**, and `.erp-table`
is used on **1 of 17 tables**. This isn't sloppiness so much as *the shared classes never being deep
enough to be worth adopting* — every component needed one more variant, so it forked.

## Scorecard

| Area | State | Score |
|---|---|---|
| Icon library | lucide-react only, zero competitors | 🟢 Healthy |
| Spacing scale | 4/8px honoured; 2 arbitrary values repo-wide | 🟢 Healthy |
| Colour tokens | Complete, full light/dark parity | 🟢 Healthy |
| Cards | `.dashboard-card` dominant (80 uses) | 🟡 Drifting |
| Inputs | 3 classes; 82% of inputs use none | 🔴 Broken |
| Buttons | 5 implementations; 93% hand-rolled | 🔴 Broken |
| Tables | `.erp-table` on 1 of 17 | 🔴 Broken |
| Modals | No primitive; 19 files hand-roll it | 🔴 Broken |
| Type scale | Doesn't exist; 924 arbitrary sizes | 🔴 Broken |
| Z-index | No scale; values 10 → 10000 | 🔴 Broken |
| Border radius | 8 values; dominant one contradicts the token | 🔴 Broken |
| Raw hex | 210 literals, 39 distinct | 🔴 Broken |

---

## C1 · 210 raw hex literals across 25 files

**Top offenders:** `OperationModule.tsx` (49) · `cabinets/MyCabinet.tsx` (28) · `ui/MonthPicker.tsx` (21) ·
`EmployeeDashboard.tsx` (16) · `ReportProofModal.tsx` (10) · `FinanceAssistant.tsx` (10) ·
`StaffModule.tsx` (8) · `SettingsModule.tsx` (8) · `DashboardTopBar.tsx` (8) · `cabinets/AdminCabinet.tsx` (7)

**These duplicate tokens exactly — and therefore break dark mode**, because the token would have
flipped and the literal can't:

| Hex | Token it duplicates | Sites |
|---|---|---|
| `#2563EB` | `--accent-blue` (light) | 15, incl. `DashboardTopBar.tsx:29,32,78,79`, `FinanceAssistant.tsx:72,91,108,124,156` |
| `#4F46E5` | `--accent-indigo` | `DashboardSidebar.tsx:183`, `admin/AdminTopbar.tsx:61`, `admin/AdminSidebar.tsx:35` |
| `#7C3AED` | `--accent-purple` | `DashboardTopBar.tsx:28`, `FinanceAssistant.tsx:72,91,…` |
| `#DC2626` | `--accent-red` | `DashboardTopBar.tsx:33`, `SettingsModule.tsx:26` |

`DashboardTopBar.tsx:78-79` renders role/avatar colours from hardcoded light-mode blue — **wrong blue
in dark mode**, permanently.

### A second palette exists outside the token system
Not in `globals.css` at all: `#3366CC`, `#22252B`, `#1E2025`, `#1A1D23`, `#2A2D33`, `#3A3D44`,
`#DEE2E6`, `#34D058`, `#ff6b6b`, `#4da3ff`, `#ffd700`. Found in `OperationModule.tsx:25-31,35-40,163-204`,
`ui/MonthPicker.tsx:80-114`, `EmployeeDashboard.tsx:151-313`, `ErrorBoundary.tsx:47-48`,
`SalaryKPIModule.tsx:111,123`. It reads like a **GitHub-style theme that predates the current tokens
and was never migrated**.

**Silently wrong, not merely duplicated:** `cabinets/MyCabinet.tsx:338-480` uses `#10b981`, `#f59e0b`,
`#ef4444` — *close to but not equal to* the dark tokens (dark `--success` is `#34D399`). These are
off-brand in dark mode in a way no one will notice by eye.

---

## C2 · 247 Tailwind palette classes that don't theme

`EmployeeDashboard.tsx` (154) · `ErrorBoundary.tsx` (24) · `login/page.tsx` (15) ·
`SalaryKPIModule.tsx` (13) · `ui/MonthPicker.tsx` (11) · `OperationModule.tsx` (10)

**`EmployeeDashboard.tsx` opts out of the design system entirely** — built from Tailwind defaults plus
arbitrary hex (`bg-gray-50 dark:bg-[#1A1D23]`, `text-emerald-600`, `bg-amber-500`).
**~78 of its colour lines have no `dark:` variant at all** (`:136,158,169,173-177,187,197,200,209,218,224,255`),
so they were tuned for white and are not guaranteed legible on `--bg-card` dark.

---

## C3 · Buttons — 5 implementations, ~10% adoption

208 `<button>` elements. **20 use a shared class.**

`.btn-primary` (10) · `.btn-secondary` (7) · `.c1-btn*` family, 4 variants (9) · `.ai-button-glow`
(**1 usage**, `OrganizationModule.tsx:334` — a one-off promoted to a global class).

`PayrollDrafts.tsx:334` uses `c1-btn c1-btn-primary` while sibling components in the same file family
use `btn-primary` — **drift inside one feature**.

The other ~194 correctly use `var(--accent-blue)` but re-invent padding, radius and weight inline each
time (`KassaModule.tsx:205,209,328`, `StaffModule.tsx:308,311,349,352`).

## C4 · Inputs — 3 classes, one dead, 82% ad-hoc

110 `<input>` + 36 `<select>` + 4 `<textarea>`.
`.erp-input` **53** · `.c1-input` **3** · `.liquid-glass-input` **0 — dead**.

`OrganizationModule.tsx` uses `c1-input` at :381 and `erp-input` at :413 — **both classes, one file**.

~90 inputs use neither, hand-writing `var(--input-bg)` with `rounded-xl` (12px) while `.erp-input`
itself is 8px — **even the token-correct ad-hoc inputs disagree on radius with the real class**.

## C5 · Cards — two dead classes, two competing `StatCard`s

`.dashboard-card` **80** (dominant) · `.glass-card` **14** (cabinets only) ·
`.stat-card` **0 — dead** · `.liquid-glass-card` **0 — dead**.

`.stat-card` exists precisely for stat tiles and is used **zero** times. Instead two different local
`StatCard` components reimplement it:
- `app/(dashboard)/dashboard/page.tsx:180-197` — `rounded-2xl` (16px, off-token), takes an **emoji string** as its icon
- `cabinets/MyCabinet.tsx:615-624` — uses `.dashboard-card`, `rounded-xl`

Two components, same name, different radii, neither uses the class named for the job.

## C6 · Modals — no primitive, 19 hand-rolls, no z-index scale

`fixed inset-0` appears **21 times across 19 files**. No `Modal`/`Dialog` component exists.

**Z-index in the modal layer alone:** `z-10`, `z-20`, `z-30`, `z-40`, `z-50`, `z-[100]`, `z-[101]`,
`z-[110]`, `z-[190]`, `z-[200]`, `z-[201]`, `z-[9999]`, `z-[10000]`. `ui/MonthPicker.tsx:71` and
`ReportProofModal.tsx:181` **independently picked `z-[10000]`** — a collision waiting to happen.

Backdrops diverge for an identical visual: `bg-black/60 backdrop-blur-sm` (`AttendanceModule.tsx:276`)
vs inline `rgba(0,0,0,0.5)` + `blur(4px)` (`HisobotlarModule.tsx:172`).

**This single missing primitive is also the root of accessibility A2** (19 modals, 0 with dialog
semantics). One component closes both.

## C7 · Tables — `.erp-table` on 1 of 17

`OrganizationModule.tsx:518` is the only consumer. The other 16 are hand-rolled, including
`OperationModule.tsx:831` using `border-separate border-spacing-0` — **a different border model
entirely**. `.erp-table` (`globals.css:438-478`) is dead in practice.

## C8 · Type — 924 arbitrary sizes, 17 values, sub-pixel

`text-[10px]`×280 · `[11px]`×251 · `[12px]`×140 · `[9px]`×94 · `[13px]`×88 · `[14px]`×22 · `[15px]`×21 ·
`[8px]`×7 · `[18px]`×4 · **`[12.5px]`×4** · **`[9.5px]`×3** · `[17px]`×3 · **`[8.5px]`×2** ·
**`[7px]`×2** · `[20px]`×1 · `[16px]`×1 · **`[10.5px]`×1**

Worst: `CompanyDrawer.tsx` (114 arbitrary utilities) · `OperationModule.tsx` (72) ·
`ExpenseModule.tsx` (65) · `KassaModule.tsx` (48).

**Tailwind's `text-xs/sm/base` scale is used zero times in these files.** Half-pixel values can't
belong to any deliberate scale — they're eyeballing. `text-[7px]` (`OperationModule.tsx:881`, green at
70% opacity) is not readable by anyone.

Ironically **spacing is disciplined** — only `SalaryKPIModule.tsx:111` (`-mb-[1px]`) and
`layout.tsx:56` (`pb-[76px]`) are arbitrary. The team has scale discipline; it just never got applied
to type.

## C9 · Icons — one library (good), 21 sizes, emoji leaking in

lucide-react in 50 files, **zero competing libraries** — the healthiest area of the system.

But **434 `size={N}` usages across 21 distinct values** (9,10,11,12,13,14,15,16,17,18,20,21,22,24,26,
28,30,32,36,40,48 + outliers `size={200}` at `KassaModule.tsx:92`, `size={140}` at `ExpenseModule.tsx:98`).
14 vs 15 vs 16 are used interchangeably for the same role.

**Emoji as structural icons**, while lucide is right there:
`dashboard/page.tsx:147-150` (`icon="🏢"`, `"✅"`, `"🚫"`) · `OrganizationModule.tsx:75-80` (`🔴🟡🟢`) ·
`PayrollTable.tsx:285-288` (`👥💼📈⚠️`) · `cabinets/AdminCabinet.tsx:112,123` (`🔑⚙️`) ·
`CompanyDrawer.tsx:376` (`☁️💻🖥️❌`) · `OperationModule.tsx:25-40` (`✓ ✗ ⏳ !`).

`.status-dot` exists in `globals.css:563-573` **for exactly the `🔴🟡🟢` job** and has **0 usages**.

## C10 · Radius — the dominant value contradicts the token

`rounded-lg` (8px) **217** · `rounded-xl` (12px, = `--card-radius`) **149** · `rounded-full` 61 ·
`rounded-2xl` 49 · `rounded-md` 48 · `rounded-sm` 44 · `rounded` 42 · other 8.

**The canonical radius is 12px; the most-used radius is 8px.** Three sites actively fight
`.dashboard-card` with `!rounded-none` (`OperationModule.tsx:713,945`, `CompanyDrawer.tsx:180`) —
a component being overridden that often is the wrong shape.

---

## Dead CSS — safe to delete

Zero usages anywhere in `app/`/`components/`:
`.stat-card` · `.liquid-glass-card` · `.liquid-glass-input` · `.status-dot` · `.tooltip`

## Root cause

The pattern is consistent: **a shared class exists, it isn't quite enough, the component forks.**
`.erp-input` is 8px-radius and rigid → 90 inputs hand-roll it. No `Modal` → 19 forks. No type scale →
924 forks. The fix is not "use the classes" — it's making the shared components **deep enough that
forking is the harder option**, then deleting what forked.

Priority order in [UI-IMPROVEMENTS.md](./UI-IMPROVEMENTS.md): Modal primitive → type scale →
z-index scale → hex migration.
