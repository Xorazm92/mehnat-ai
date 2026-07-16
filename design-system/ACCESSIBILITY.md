# Accessibility Report — Mehnat ERP

**Audited** 2026-07-16 · 94 `.tsx` files (`app/**`, `components/**`) + `app/globals.css` · WCAG 2.1 AA
**Method** static analysis; every finding carries a `file:line`. No automated axe run (no browser harness in repo).

## Verdict

**The application is not usable without a mouse, and not usable with a screen reader.** This is not a
polish gap — it is a category of user who cannot operate the product at all.

Four numbers, each verified independently:

| | Count |
|---|---|
| `aria-label` in 94 files | **4** |
| `htmlFor` (label↔input association) | **0** |
| `role="dialog"` / `aria-modal` across 19 modals | **0** |
| `:focus-visible` | **0** |

This matters beyond ethics: staff enter KPI that determines salary, and an accountant who works
keyboard-first — normal in accounting — cannot reliably tab through the checklist that sets their pay.

---

## CRITICAL

### A1 · No form field is programmatically labelled
**0 `htmlFor`, 0 input `id`, 0 `aria-labelledby`** — yet 87 `<label>` elements exist, every one a
visual sibling that is never associated. A screen reader announces "edit text, blank".

`OnboardingWizard.tsx:145-149` · `StaffModule.tsx:210-217,248-251` ·
`admin/AdminUserManager.tsx:199-265` (15+ fields: name, email, PINFL, role, password) ·
`cabinets/MyCabinet.tsx:267-280`

**The codebase already knows the fix.** `app/(auth)/login/page.tsx:172-178` wraps
`<label><span>{label}</span>{children}</label>` — implicit association, correct. It is applied in
exactly one place. Propagate that `Field` helper.

**WCAG** 1.3.1 (A), 3.3.2 (A), 4.1.2 (A)

### A2 · 19 modals with no dialog semantics, no focus trap, no Escape
No `role="dialog"`, no `aria-modal`, no focus management anywhere. Focus stays behind the modal;
keyboard users tab into the page underneath while a dialog covers it. Only `GlobalSearch.tsx:46`
handles Escape.

`CompanyDrawer.tsx:178` · `StaffDrawer.tsx:61` · `HisobotlarModule.tsx:172,230` ·
`KPIRulesManager.tsx:253` · `AttendanceModule.tsx:276` · `InventoryModule.tsx:246` ·
`DocumentsModule.tsx:178` · `ExpenseModule.tsx:383` · `KassaModule.tsx:320` ·
`PayrollDrafts.tsx:358` · `ReportProofModal.tsx:181` · `admin/AdminUserManager.tsx:285` (+7 more)

**Root cause is architectural**, not 19 separate bugs: there is no shared `Modal` primitive. One
correct component fixes all 19. See UI-IMPROVEMENTS P0-2.

**WCAG** 4.1.2 (A), 2.4.3 (A), 2.1.2 (A)

### A3 · Icon-only buttons with no accessible name
Roughly 30 buttons announce only "button". Worst:

- `SettingsModule.tsx:145-147` — **a completely empty `<button>`**: no children, no label, colour
  conveyed only by `style={{background: c}}`, selection only by a 2px outline. The avatar-colour
  picker is invisible and unusable to a screen-reader user.
- `ui/MonthPicker.tsx:90-102` — prev/next year chevrons in a **shared component** used across Payroll,
  Organizations and KPI.
- Modal close buttons repeated with no name: `AttendanceModule.tsx:281` · `InventoryModule.tsx:251` ·
  `DocumentsModule.tsx:183` · `ExpenseModule.tsx:391` · `KassaModule.tsx:328` · `PayrollDrafts.tsx:384`
- Destructive with no name: `KPIRulesManager.tsx:243` (delete rule) · `HisobotlarModule.tsx:222`
  (delete report) · `CompanyDrawer.tsx:552-566` (delete credential)

An unlabelled **delete** button is the worst case in the set.

**WCAG** 4.1.2 (A)

### A4 · Focus indicator removed with no replacement
`outline-none` is applied alongside a static inline `style` object that cannot express `:focus`, and
no Tailwind `focus:` class is present — focus becomes **completely invisible**.

`admin/AdminUserManager.tsx:55-57` (≈15 fields) · `admin/AdminDepartments.tsx:34-35` ·
`admin/settings/AdminSettingsClient.tsx:26-27` · `admin/operation-matrix/OperationMatrixClient.tsx:11` ·
`AttendanceModule.tsx:290-326` (every field) · `InventoryModule.tsx:260-291` (every field) ·
`DocumentsModule.tsx:193-208` (every field) · `kpi/KpiEntryCard.tsx:156,178` (**the KPI inputs that set pay**) ·
`PayrollTable.tsx:268` · `PayrollDrafts.tsx:219` · `ReportProofModal.tsx:247,319`

**Also:** `--text-muted` (#94A3B8) on `--bg-card` (#FFFFFF) is **≈2.6:1**, below the 4.5:1 minimum, and
is used for hints and meta throughout.

**WCAG** 2.4.7 (AA), 1.4.3 (AA)

### A5 · `<div onClick>` as the only interaction — not keyboard reachable
No `tabIndex`, no `role`, no `onKeyDown`:

- `StaffModule.tsx:330` — the row that opens the staff drawer
- `KassaModule.tsx:187` — the transaction row that opens a payment
- `NazoratchiChecklist.tsx:153` — **the Company selector on the KPI checklist**
- `KPIRulesManager.tsx:197` — a hand-built toggle switch with no `role="switch"`/`aria-checked`
- `OrganizationModule.tsx:492` — password reveal

A keyboard user cannot select a Company to score. That blocks the primary workflow.

**WCAG** 2.1.1 (A), 4.1.2 (A)

---

## SERIOUS

### A6 · Meaning carried by colour alone
- `OperationModule.tsx:53-58,162-190` — `PROOF_DOT` maps pending/approved/rejected to three colours,
  and the `title` is the **identical string** for all three. The state is *only* the RGB value.
- `kpi/KpiEntryCard.tsx:113-133` — Verdict option buttons swap background/colour only; no
  `aria-pressed`, no icon, no text. **This is the Verdict — the domain's core categorical value**
  (`CONTEXT.md`), and it is unreadable to a colour-blind Supervisor.
- `OrganizationModule.tsx:75-80` — `🔴🟡🟢` emoji as status.

**WCAG** 1.4.1 (A)

### A7 · `prefers-reduced-motion` honoured nowhere
0 matches, against 246 `animate-*`/`transition-*` usages and four infinite animations
(`globals.css:541-559`: `.animate-spin`, `.animate-pulse-glow`, `.animate-float`, `.animate-shimmer`).
Every modal opens with `animate-fade-in`/`animate-scale-in`.

**WCAG** 2.3.3 (AAA) — not required for AA, but cheap: one `@media` block in `globals.css`.

### A8 · Heading structure
Modules whose only headings live inside modals — nothing identifies the page on load:
`InventoryModule.tsx` (only `h3` at :250) · `DocumentsModule.tsx` (:182) · `AttendanceModule.tsx` (:280) ·
`SettingsModule.tsx` · `ExpenseModule.tsx` (jumps to `h3`/`h4`).
Admin renders sidebar `h2` (`admin/AdminSidebar.tsx:40`) **before** page `h1` → h2 precedes h1.
Login: `h2` at `login/page.tsx:62` precedes the `h1` at :87.

**WCAG** 1.3.1 (A), 2.4.6 (AA)

### A9 · Placeholder as the only label
36 inputs — with no `<label>` *and* no `aria-label`, the accessible name is empty once the user types.
`GlobalSearch.tsx:101` · `AttendanceModule.tsx:163` · `KassaModule.tsx:157` ·
`OrganizationModule.tsx:410` · `NazoratchiChecklist.tsx:142` · `admin/AdminUserManager.tsx:133,253`

**WCAG** 3.3.2 (A)

---

## MODERATE

**A10 · ARIA effectively absent.** No `aria-expanded` on any popover/dropdown
(`GlobalSearch`, `ui/MonthPicker.tsx:62-68`, `DashboardTopBar.tsx:205-207`), no `aria-current` on
active nav, no `aria-live` for save/error outside the `sonner` toaster.

**A11 · `title` used instead of `aria-label`.** Works in some AT, unreliable on touch:
`StaffDrawer.tsx:233-260` · `StaffModule.tsx:503-506` · `ExpenseModule.tsx:343-358`.

**A12 · `<html lang="uz">` is hardcoded** (`app/layout.tsx:71`) while `Language = 'uz' | 'ru'`
(`types.ts:3`) drives dozens of components. Correct *today* only because the language switcher
(`DashboardTopBar.tsx:116-135`) **has no `onClick` and does nothing** — a dead control. Fixing the
switcher without setting `document.documentElement.lang` turns this into a real 3.1.1 failure.

---

## Passing

- **Alt text** — every `<img>`/`<Image>` has `alt` (`ReportProofModal.tsx:218,284`,
  `DashboardTopBar.tsx:103`, `login/page.tsx:154`). No violations.
- **Zoom not disabled** — `app/layout.tsx:55-61` sets no `maximumScale`/`userScalable`.
- **Login form** — the one correctly-labelled form in the app.

## Fix order

1. **A1 + A4** — a labelled `<Field>` + a global `:focus-visible` ring. Two changes, most of the app.
2. **A2** — one `<Modal>` primitive → 19 call sites.
3. **A3** — `aria-label` on every icon button; start with destructive ones.
4. **A5** — `<div onClick>` → `<button>`, starting with `NazoratchiChecklist.tsx:153`.
5. **A6** — text/icon on Verdicts.
6. **A7** — one `@media (prefers-reduced-motion: reduce)` block.
