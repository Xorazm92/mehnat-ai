# ASRO — Enterprise UI / UX / ERP Audit

**Date:** 2026-07-26 · **Branch:** `hardening/sprint-1` · **Scope:** 44 routes, 39 components, 16,442 LOC in `components/`
**Benchmark:** Stripe Dashboard, Linear, Notion, Vercel, SAP Fiori, Oracle Fusion, Odoo Enterprise, ClickUp
**Method:** static analysis of the shipped tree. Every quantitative claim in this document was produced by direct `grep`/`find` against the working tree and is re-runnable. Every finding carries a `file:line` citation.

---

## Executive summary

**Overall: 4.2 / 10** measured against the named benchmark set — not against "good for an internal tool".

ASRO is not a badly designed product. It is a **well-designed product with a missing layer**. The domain model is the strongest thing here: an obligation engine, deadline templates, a screenshot-proof review workflow, period locking, an editable RBAC matrix. The stylesheet is the second strongest: 1,289 lines of opinionated, documented design work. Between them sits a void where the component library should be, and everything falls through it.

### The thesis

> **ASRO has a genuinely excellent design system that the application ignores.**

That sentence is not mine. `design-system/CONSISTENCY.md:8` wrote it on 2026-07-16. The evidence confirms it is still true.

`app/globals.css` argues real positions in its comments:

- **`globals.css:890`** — *"Zebra yo'q — chiziq zebradan aniqroq va zichlikda bulg'anmaydi."* (No zebra — rules read cleaner than stripes and don't muddy at density.) That is a considered ledger-design decision, and it is correct.
- **`globals.css:961-966`** — the `.verdict` system encodes state as **shape *and* colour** (`● ◐ ○`) because *"a supervisor who cannot distinguish colour could not read the very verdict they are accountable for."* That is WCAG 1.4.1 solved thoughtfully, in Uzbek, by someone who understood the domain.
- **`globals.css:1010-1015`** — ambient animation (`float`, `pulse-glow`, `shimmer`) was **deliberately deleted**: *"on the fiftieth page they are not information, they are noise."* That is Linear-grade restraint, arrived at independently.

Then the component layer throws all of it away.

### The gap, in numbers

| Metric | Count | Reading |
|---|---:|---|
| `<button>` elements | **288** | **31** use a shared button class — **11%** |
| Files containing `<table>` | **26** | **1** uses the design system's `.erp-table` — **4%** |
| `<input>` elements | **149** | vs **7** `htmlFor` — **95% of inputs are unlabelled** |
| `style={{ }}` inline objects | **2,049** | vs ~20 total uses of the `@theme` utilities built to replace them |
| `role="dialog"` / `aria-modal` | **0** | across **24 files** containing `fixed inset-0` modals |
| `aria-label` | **14** | across 288 buttons |
| `loading.tsx` / `error.tsx` / `not-found.tsx` | **0** | across 44 routes |
| `<Suspense>` boundaries | **0** | every route blocks on its slowest query, silently |
| Skeleton components | **0** | `.animate-shimmer` was written, then deleted |
| `useSearchParams` in client components | **0** | **no filtered view in the product is shareable** |
| `confirm(` / `alert(` / `prompt(` | **15 / 20 / 3** | native OS dialogs are the standard confirmation UI |
| `onMouseEnter={e => …style…}` | **57** | hover is JS-driven, defeating CSS `:hover`, touch, `prefers-reduced-motion` |
| `scope="col"` / `aria-sort` / `<caption>` | **0 / 0 / 0** | no table is semantically marked up |
| Row selection / bulk actions | **0** | every checkbox in the app is for column visibility or service toggles |
| Virtualization | **0** | vs ~5,700 cells mounted at once on the matrix |
| `lib/validations.ts` (72 lines of zod) importers | **0** | schema validation exists and reaches nothing |

**~80% of findings are systemic, not page-local.** Fixing them once at the primitive layer fixes them on all 44 routes. That is what makes the roadmap tractable — and why the estimate below is two weeks, not two quarters.

### The encouraging read

Token hygiene has improved dramatically in ten days: raw hex **210 → 33**, Tailwind palette classes **247 → 47**, arbitrary `text-[Npx]` **924 → 2**, and `prefers-reduced-motion` + a global `:focus-visible` ring now ship. **The taste is proven.** What is missing is the component layer that makes the taste enforceable.

---

## Scores

| Dimension | Score | Justification |
|---|---:|---|
| Visual design | **5.5** | CSS layer is 8+. Component layer drags it down: 6 button styles, 6 modal shells, 4 stat tiles, 5 table headers. |
| UX | **4.0** | No shareable state, no bulk actions, no undo, no loading feedback, OS dialogs on the riskiest paths. |
| Enterprise readiness | **3.5** | No breadcrumbs, no saved views, no bulk ops, no audit surfacing, no keyboard layer. |
| ERP depth | **5.0** | Domain model genuinely strong; the UI exposes a fraction of it. |
| Modern stack | **6.5** | Next 16, React 19, RSC, Tailwind v4, sonner, one real optimistic mutation. Undermined by 0 Suspense and 12 polling loops. |
| Premium feel | **3.0** | `window.confirm` and `window.prompt` sit in the primary workflow. |
| Accessibility | **2.0** | 0 dialog semantics, 14 `aria-label` / 288 buttons, 7 `htmlFor` / 149 inputs. |
| Performance | **3.5** | 5,700 unvirtualized cells; unbounded `findMany`; 15s full-payload polling. |
| Developer experience | **4.0** | 1,535-line component, 2,049 inline styles, no primitives, dead zod, 3 role-label maps. |
| **Overall** | **4.2** | A strong domain model and a strong stylesheet, separated by a missing component layer. |

---

# PART I — Critical findings

These are ranked by (business risk × blast radius). Each carries the full seven-field treatment.

---

## C1 — Client tax-portal credentials export to plaintext Excel

**Problem.** `components/OrganizationModule.tsx:137-172` builds an Excel export whose header row is literally `['Nomi', 'INN', 'Buxgalter', 'Rejim', 'Login', 'Parol', 'Ega']` and whose body maps `c.login` and `c.password` straight into cells:

```ts
const headers = ['Nomi', 'INN', 'Buxgalter', 'Rejim', 'Login', 'Parol', 'Ega'];
const rows = filtered.map(c => [ c.name, c.inn, c.accountantName, c.taxRegime,
                                 c.login || '', c.password || '', c.ownerName || '' ]);
```

It exports `filtered`, not `paginated` — so a default view exports **all 212 companies' credentials in one click**.

**Why it is a problem.** These are not ASRO passwords. Project memory records that `Company.login` is a *soliq* (state tax portal) credential — an external service. The file lands in Downloads unencrypted, gets mailed, gets synced to personal cloud storage, and survives every offboarding. There is no audit entry: `AuditLog` is never called on this path.

**Business impact.** A single exported `.xlsx` is enough to file, amend, or withdraw tax declarations for 212 client companies. For an outsourcing firm this is existential — professional indemnity, licence, and every client contract at once. It also flatly contradicts the vault migration the team already performed.

**UX impact.** Minor and perverse: the feature is genuinely convenient, which is exactly why it will keep being used.

**Premium solution.** Stripe's model: secrets are write-only and reveal-once. Drop both columns from the export entirely. If bulk credential access is a real operational need, it belongs behind a separate, explicitly-labelled, audit-logged, permission-gated action that produces a time-limited link rather than a file — and it should be `super_admin` only. Reveal-in-UI (`OrganizationModule.tsx:240-242`, `CompanyDrawer.tsx:468`) must write an `AuditLog` row; note `CompanyDrawer.tsx:169` already carries a `// Access logged` comment with **no actual audit call behind it**.

**Priority.** Critical — ship today.
**Difficulty.** Quick win. Deleting two array entries closes the bulk exposure. The audit-logging follow-up is ~half a day.

---

## C2 — New staff passwords are rendered on screen for 15 seconds

**Problem.** `components/StaffModule.tsx:116-126`:

```ts
toast.success("Yangi xodim qo'shildi", {
  description: `Login: ${createdEmail}\nParol: ${createdPw}\n(bu ma'lumotni xodimga bering)`,
  duration: 15000,
});
```

**Why it is a problem.** The cleartext password is painted into the DOM, in a shared office, for fifteen seconds, in the top-right corner — the most screenshot-prone region of the screen. `StaffDrawer.tsx:245-249` compounds it by generating passwords client-side.

**Business impact.** Credential leakage to anyone with line of sight or a screen recorder, for accounts that hold client financial data. Fails any SOC2/ISO27001-style control review immediately.

**UX impact.** The 15-second window is also a *usability* failure in its own right: it is simultaneously too short to write down reliably and too long to be safe. The admin is forced to hurry.

**Premium solution.** Never display a password. Generate server-side, deliver out-of-band, and force rotation on first login. If an in-person handoff is genuinely required, use a dedicated reveal panel with an explicit "I have delivered this" dismissal, a copy-to-clipboard button, no auto-timeout, and an audit entry — the pattern GitHub uses for personal access tokens.

**Priority.** Critical.
**Difficulty.** Quick win for the toast; ~1 day with a proper first-login rotation flow.

---

## C3 — Every irreversible action is gated by `window.confirm`, with no undo

**Problem.** 15 `confirm(` sites. The two most consequential:

- `components/OperationModule.tsx:689` — wipes an entire report column for an entire period across all companies.
- `app/(admin)/admin/month-closing/MonthClosingClient.tsx:101` — locks an accounting period.

`handleClearColumn` then makes it worse. It blanks the column in state **before** awaiting the server (`:693`), and its `catch` (`:697-700`) contains **no rollback**:

```ts
if (!window.confirm(`Haqiqatdan ham "${colLabel}" ustunini "${selectedPeriod}" oy uchun tozalab tashlamoqchimisiz?`)) return;
// optimistic clear …then on failure, nothing restores it
```

**Why it is a problem.** A native OS dialog is unstyleable, unbrandable, dismissible by Enter, and carries no information about *what* is about to be destroyed (how many cells, whose work, which period). It is the single weakest confirmation primitive available on the web, deployed on the single most destructive action in the product. And on failure the UI silently lies about the result.

**Business impact.** One mis-click destroys a month of compliance evidence across 212 companies. With no undo, no soft-delete, and no rollback, recovery means a database restore. The failed-clear case is worse than data loss: staff act on a UI showing an empty column that the database says is full.

**UX impact.** Enter-key muscle memory dismisses the dialog affirmatively. Nothing communicates scope. There is no way back.

**Premium solution.** Three layers, all standard at Linear and Notion:
1. A `ConfirmDialog` primitive stating **exact scope** ("This will clear 212 cells for Iyul 2026, including 47 approved by a supervisor").
2. Type-to-confirm for the truly destructive tier — the user types the column name, as GitHub does for repository deletion.
3. **Undo by default.** Soft-delete plus a toast with an Undo action for 10 seconds; `sonner` supports this natively today and is already mounted. Undo is better UX than any confirmation dialog, because it costs nothing on the happy path.

Fix the missing rollback in the `catch` regardless of the rest.

**Priority.** Critical.
**Difficulty.** 1 day for `ConfirmDialog` + rollback; ~1 week to add soft-delete + undo across all 15 sites.

---

## C4 — A database failure renders a dashboard of zeros with no error state

**Problem.** `app/(dashboard)/dashboard/page.tsx` wraps every cabinet fetch in a swallowing catch (`:38`, `:64`, `:92`, `:122`). The accountant fallback is the sharpest example:

```ts
getAccountantCabinetData().catch(() => ({
  companies: [], companiesCount: 0,
  reportSummary: { required: 0, done: 0, pending: 0, percent: 100 },
  kpi: { totalScore: 0, approvedCount: 0, pendingCount: 0 },
  currentMonth: new Date().toISOString().slice(0, 7),
})),
```

**`percent: 100`.** When the database is unreachable, the accountant is told their report completion is **100%**.

**Why it is a problem.** This is not a missing error state — it is an error state that **actively asserts the most reassuring possible falsehood**. A compliance tool that fails toward "everything is fine" is worse than one that fails loudly, and worse than one that shows nothing at all. Nothing in the UI distinguishes "no overdue deadlines" from "the query threw".

**Business impact.** The single most dangerous defect in the product. ASRO exists to stop deadlines being missed; this makes it silently claim they were met. A director's Monday review, an accountant's daily check, and a supervisor's risk triage are all built on numbers that may be fabrications. Missed statutory deadlines carry direct financial penalties and client loss.

**UX impact.** Total loss of trust once discovered — and undetectable until then.

**Premium solution.** Never manufacture data on failure. Let the error propagate to a route-level `error.tsx` with a retry, or render each widget in its own error state ("Ma'lumot yuklanmadi — qayta urinish"). Stripe's dashboard degrades per-widget: a failed panel shows a retry affordance while its neighbours render normally. At minimum, `percent` must become `null` and the UI must render `—`, which `AccountantCabinet.tsx:88` already knows how to do.

**Priority.** Critical.
**Difficulty.** Quick win to remove the false defaults; ~1 day with proper per-widget error states.

---

## C5 — No modal in the application is accessible, and Escape closes almost nothing

**Problem.** Repo-wide: `role="dialog"` = **0**, `aria-modal` = **0**, focus trap = **0**, across **24 files** containing `fixed inset-0` overlays. This includes every primary editing surface: `CompanyDrawer` (1,091 LOC, 7 tabs), `StaffDrawer`, `OnboardingWizard`, the expense editor, the payroll adjustment modal, both report modals.

Escape handling is present in six files, and `ReportProofModal.tsx:92-97` illustrates the state of it — Escape is bound to the nested **lightbox**, not to the modal underneath:

```ts
useEffect(() => {
  if (!lightbox) return;
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLightbox(false); };
  …
}, [lightbox]);
```

So Escape closes the zoom overlay and leaves the dialog open. Meanwhile `hooks/useDismissable.ts` is a well-built hook that solves exactly this — used in **2 places**.

**Why it is a problem.** Without `role="dialog"` a screen reader does not announce the dialog, does not trap the virtual cursor, and continues reading the page behind it. Without a focus trap, Tab walks out of the modal into the obscured page. Without Escape, a keyboard user who opens `CompanyDrawer` has no keyboard route out of it.

**Business impact.** Public-sector and enterprise clients in most jurisdictions require an accessibility statement; this fails WCAG 2.1 AA on 2.1.2 (No Keyboard Trap), 2.4.3 (Focus Order), and 4.1.2 (Name, Role, Value). It also blocks any future government or bank client outright.

**UX impact.** Not confined to disabled users. Power users — the accountants who live in this tool eight hours a day — navigate by keyboard. Every one of them must reach for the mouse to dismiss a dialog.

**Premium solution.** One `Modal` primitive. Dialog semantics, focus trap, focus restore, Escape, scroll lock, and backdrop dismissal become properties of the primitive rather than 24 things to remember. `design-system/MASTER.md:174` already identified this as *"the highest-leverage component to build"*. It was never built.

> **Correction (2026-07-26).** An earlier draft of this audit stated that Radix Dialog was already present as a transitive dependency of `sonner` and could be promoted for free. **That was wrong.** `node_modules/@radix-ui` contains only 8 low-level utilities (`primitive`, `react-slot`, `react-compose-refs`, `react-toggle`, …) — `@radix-ui/react-dialog` is **not** installed. Adding it would be a genuine new dependency. Since this repo has exactly three UI-layer dependencies (`lucide-react`, `recharts`, `sonner`), that is an architectural decision for the team, so the shipped implementation hand-rolls the behaviour in `hooks/useModalA11y.ts` instead. Radix remains a reasonable future upgrade — the primitive's public API would not change.

**Priority.** Critical.
**Difficulty.** 1 day for the primitive; ~1 week to migrate all 24 sites.

---

# PART II — Cross-cutting systems

## S1 — Design system: a good system with no enforcement layer

`components/ui/` contains exactly two files, and **neither is a primitive** — a `TableToolbar` and a `MonthPicker`. There is no `Button`, `Card`, `Badge`, `Input`, `Modal`, `Table`, `Tooltip`, `Skeleton`, or `EmptyState`. Consequently the same element is re-authored per file.

**The primary CTA exists in six implementations across three semantic colours:**

| File | Implementation |
|---|---|
| `KPIRulesManager.tsx:328` | `className="btn-primary flex-1"` |
| `OperationModule.tsx:307` | `className="c1-btn c1-btn-primary flex-1 py-1 px-2 text-micro"` |
| `AdminUserManager.tsx:311` | `px-4 py-2 rounded-lg text-xs font-bold text-white` + `background: var(--accent-blue)` |
| `FairKpiClient.tsx:65` | `px-3 py-1.5 rounded-lg text-sm font-semibold text-white` + `background: var(--brand)` |
| `BusinessCalendarClient.tsx:104` | `px-4 py-2 rounded-lg text-sm font-semibold text-white` + **`background: var(--success)`** |
| `Integration1CClient.tsx:183` | `text-xs font-semibold px-2.5 py-1 rounded-lg text-white` |

Five padding pairs, three type sizes, two weights, and **`--brand` vs `--success` vs `--accent-blue` for the same action class** — the fifth row uses green for a plain "Saqlash". Every ad-hoc variant hardcodes `text-white`, which is wrong in dark mode where `--on-brand` is `#06121C`.

**The same pattern repeats for modals** (6 shells; scrim opacity 0.5/0.6/0.7/0.9; z-index `z-50`/`z-[100]`/`z-[110]`/`z-[200]`/`z-[250]`/`z-[300]`), **stat tiles** (4), **badges** (5 — one using `py-0.2`, which is not a valid Tailwind step and silently produces nothing), **table headers** (5 padding scales), and **inputs** (4 systems, one of which writes `var(--border, var(--rule))` — a defensive fallback for a token that does exist).

**Dead weight already in the tree:** 10 CSS classes with zero consumers (`.status-dot`, `.num`, `.figure`, `.col-numeric`, `.label-caps`, `.live-chip`, `.layer-float`, `.img-outline`, `.img-framed`, `.kpi-positive*`). The `@theme inline` bridge exposes 17 utilities; 7 have zero uses and the whole set totals ~20, against 2,049 inline style objects.

**Why the drift happens.** `CONSISTENCY.md:184` already diagnosed it correctly: *"a shared class exists, it isn't quite enough, the component forks. The fix is not 'use the classes' — it's making the shared components deep enough that forking is the harder option."* That analysis is right and remains unactioned. `.btn-primary` offers no size, tone, loading, icon, or disabled variants — so the first developer needing a small green button forks, and the second copies the fork.

**Business impact.** Every UI change costs N× more than it should. A brand colour change today means touching 2,049 inline style objects. Onboarding a frontend developer means learning six button conventions.
**Premium solution.** Nine primitives (§ Redesign). **Priority:** Critical. **Difficulty:** 1 week.

---

## S2 — Shell & navigation: the user never knows where they are

Four route groups, four different shells: 2 duplicated `SessionProvider`s, 1 `ErrorBoundary` (dashboard only), 1 `max-width` container (portal only), 2 sidebar widths (240px vs 230px), 2 topbar heights (token vs literal `h-16`).

- **Breadcrumbs: 0.** `grep -rni "breadcrumb"` returns nothing. The nearest thing, `AdminTopbar.tsx:44-51`, is a static non-linked string reading `ASRO / Admin` on every admin sub-page.
- **Page `metadata`: 1**, in the root layout. All 44 browser tabs read `"ASRO — Korporativ Boshqaruv Tizimi"`. The `%s · ASRO` title template is defined and never used.
- **Headings:** `<h1>` exists on 4 pages. 8 pages — Expenses, Payroll, Notifications, Settings, Documents, Inventory, Attendance, KPI — have **no heading of any level**. Three of six cabinets render no title at all; `ChiefAccountantCabinet.tsx:73-74` computes `userName` and `monthLabel` and renders neither.

So neither the tab, nor a breadcrumb, nor a page title tells the user where they are. Only the sidebar highlight does.

**The nav registry has forked.** The sidebar knows 21 destinations; `GlobalSearch.PAGES` (`GlobalSearch.tsx:12-23`) knows 10. Worse, `GlobalSearch.tsx:28` and `MobileBottomNav.tsx:31` use the **override-blind** `canSeeView`, while the sidebar, layout, and proxy use `canSeeViewWith`. An admin who grants a role a new view sees it appear in the sidebar and pass the router — but it never appears in search.

**Role labels are defined three times** with three different strings (`DashboardTopBar.tsx:19-26`, `lib/permissions.ts:216`, `DashboardSidebar.tsx:198-206`). The sidebar's inline copy omits `admin` and `bank_manager`, so **an admin's own sidebar footer displays the raw string `"admin"`** and a bank manager's says `"bank_manager"`.

**Two dead controls.** The language switcher (`DashboardTopBar.tsx:130-137`) renders a globe, "O'zbekcha", and a chevron promising a menu — with **no `onClick`**. Notifications show a bare 2px dot; the unread count is fetched in the layout, passed to the topbar, and used only in the `aria-label` — **the number is never displayed**.

**Business impact.** No shareable location, no orientation, no browser-history semantics. Support conversations become "which screen are you on?".
**Priority:** High. **Difficulty:** 1 week.

---

## S3 — Tables: 26 tables, 26 implementations

| Capability | State |
|---|---|
| Shared table class | 1 of 26 uses `.erp-table` |
| Sorting | 2 columns, on 1 table (`OrganizationModule.tsx:548`), no `aria-sort`, naive string compare on numeric fields |
| Sticky header | 2 tables; the matrix uses hardcoded pixel offsets (`left-10`, `md:left-[232px]`, `md:left-[312px]`, `top-[28px]`) |
| Column resize / reorder | None for end users |
| Density toggle | None |
| Row selection / bulk actions | **None anywhere** |
| Pagination | 2 tables (fixed 100/page, prev-next only); the rest render everything |
| Virtualization | **None** |
| URL-persisted state | **None** |
| Export | Excel only, 3 separate implementations |
| Semantics (`scope`, `caption`, `aria-sort`) | **0 / 0 / 0** |

**Zebra striping is implemented three times in JavaScript** (`StaffModule.tsx:413-415`, `ExpenseModule.tsx:332`, `PayrollTable.tsx:445-451`) — in direct contradiction of the design system's explicit decision at `globals.css:890` not to use zebra at all. In `ExpenseModule` the inline background and the Tailwind `hover:` class fight each other, and the inline style wins, so the hover state barely renders.

**Hover is JS-driven in 57 places.** `onMouseEnter={e => e.currentTarget.style.background = …}` defeats CSS specificity, does not fire on touch, cannot respond to `prefers-reduced-motion`, and forces a style recalculation per pointer move.

**Search is debounced exactly once** in the entire product (`OperationModule.tsx:610-615`, 300ms). Every other search — including the one inside the *shared* `TableToolbar.tsx:98` — filters on every keystroke. `OrganizationModule` re-filters and re-sorts 212 rows per character.

**Two tables render twice.** `ExpenseModule` (`:265`, `:316`) and `OrganizationModule` (`:450`) hide the card grid with `md:hidden` rather than unmounting it, so React builds both the card list and the table on every render.

**Business impact.** The core competence of an ERP is the table. Directors cannot triage without sort; supervisors cannot delegate without bulk assign; nobody can share a filtered view.
**Priority:** High. **Difficulty:** 1 week for the platform, migration incremental.

---

## S4 — Forms: 72 lines of zod that reach nothing

`lib/validations.ts` defines `companySchema`, `createUserSchema` and others with correct rules — 9-digit INN, 14-digit PINFL, min-6 password. **It has zero importers.** Every form hand-rolls validation instead.

`StaffModule.tsx:80-96` is representative — five sequential guards, each firing a toast and returning:

```ts
if (!form.name || !form.role) { toast.error("Iltimos, F.I.SH va lavozimni kiriting"); return; }
if (!isEditing && !form.email?.trim()) { toast.error("Email (login) kiritilishi shart"); return; }
if (form.pinfl && !/^\d{14}$/.test(form.pinfl)) { toast.error("JSHSHIR 14 ta raqamdan iborat bo'lishi kerak"); return; }
```

Consequences:
- **Only the first error is ever shown.** A form with four problems takes four submit-and-read cycles to fix.
- **No error is ever attached to its field.** The user must map the message back to the input themselves.
- The company wizard's entire validation is `if (finalData.name && finalData.inn)` (`OrganizationModule.tsx:216`) — INN is never format-checked, despite `companySchema` encoding exactly that rule.
- **Required fields are marked with a literal `*` inside the label string**, never programmatically.
- **No autosave, no drafts.** Closing the 4-step `OnboardingWizard` discards everything silently.
- `ExpenseModule` is the only place native constraint validation is used, and its submit button is **not disabled during submit** (`:503-509`) — double-submission is possible.

**Two autosave paths fail silently.** `CompanyDrawer.tsx:648-650` swallows `onSave` errors to `console.error` and closes the panel as though it succeeded; the KPI override autosave (`:996-1014`) uses `try/finally` with **no `catch` at all**. The service checkboxes (`:921-926`) write the entire company on every tick, with no confirmation, no busy state, and no undo — and a "Hammasini o'chirish" button (`:878-884`) with no confirmation whatsoever.

**Business impact.** Data quality erodes at the point of entry — the most expensive place to fix it. An unvalidated INN propagates into tax filings.
**Priority:** High. **Difficulty:** 1 week.

---

## S5 — Feedback: modern toasts for success, OS dialogs for catastrophe

`sonner` is mounted (`app/layout.tsx:107`) and used across 33 files. And yet:

- **20 `alert(` sites**, including `HisobotlarModule` (5), `ExpensesClient` (3), `MonthClosingClient` (3), `CompanyDrawer` (2).
- **15 `confirm(` sites** — **every destructive confirmation in the product**.
- **3 `window.prompt(` sites** capturing *rejection reasons* — free-text business data entered through an OS dialog with no validation, no length limit, and no cancel semantics (`HisobotlarModule.tsx:68`, `ExpensesClient.tsx:52`).

The result is a product where a successful save gets a polished branded toast, and destroying a month of compliance data gets a grey system box.

**`ReportProofModal.tsx` proves the team can do this properly** — a two-step reject flow with a reason textarea (`:361-385`), every button `disabled={busy}` with a spinner, toasts on both paths, and Ctrl+V clipboard paste for screenshots. It is the best-built interaction in the codebase. It is also the only one of its kind.

**Loading states have five competing treatments**: `<Loader2 className="animate-spin"/>` (25×), pulsing caps text (2×), a plain centred paragraph (4×), a `<td colSpan>` message, and nothing at all. The ellipsis alone is inconsistent — `Yuklanmoqda…` vs `Yuklanmoqda...`. **Empty states have eight different vertical paddings** for one concept and six different copy strings (`"Ma'lumot topilmadi"`, `"Ma'lumot yo'q"`, `"Hech narsa topilmadi"`, `"… mavjud emas"`, …).

**Priority:** Critical (C3) / High (rest). **Difficulty:** 1 day for `ConfirmDialog`, 1 week for full migration.

---

## S6 — Accessibility: not operable by keyboard, not usable by screen reader

`design-system/ACCESSIBILITY.md:8` stated this ten days ago. It is still true.

| Signal | Count |
|---|---:|
| `role="dialog"` / `aria-modal` | 0 |
| `aria-live` | 0 |
| `tabIndex` | 0 |
| `focus-visible` in components | 0 |
| `aria-label` | 14 (of 288 buttons) |
| `htmlFor` | 7 (of 149 inputs) |
| `sr-only` | 1 |
| `title=` used as a tooltip | **113** |

The global focus ring **now ships** (`globals.css:473-477`) — a real improvement — but it is written with `:where()` at specificity 0 and **69 `outline-none` declarations override it**. `GlobalSearch.tsx:107-118` paints its focus ring by mutating `e.currentTarget.style` in `onFocus`, invisible to `:focus-visible` entirely.

`title=` is the app-wide tooltip mechanism. It does not appear on touch, cannot be styled, has a ~1s delay, and is inconsistently exposed by screen readers. There is no `Tooltip` component.

**What is genuinely right:** the `.verdict` shape+colour system (`globals.css:968-993`), consumed with `aria-hidden` + `sr-only` text in `RiskBadge.tsx` — a textbook solution to colour-only meaning. It is used in 2 files. `accent-color` is set on checkboxes, `color-scheme` is set per theme, and `prefers-reduced-motion` now ships.

**Business impact.** Fails WCAG 2.1 AA on multiple counts; blocks public-sector and banking clients; and — the part that matters commercially — slows down the power users who live here all day.
**Priority:** Critical (via the Modal primitive). **Difficulty:** Mostly absorbed by S1.

---

## S7 — Performance: polling whole tables every 15 seconds

`hooks/useAutoRefresh.ts:28` defaults to `intervalMs = 15000` and calls `router.refresh()`. It has **12 call sites, every one invoked with zero arguments** — while the hook's own docstring (`:25-26`) recommends the guard nobody passes:

> *"Pass `{ enabled: !isModalOpen }` to avoid refreshing under an open editor."*

On `/reports` each tick re-runs the RSC, which awaits `getCachedCompanies` + `getCachedUsers` + `getCachedOperations` — and `cached-queries.ts:146` is `prisma.monthlyReport.findMany({ where: {} })`, **every period, every company, no `take`** — then re-serialises the whole payload to the client. Every 15 seconds. Per tab. Per user.

Three compounding problems:

1. **The "REAL-VAQT" badge is a lie.** `OperationModule.tsx:970-973` renders a pulsing green dot labelled real-time over data that `unstable_cache(…, { revalidate: 300 })` allows to be **five minutes stale**.
2. **The refresh fights in-flight edits.** `OperationModule` defends with a single `skipNextSyncRef` boolean (`:500`, `:567-570`, `:634`); two concurrent edits, or a refresh landing between them, drops a sync. `OrganizationsClient.tsx:27-31` needs a compensating effect to re-sync the open drawer, with a comment explaining that otherwise stale values reappear after an edit.
3. **Nothing pauses while a modal is open.** A user typing into `CompanyDrawer` is racing a 15-second timer.

**The matrix is the acute case.** 100 rows × ~57 cells = **~5,700 `StatusCell` components**, each holding 3 `useState` and 2 `useRef`, with no virtualization. Every cell edit changes the `rows` identity, invalidating three full-matrix `useMemo` reductions (`:787-886`) that each loop rows × columns — roughly 24,000 iterations per keystroke-equivalent. And each successful cell write fires a **sequential `await` loop of `createNotification` per supervisor** (`:649-670`) — N blocking round-trips inside the click handler.

**Elsewhere:** `lib/exportExcel.ts` uses a *static* `import * as XLSX`, pulling ~800KB into every page that imports it (`OrganizationModule` and `OperationModule` correctly use `await import`). `SalaryKPIModule.tsx:28` eagerly instantiates all five tab components on every render. Proof screenshots are stored and rendered as **base64 data URLs** (`ReportProofModal.tsx:315`) — full payload in the action response, no CDN, no lazy loading.

**Priority:** High. **Difficulty:** 1 week for polling/caching; 1 month for the matrix rebuild.

---

# PART III — Screen teardowns

## 1. Operation Matrix — `components/OperationModule.tsx` (1,535 LOC)

The screen the firm lives in: 212 companies × 50 report columns (7 of which split into two cells) ≈ 57 cells per row. Also the largest file in the repository.

**Visual hierarchy — 6.0/10.** Typography 7 (semantic scale adopted); Spacing 6; Alignment 7; Whitespace 5 (`h-8` rows are correctly dense); Contrast 6; Focus 3; Grid 7; Balance 6; **Density 8** — genuinely well-judged, the best-tuned density in the app; Consistency 4; Navigation 5; Colour 7 (category tints work); A11y 2; Motion 6; Responsive 4.

**What is right.** The frozen four-column identity block; the two-tier grouped header; the category colour bands; the 300ms debounced search (the only one in the app); `React.memo` with a custom comparator on `StatusCell`; per-user column visibility persisted to `localStorage`; the legend at `:1113-1135`; and **the optimistic write with explicit rollback at `:621-682` — the best-implemented mutation in the codebase**. The `isolation: isolate` comment at `:1138-1143` documents a real stacking-context bug fix with genuine care.

**What is wrong.**

| # | Finding | Evidence |
|---|---|---|
| M1 | **Right-click a header wipes the column** for the whole period. Discoverable only via a `title` tooltip; confirmed by `window.confirm`; optimistically applied with **no rollback on failure**. | `:1237-1242`, `:689-700` |
| M2 | **~5,700 live components, no virtualization.** | `:493`, `:729-732` |
| M3 | **No sorting on any column.** A supervisor cannot order by completion, risk, or accountant. | — |
| M4 | **No row selection, no bulk actions.** Marking 30 firms "topshirildi" is 30 separate popovers. | — |
| M5 | **No URL state.** A filtered matrix cannot be sent to a colleague. | — |
| M6 | The stats modal's cross-filter is **broken**: tiles pass `cat.category` (an enum) into `filterGroup`, which is compared against `c.group` (a label string) from a different taxonomy — the click filters to zero columns. | `:1435-1438` vs `lib/reportGroups.ts` |
| M7 | Pagination scrolls via `document.querySelector('.overflow-auto')` — a global selector grabbing the document's *first* scroll container, not necessarily the matrix. | `:1304-1305`, `:1329-1330` |
| M8 | Sticky offsets are hardcoded pixels (`left-[232px]`, `top-[28px]`); any font or label change desynchronises the two header rows. | `:1196-1199`, `:1164` |
| M9 | Cell popover has **no Escape handler** (the *column* panel does, via `useDismissable`). | `:158-171` |
| M10 | Each cell write fires N sequential `createNotification` awaits inside the handler. | `:649-670` |
| M11 | "REAL-VAQT" badge over data cached up to 5 minutes; uses hardcoded `emerald-500` and gradient hex literals (`#10b981`, `#f59e0b`, `#f43f5e`) rather than tokens; `py-0.2` is not a valid Tailwind step. | `:970-988` |

**Business audit.** For an accountant it is efficient — dense, keyboard-adjacent, fast to mark. For a **supervisor** it fails: no sort, no bulk approve, no way to isolate "everything my team owes this week". For a **director** it is close to useless: 212×57 cells with no rollup beyond one aggregate percentage. This is the screen where ASRO earns its fee, and it is optimised for data entry rather than management.

**Enterprise comparison.** Every benchmark ships what is missing here. Excel/Google Sheets: arrow-key cell navigation, shift-click ranges, fill-down. Linear: ⌘K, bulk edit, saved views, URL state. SAP/Oracle: personalisation profiles, variant management, server-side paging over hundreds of thousands of rows. Notion: per-view filter + sort persisted per user. Airtable: frozen columns *and* row height presets. ASRO has frozen columns and column visibility — a real start, but the two features accountants would name first (keyboard navigation and bulk marking) are absent.

**Redesign.** A real data grid: virtualized rows; keyboard cell navigation (arrows to move, Enter to edit, Esc to cancel, Tab to advance — the Excel model every accountant already knows); shift-click range selection with a bulk-action bar; row checkboxes; sortable headers with `aria-sort`; URL-encoded filter/sort/period so views are shareable; a ⌘K command bar ("mark selected as submitted", "jump to firm…"); undo-by-toast replacing destructive confirms; and a director rollup strip — by category, by accountant, by risk — above the grid.

---

## 2. Organizations — `OrganizationModule.tsx` (678) + `CompanyDrawer.tsx` (1,091)

**Visual hierarchy — 6.5/10.** The one screen using `.erp-table`, and it shows: correct density, column rules, sticky header, sticky first column, no zebra.

**What is wrong.**

| # | Finding | Evidence |
|---|---|---|
| O1 | **C1 — credentials in the Excel export.** | `:137-172` |
| O2 | **The "Arxiv" filter is dead.** The client filters `c.isActive === filterActive`, but `cached-queries.ts:38` hard-filters `isActive: true` server-side. Selecting Arxiv **always yields an empty table**, with no explanation. | `:269-272` |
| O3 | **An empty result set renders as a red error banner** — `"⚠️ Hech qanday firma yuklanmadi"` — so a filter matching nothing looks like a system failure. | `:246-252` |
| O4 | Sorting exists on 2 of 9 columns, via `<th onClick>` with a text arrow; the comparator does `a[sortField] \|\| ''` and string-compares numeric fields. | `:125-131`, `:548` |
| O5 | Search is not debounced — 212 rows re-filtered and re-sorted per keystroke. | `:419` |
| O6 | Eight filters, **zero URL persistence**. | `:62-68` |
| O7 | A dual-scrollbar sync effect exists but `topScrollRef` **is never attached to an element** — dead code. | `:44-59` |
| O8 | Card grid and table both render; the grid is `md:hidden`, not unmounted. | `:450` |
| O9 | `CompanyDrawer` is a 1,091-line, 7-tab surface with no Escape, no focus trap, no dialog role, and tab state resetting to default on every open. | `:174-186` |
| O10 | Service checkboxes autosave the whole company per tick, no busy state, no undo; "Hammasini o'chirish" has no confirmation. | `:878-926` |
| O11 | Save failures are swallowed to `console.error` and the panel closes as if successful. | `:648-650` |
| O12 | The 21-service checkbox grid is a hardcoded inline array, inconsistent with `OnboardingWizard.tsx:21`'s 45-key `ALL_SERVICE_KEYS`. | `:889-936` |

**ERP gap.** This is the client master record and it has **no timeline**. `AuditLog` is written but never surfaced here: no "who changed the tax regime", no contract history, no assignment history, no revenue or profitability rollup on the record. Odoo, Dynamics and Salesforce all put an activity feed on the customer record as the primary right-hand column — it is how account managers work.

**Redesign.** Promote the drawer to a **routed record page** (`/organizations/[id]`), with tabs as sub-routes so they are linkable and back-button-able. Right rail: audit timeline, open obligations, assigned team, profitability. Header: name, INN, risk verdict, tax regime, primary actions. Credentials behind a reveal-and-audit interaction, never in an export.

---

## 3. Dashboard & Cabinets — `dashboard/page.tsx` + 6 cabinets

**Visual hierarchy — 5.0/10.**

**The structural finding: `AccountantCabinet` is unreachable.** It renders only at `dashboard/page.tsx:49`. But `ALLOWED_VIEWS[ACCOUNTANT]` (`lib/permissions.ts:184-191`) is `cabinet, reports, deadlines, tasks, notifications, settings` — **no `dashboard`** — so `proxy.ts:141-147` redirects accountants from `/dashboard` to `/403`. Their home is `ROLE_HOME_ROUTES[ACCOUNTANT] = "/cabinet"`, which renders `MyCabinet`. The sidebar filters the Dashboard item out entirely.

So the best-structured cabinet in the codebase — the only one with a proper `page-header`, a greeting, a period indicator, per-company progress bars with threshold colours, and an explicit per-row empty state — **cannot be reached by the role it was built for**, unless an admin has granted `dashboard` via a `roleViews` override. The same reasoning applies to `bank_manager`, who is redirected at `:33` before the branch is evaluated.

| # | Finding | Evidence |
|---|---|---|
| D1 | **C4 — zeroed fallbacks, including `percent: 100`.** | `:38-44` |
| D2 | `AccountantCabinet` unreachable under default permissions. | `:36-59` + `permissions.ts:184` |
| D3 | The generic fallback dashboard (`:174-229`) is dead code — all six roles are handled above. | `:174` |
| D4 | **`ChiefAccountantCabinet` contains not one `<Link>`** in 344 lines. Team members, pending approvals, and firm cards are all dead `<div>`s. It computes `userName` and `monthLabel` and renders neither — so the screen has no title and no period indicator. | `:73-74` |
| D5 | `SupervisorCabinet` uses legacy classes that no longer resolve (`bg-bg-card`, `border-border-glass`, `text-text-primary`, `divide-slate-700/30`), leaving the panel visually orphaned. `:147` has `hover:bg-black/5 dark:bg-white/5` — the dark variant is **missing `hover:`**, so **in dark mode the row is permanently highlighted**. | `:124-156` |
| D6 | `AdminCabinet`'s "Yangi Xodim" links to `/staff/new` — **the route does not exist**. Quick links use raw `<a href>`, forcing a full page reload. | `:262-280` |
| D7 | KPI tiles are not clickable in any cabinet; audit rows are not clickable. `BankCabinet.tsx:202-207` renders a `ChevronRight` with hover styling and **no navigation behind it**. | — |
| D8 | 6 cabinets hand-roll their own KPI tile markup; the same indigo tint is expressed three ways (`var(--accent-blue-light)`, `"var(--accent-indigo)" + "22"`, `"rgba(99,102,241,0.1)"`). | — |
| D9 | 5 of 6 cabinets have no chart. Only `AdminCabinet` uses Recharts. | — |
| D10 | 14 `as any` casts passing props. | `:51-56` etc. |

**`DeadlinesWidget` is the best component in the shell** — good Uzbek microcopy (`"N kun kechikdi"` / `"Bugun"` / `"Ertaga"`), day-boundary-safe math, a real empty state, risk stripes. Two flaws: every row and **both** counters link to a bare `/deadlines` with no filter, so "overdue" and "upcoming" are indistinguishable destinations; and `getDashboardDeadlines(limit = 6)` orders `dueAt asc` **including overdue**, so with ≥6 overdue items the "Yaqin 14 kun" panel shows only overdue items, permanently.

**Business audit.** For a **director** these dashboards do not support a decision: no trend, no period comparison, no exception list, no drill-down, and — because of C4 — no guarantee the numbers are real. For a **chief accountant** the screen shows their team but lets them do nothing about it. Stripe's home page answers "what changed and what needs me?"; ASRO's answers "here are some totals".

**Redesign.** One `<KpiCard>` and one dashboard grid, every tile a link carrying its filter (`/reports?status=overdue&accountant=me`). Genuine per-widget error and empty states. A director view built on exceptions: overdue by team, at-risk clients, unapproved KPI, period-over-period movement. Route `AccountantCabinet` to `/cabinet` where accountants actually land, or grant the view — but resolve the contradiction.

---

## 4. Staff — `StaffModule.tsx` (541) + `StaffDrawer.tsx` (368)

**Visual hierarchy — 5.5/10.** Rows are `px-6 py-5` / `px-6 py-4` — roughly double `.erp-table` density, so a 45-person list needs scrolling it should not need.

| # | Finding | Evidence |
|---|---|---|
| ST1 | **C2 — password in a 15-second toast.** | `:116-125` |
| ST2 | Five sequential validation guards; only the first ever shows; never inline; `createUserSchema` encodes these exact rules and is unused. | `:80-96` |
| ST3 | Zebra + hover implemented three times per row in inline JS. | `:413-415` |
| ST4 | **Per-row O(n) work**: each row runs `companies.filter(...)` — 45 × 212 ≈ 9,500 comparisons per render, duplicated in the card view. | `:401-404`, `:339-342` |
| ST5 | Delete says *"o'chirasizmi?"* (delete) but calls `deactivateUser` (soft delete) — the copy misrepresents the action. Built by string concatenation. | `:369`, `:458` |
| ST6 | `TableToolbar` is imported but used **only for the grid/list toggle**; search and filters sit outside it in bespoke markup, leaving the shared component's own slots unused. | `:204`, `:163-202` |
| ST7 | Reads `?userId=` via `new URLSearchParams(window.location.search)` instead of `useSearchParams`, so it does not react to client-side navigation. | `:51-60` |
| ST8 | No loading state of any kind — loading and empty are indistinguishable. | `:466-473` |
| ST9 | No pagination, no export, no bulk actions. `StaffDrawer` has no Escape, no focus trap, and resets to the "login" tab on every open. | — |
| ST10 | Uses `import('sonner').then(…)` dynamically at 8 call sites while 33 other files import statically. | `:82-129` |

**ERP gap.** No workload view (who carries how many companies, weighted by complexity), no capacity signal, no skills matrix, no leave/absence integration into assignment, no onboarding/offboarding checklist. For an accounting firm, staff utilisation *is* the P&L — and `/profitability` exists but does not connect here.

---

## 5. Payroll — `PayrollTable.tsx` (621) + `PayrollDrafts.tsx` (646)

**Visual hierarchy — 5.0/10.** No page title anywhere; the header is a tab bar (`PayrollClient.tsx:22-43`) using unresolved legacy classes (`bg-bg-card`, `text-text-primary`, `shadow-blue-500/20`).

| # | Finding | Evidence |
|---|---|---|
| P1 | **No toast in the entire module.** Success is a silent refetch; errors are `alert((e as any)?.message)`. On the screen that moves money. | `:271`, `:274` |
| P2 | **No loading state** — while `loadMonthlyData` runs, the table shows *the previous month's numbers*. A user changing period sees stale money as though it were current. | — |
| P3 | Column visibility uses **two divergent mechanisms in the same table** — `<thead>` filters the array, `<tbody>` uses per-cell conditionals — and the empty-state row hardcodes `colSpan={9}`, wrong whenever any column is hidden. | `:434`, `:476-514`, `:551` |
| P4 | The `summaries` memo does a nested `staff × ops × companies` walk with `companies.find()` **inside** the ops loop. | `:91-246`, `:176` |
| P5 | Adjustment modal: amount has **no validation** (`amount: 0` is submittable), save is **not disabled while saving**, no Escape, no focus trap. | `:563-615` |
| P6 | No search, no filters, no pagination, no export on a financial table. | — |
| P7 | The mobile card list renders in parallel with the desktop table. | `:348-388` |

**Business audit.** Payroll is the highest-stakes, lowest-feedback screen in the product: no confirmation of success, no loading state, no validation on amounts, no export for reconciliation, and no audit trail surfaced. `PayrollAdjustment` uses a mixed sign convention (project memory records that readers must use `adjustmentMagnitude`, not `SUM()`) — a trap with no UI guardrail. It needs a **four-eyes approval flow**, a locked-period indicator, a variance-vs-last-month column, and an exportable payslip.

---

## 6. Reports (Hisobotlar tab) — `HisobotlarModule.tsx` (324)

The thinnest screen carrying a senior workflow.

| # | Finding | Evidence |
|---|---|---|
| R1 | **No search and no filters at all.** | — |
| R2 | **No pagination** — renders every row returned. | `:173` |
| R3 | Fetches client-side in `useEffect` rather than via the server component, so it double-loads on mount and bypasses the SSR cache. | `:49` |
| R4 | The "Fayl" column renders a `<Download>` icon that is **not a link and has no handler** — a purely decorative affordance on a document-management screen. | `:184` |
| R5 | Five `alert()` calls and a **`window.prompt("Rad etish sababi:")`** capturing the rejection reason — business data through an OS dialog. | `:65-85`, `:68` |
| R6 | Validation is one `alert("Firmani tanlang")`. Period is a free-text input with placeholder `"2026-H1"` and no format validation. | `:80`, `:303` |
| R7 | Selects are silently truncated: `companies.slice(0, 300)`, `staff.slice(0, 200)` — with 212 companies this is currently invisible, and will fail silently on growth. | `:298`, `:309` |
| R8 | Hover via inline JS; hardcoded `emerald-500`; no sticky header; no sortable columns. | `:178`, `:119` |

Contrast with `ReportProofModal` — same domain, same team, vastly better execution. The gap is the absence of shared primitives, not of skill.

---

# PART IV — ERP & product gaps

**The domain model is this product's greatest asset and the UI under-serves it.**

| # | Gap | Detail |
|---|---|---|
| E1 | **No Auditor or Partner read-only tier** | Six roles exist; none can inspect without mutating. For an accounting firm this is a genuine compliance gap — external auditors, partners, and regulators all need scoped read-only access. |
| E2 | **HR and Finance are capabilities, not roles** | Both are bolted onto `admin`/`chief_accountant`, so least-privilege is unachievable for exactly the two functions that most need it. Granting someone payroll access grants them everything. |
| E3 | **Permission grid has odd holes** | `supervisor` sees `expenses` but not `kassa` — spend visibility without the cash it comes from. `inventory` is granted to `super_admin` **alone**: an entire module for one user. `chief_accountant` has `payroll` but not `audit_logs`. |
| E4 | **`AuditLog` is written and never surfaced** | No timeline on a company, no history on a report cell, no "who changed this and when" anywhere a user is actually looking. The data exists; the UI does not expose it. |
| E5 | **Permission changes take up to 60s to reach the router** | `revalidateTag("system-settings")` clears the RSC cache but not `proxy.ts`'s 60-second module cache — a window where the sidebar and the router disagree. |
| E6 | **Nothing explains why an action is unavailable** | `lib/reportPermissions.ts:88-105` is the one place that returns a user-facing Uzbek reason (*"Hisobotni tasdiqlash faqat nazoratchi huquqida…"*). Everywhere else, unavailable things simply vanish from the nav. That pattern should be the product-wide standard. |
| E7 | **No saved views** | Every user re-applies the same filters daily; none can be named, saved, or shared. |
| E8 | **No SLA or workload surface** | `/profitability` and `/fair-kpi` exist but do not connect to staff assignment, so nobody can see who is over capacity. |
| E9 | **No client-facing status** | The portal (`app/(portal)/`) is a bare shell — no obligation status, no document requests, no deadline visibility for the client. |
| E10 | **Design docs are stale and actively harmful** | All five `design-system/*.md` describe the pre-redesign tree; `MASTER.md` says so in its own header, and its colour table, font statement (claims Inter; the app ships IBM Plex Sans), and z-index ladder all contradict shipped `globals.css`. Stale design docs cause the forking they were written to prevent. |

---

# PART V — Conceptual redesign

## The organising idea

**Make forking harder than reusing.** `CONSISTENCY.md:184` already reached this conclusion. The fix is not discipline — it is depth. `.btn-primary` loses to a fork because it has no size, tone, loading, icon, or disabled variants. A primitive that covers the real cases wins by default.

## The nine primitives

| Primitive | Replaces | Closes |
|---|---|---|
| `Button` | 288 buttons / 6 styles | S1; `text-white` dark-mode bug |
| `Field` | 149 inputs, 7 labels, 4 input systems | S4; the labelling half of S6 |
| `Modal` | 24 `fixed inset-0` shells | **C5 entirely** — dialog role, focus trap, Escape, scroll lock |
| `ConfirmDialog` | 15 `confirm()` + 3 `prompt()` | **C3** — scope statement, type-to-confirm, undo |
| `DataTable` | 26 table implementations | S3 — sort, selection, bulk bar, URL state, density, export |
| `Card` | `.dashboard-card` forks | S1 |
| `Badge` | 5 badge systems | S1 |
| `EmptyState` | 8 paddings, 6 copy strings | S5 |
| `Skeleton` | 5 loading treatments | S5, S7 |

Building these retires ~2,000 inline style objects and **closes the entire accessibility category as a side effect** — semantics become properties of the primitive rather than 24 things to remember.

## Screen concepts

**Matrix → a real data grid.** Virtualized rows; Excel-model keyboard navigation (arrows, Enter to edit, Esc to cancel); shift-click ranges and a bulk-action bar; sortable headers; URL-encoded state; a ⌘K command bar; undo-by-toast instead of destructive confirms; a director rollup strip above the grid.

**Company → a workspace, not a drawer.** `/organizations/[id]` with tabs as sub-routes. Right rail: audit timeline, open obligations, assigned team, profitability. Credentials behind reveal-and-audit, never exported.

**Cabinets → one composable grid.** One `<KpiCard>`, every tile drill-down-linked with its filter pre-applied, genuine per-widget error states so zeros can never masquerade as data, and a director view built on exceptions rather than totals.

**Shell → wayfinding.** Breadcrumbs, per-page `metadata`, one nav registry, a real ⌘K palette that deep-links to records, `loading.tsx` / `error.tsx` / `not-found.tsx` on every route group.

---

# PART VI — Roadmap

| Phase | Priority | Effort | Contents |
|---|---|---|---|
| **0 — Stop the bleeding** | Critical | **≤1 day** | C1 credential export · C2 password toast · C4 false-zero fallbacks (incl. `percent: 100`) · C3 missing rollback in `handleClearColumn` · O2 dead Arxiv filter · O3 empty-as-error · D2 `/403` → role-aware home · D6 dead `/staff/new` link · D5 dark-mode permanent highlight · S2 raw role enums in the sidebar · the dead language switcher. All small, all user-visible today. |
| **1 — Primitive layer** | Critical | **1 week** | The nine primitives. `Modal` first (closes C5 and most of S6 at once), then `ConfirmDialog` (closes C3 with undo), `Field` (closes the 149/7 gap), then `Button` / `Badge` / `Card` / `EmptyState` / `Skeleton`. Promote Radix to a direct dependency. |
| **2 — Table platform** | High | **1 week** | One `DataTable`: sort with `aria-sort`, sticky header, density, selection + bulk bar, URL-persisted state, debounced search, CSV + Excel. Migrate Organizations first as the reference, then Staff, Expenses, Payroll. |
| **3 — Matrix rebuild** | High | **1 month** | Virtualization, keyboard grid navigation, bulk marking, command bar, undo, fixed cross-filter taxonomy (M6), removal of the sequential notify loop (M10), sticky offsets from measurement rather than magic numbers. |
| **4 — Shell & wayfinding** | High | **1 week** | `loading.tsx` / `error.tsx` / `not-found.tsx`, Suspense boundaries, breadcrumbs, per-page `metadata`, real ⌘K with deep links, single nav registry, single role-label source, replace the 15s poll with targeted revalidation + `{ enabled: !isModalOpen }`. |
| **5 — ERP depth** | Medium | **1 month** | Audit timeline on records, saved views, Auditor/Partner read-only tier, HR and Finance as first-class roles, deadline drill-through with filters, "why is this disabled" explanations product-wide, payroll four-eyes approval. |
| **6 — Premium layer** | Medium | **3 months** | Optimistic UI everywhere, skeletons throughout, command-driven workflows, inline editing, density modes, print/PDF stylesheet, client portal build-out. |

**Phases 0–2 total roughly two weeks and move the overall score from 4.2 to approximately 7.0** — because they are systemic fixes landing on all 44 routes simultaneously. Phase 0 alone closes both security findings and the most dangerous UX defect in the product.

---

---

# Implementation status

| Phase | State | Landed |
|---|---|---|
| **0 — Stop the bleeding** | ✅ **Done** | C1 credential export · C2 password toast · C3 `handleClearColumn` rollback · C4 false-zero fallbacks + `app/(dashboard)/error.tsx` · O2 archive query · O3 empty-as-error · D2 `/403` role-aware · D5 dark-mode hover · D6 `/staff/new` → `/staff?new=1` + `<Link>` · S2 sidebar `ROLE_LABELS` · S2 dead language switcher removed |
| **1 — Primitive layer** | ✅ **Done** | 8 primitives in `components/ui/` + `hooks/useModalA11y.ts`. All **15** native `confirm()` migrated to `ConfirmDialog`. `ConfirmProvider` wired into both the `(dashboard)` and `(admin)` shells; `(admin)` also gained the `ErrorBoundary` it never had. `CompanyDrawer` and `StaffDrawer` gained `role="dialog"`, `aria-modal`, focus trap, focus restore and Escape. |
| **2 — Table platform** | ✅ **Done** | `components/ui/DataTable.tsx` + `hooks/useTableState.ts` + `lib/exportTable.ts`. Sorting with `aria-sort`, `scope="col"`, `<caption>`, row selection + bulk-action bar, density, pagination, hidden columns, CSV **and** Excel. URL-persisted search/sort/filter/page/density — a filtered view is finally shareable. All four target tables migrated: **Staff**, **Expenses**, **Organizations**, **Payroll**. |
| **3 — Matrix rebuild** | ✅ **Done except bulk marking** | M3 sorting (name / INN / accountant / **completion %**) with `aria-sort` · M5 URL state · M6 broken cross-filter · M7 global-selector scroll bug · M9 Escape on the cell popover · M10 notification loop · M11 dishonest badge, invalid class, hardcoded hex. **M2 virtualization shipped** (`@tanstack/react-virtual`, approved by the team). **M4 (bulk marking)** still blocked on M8. |
| **4 — Shell & wayfinding** | ✅ **Done** | `loading.tsx` (skeleton instead of a blind wait), root `not-found.tsx`, **breadcrumbs in both shells** (there were zero), per-page `metadata` on 24 routes (there was one), `<PageHeader>` on the 8 pages that had no heading at all, and a **real ⌘K command palette** — overlay, ↑↓/Enter, combobox semantics, works on mobile, deep-links to records. The nav registry fork is closed: `lib/navigation.ts` is now the single source the sidebar and the palette both read. |
| **5 — ERP depth** | 🟡 **Audit timeline shipped; roles need a migration** | `getRecordHistory()` + `<RecordTimeline>` — the company drawer now has a **Tarix** tab answering “who changed the tax regime, and when”. Also the centralised polling guard. The Auditor/Partner tier and HR/Finance as roles are blocked on a Prisma enum migration — see below. |
| **6 — Premium layer** | 🟡 **Typographic pass done; inline styles remain** | The visual restraint pass — see below. Remaining: ~2,000 inline `style` objects (adopt `Card`/`Badge` broadly), optimistic UI, inline editing, print stylesheet. |

### Notes from the Phase 2 build

- **The density toggle exposed a specificity trap.** `.erp-table tbody td` has specificity (0,1,2) and silently beats Tailwind's `px-3`/`py-1.5` (0,1,0) — so a utility-class density toggle renders but does nothing. Density is now an attribute selector, `.erp-table[data-density="compact"] tbody td` (0,2,2), defined in `globals.css` next to the base rule. **Any future attempt to override `.erp-table` cell padding with utilities will hit the same wall.**
- **Sorting compares types, not strings.** The old `OrganizationModule` comparator did `a[field] || ''` and string-compared numeric columns, so `100` sorted before `20`. `DataTable` branches on `typeof` and uses `localeCompare(…, "uz")` for text.
- **CSV export guards against formula injection** — a cell beginning `=`, `+`, `-` or `@` is prefixed with an apostrophe, and a UTF-8 BOM is emitted so Excel reads `o'`/`g'` correctly instead of as cp1251.
- **Card grids now unmount.** Both modules hid the card view with a `hidden` class while React kept building every card alongside every table row. Note that the HTML `hidden` *attribute* does not fix this either — only conditional rendering does.
- **Two more O(n×m) walks removed.** `StaffModule` recomputed `companies.filter(...)` per row (45 × 212 ≈ 9,500 comparisons per render, duplicated in the card view); `OrganizationModule` called `operations.find(...)` per row in *both* the filter pass and the render pass. Both are now single indexed `Map` builds.
- **The dead dual-scrollbar effect is gone** (`OrganizationModule`, finding O7) — `topScrollRef` was never attached to an element, so the whole `useEffect` had no effect.
- **Payroll gained a loading state** (finding P2). It had none, so while `loadMonthlyData` ran the table showed *the previous month's* figures as though they were current — the worst failure mode on a money screen.
- **Payroll's `colSpan={9}` bug is structurally impossible now** (finding P3). Hidden columns were previously filtered in `<thead>` but conditionally rendered per-cell in `<tbody>`, with the empty row hardcoding 9. `DataTable` resolves `hidden` once and every consumer — header, cells, empty state, export — reads from that single list.

### Notes from the Phase 3 build

- **M6 was worse than this audit recorded.** The report said the cross-filter "likely filters to zero columns". It is more specific than that: `col.group` has seven values (`Oylik`, `Soliqlar`, `Statistika`, `IT Park`, `Komunalka`, `Soliq H/T`, `Yillik`) while `ReportCategory` has four (`OPERATSION`, `SOLIQ`, `STATISTIKA`, `MAXSUS`). They can never match, so clicking a stat tile emptied `visibleColumns` and **the entire matrix went blank** with no explanation and no visible filter to clear. Category filtering is now a separate piece of state with a dismissible chip in the toolbar.
- **M10 hid a data-integrity bug, not just a performance one.** The loop was labelled `// Notifications logic (non-blocking)` but was a sequential `await` **inside the same `try` as the cell write**. A single failed `createNotification` therefore fell into the `catch`, which **rolled back an already-persisted cell** and showed a save error. Notifications now run in parallel, after the write, outside its error path.
- **The "REAL-VAQT" badge was false advertising.** It pulsed green over data that `unstable_cache(…, { revalidate: 300 })` allows to be five minutes stale. It now reads `AVTO-YANGILANISH` and its tooltip states the actual 15-second refresh interval.
- **Sorting by completion % is new capability, not a port.** The matrix previously had no sort at all; the most valuable order for a supervisor — least-complete firms first — did not exist. `rowCompletion()` derives it from the visible columns.

### Notes from the Phase 4 build

- **The nav fork was worse than a duplication.** The sidebar knew 21 destinations, `GlobalSearch` knew 10 — so Deadlines, Tasks, Profitability, Documents, Inventory, Settings, Admin and Audit Log were **unfindable by search**. Search also used the override-blind `canSeeView`, so a view an admin granted appeared in the sidebar and passed the router but never showed up in search. Both now read `lib/navigation.ts` and the palette receives the same `allowedViews` the layout already computed.
- **The old palette lied about its keyboard support.** Every result row rendered a `⏎` icon, but Enter did nothing — there was no key handling at all, and ⌘K merely focused an inline input. Arrow keys, Enter, `role="combobox"` and `aria-activedescendant` are now real.
- **Search did not exist on mobile.** The whole component was `hidden md:flex`.
- **Results went to list pages.** Finding a firm by INN dropped you on an unfiltered table. They now deep-link — `/organizations?org_q=<INN>` and `/staff?userId=<id>` — which the Phase 2 URL state already knows how to read.

### The typographic restraint pass (Phase 6)

Structure alone did not make the product feel premium, and the user was right to say so. The measurable cause was **typographic shouting**:

| | Before | After |
|---|---:|---:|
| `uppercase` | 593 | 474 |
| — of which on *content* sizes (`text-body`/`sm`/`lg`/`xl`/`2xl`) | **119** | **0** |
| `font-black` (900) | 240 | **0** |
| Distinct `h1`/`h2` sizes | **7** | **2** |
| Card padding steps | 8 | 3 |

Three rules were applied:

1. **Uppercase belongs to micro-labels only.** The 474 remaining instances are all on `text-micro`/`text-meta` (10–11px) — table headers and eyebrow labels, exactly where Stripe uses it. Company names, staff names, headings and values were being set in uppercase with wide tracking, which reads as shouting and destroys the legibility of proper nouns. When everything is emphasised, nothing is.
2. **`font-black` (900) is not a UI weight.** At 10–13px it closes the counters and renders as a dark blob. Linear and Stripe top out around 600 for interface text. All 240 became `font-semibold`.
3. **Two heading sizes, not seven.** A section heading was `text-sm` on one page and `text-2xl` on another, so there was no hierarchy to read. Now `h1` = `text-xl` (page title), `h2` = `text-sm` (section), everywhere.

Card padding was collapsed from eight steps (`p-4/5/6/8/10/12/16`) to three (`p-5` standard, `p-4` dense, `p-0` for tables).

### Notes from the Phase 5 build

- **E4 — the audit trail existed and was invisible.** `AuditLog` is written faithfully by `lib/auditTrail.ts` with `tableName` + `recordId`, but `getAuditLogs()` is admin-only and filters the whole journal, so it could not be used on a record page. A record-scoped `getRecordHistory()` was added (senior roles only — this is a supervisory tool, not something an accountant sees for their own firms), plus a `<RecordTimeline>` that diffs `oldData` → `newData` and **redacts any field matching `pass|token|secret|hash`** before rendering. No migration was needed; the data was already there.
- **S7 — the polling guard is now centralised.** The hook's own docstring recommended `{ enabled: !isModalOpen }` and **all 12 call sites passed nothing**. Rather than thread a flag through twelve screens, the hook now checks the DOM for `[role="dialog"]` — which works precisely because Phase 1 gave every modal real dialog semantics. Note that `OrganizationsClient`'s compensating sync effect was **kept**: it covers the explicit `router.refresh()` after a save, which the guard deliberately does not block.

### Blocked on a database migration — needs a decision

`UserRole` is a **Prisma enum**, not a string column:

```prisma
enum UserRole { super_admin  admin  chief_accountant  supervisor  accountant  bank_manager }
```

So **E1 (Auditor/Partner read-only tier)** and **E2 (HR and Finance as first-class roles)** cannot be done in application code alone — each needs `ALTER TYPE "UserRole" ADD VALUE …` plus entries in `ALLOWED_VIEWS`, `ROLE_LABELS`, `ROLE_COLORS` and `ROLE_HOME_ROUTES`. The addition is backward-compatible (existing rows keep their value), but it is a production schema change, and this repo's migration workflow is deliberately manual — `prisma migrate dev` is not to be used here because the schema carries uncommitted obligation-engine models. That decision was left to the team rather than executed.

### Deferred from Phase 3, with reasons

- **M2 — virtualization: shipped.** The team approved adding `@tanstack/react-virtual` (~570 KB installed, one of five UI-layer dependencies). Only the visible window plus 6 rows of overscan renders — roughly **34 rows instead of 100, so ~1,900 cells instead of ~5,700 (2.9×)**. Two details mattered: `<thead>` is `sticky`, not `fixed`, so it occupies flow space and the virtualizer needs `scrollMargin` set to the measured tbody offset — without it the window is off by ~2 rows; and `onCompanySelect` was an inline arrow passed to the memoized `OperationRow`, so `React.memo` compared a fresh function identity every render and **never once hit** — it is now a stable `useCallback`. With windowing in place, `rowsPerPage` rose 100 → 250, so all 212 companies sit in one continuous scroll and the pager disappears until the dataset outgrows it.
- **M4 — bulk marking.** Still blocked on **M8**, independently of virtualization. Adding a selection checkbox column shifts every frozen column, and those offsets are hardcoded pixels (`left-10`, `md:left-[232px]`, `md:left-[312px]`, `top-[28px]`). M8 must be converted to measured offsets first, or bulk selection will visibly break the frozen columns.

### Remaining after Phase 1

- **~22 modals still hand-rolled.** The two highest-risk drawers are fixed; the rest keep their `fixed inset-0` markup and should adopt `Modal` or `useModalA11y` as they are touched. This is mechanical, not architectural.
- **20 `alert()` and 3 `window.prompt()` sites remain.** The prompts (capturing rejection reasons) need a small reason-textarea dialog — `ReportProofModal.tsx:361-385` already contains the right pattern to copy.
- **The primitives are built but not yet adopted** by existing screens beyond the confirm migration. `Button`, `Field`, `Card`, `Badge`, `EmptyState`, `Skeleton` will retire their ad-hoc equivalents during the Phase 2 table work.

## Verification

1. **Every quantitative claim is re-greppable** — all headline numbers were produced by direct `grep`/`find` against this working tree, not inferred.
2. **Manual spot-checks** (`npm run dev`): Organizations export → open the `.xlsx` (C1) · add a staff member (C2) · clear a matrix column with the network offline (C3) · load `/dashboard` with Postgres stopped (C4) · Tab-and-Escape through `CompanyDrawer` (C5) · toggle Arxiv (O2) · sign in as `accountant` and visit `/dashboard` (D2, `/403` loop).
3. **Every score carries its own evidence line**, so the numbers are arguable rather than asserted.

## Caveat on scope

This is a static audit of the shipped tree. It does not measure runtime performance against production data, does not include user research with the firm's accountants, and does not evaluate the Telegram bot or the `(portal)` client surface beyond its shell. The role-permission findings assume default `ALLOWED_VIEWS`; a `roleViews` override in `SystemSetting` can change reachability at runtime — D2 in particular should be confirmed against the production setting.
