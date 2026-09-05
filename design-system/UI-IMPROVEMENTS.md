# UI Improvement Report — Prioritized

> **Holat: TARIX** · 2026-07-16 — bu hisobot redizayndan OLDINGI daraxtni tasvirlaydi.
> Amaldagi dizayn tizimi kodda: `components/ui/` primitivlari va `app/globals.css`
> tokenlari. [`docs/audit/UI_AUDIT_2026-07.md`](../docs/audit/UI_AUDIT_2026-07.md) §E10
> aynan shu beshta faylni “eskirgan va zarar keltiruvchi” deb belgilagan — ular
> qaror tarixi uchun saqlanadi, mo'ljal sifatida emas.
> Hujjatlar xaritasi: [`docs/README.md`](../docs/README.md)

**Audited** 2026-07-16 · 94 `.tsx` files, 803-line token system · Read-only audit, no code changed
**Companion reports** [MASTER.md](./MASTER.md) · [ACCESSIBILITY.md](./ACCESSIBILITY.md) · [RESPONSIVE.md](./RESPONSIVE.md) · [CONSISTENCY.md](./CONSISTENCY.md)

## The headline

**This codebase has a good design system and a UI that mostly ignores it.** `globals.css` is
complete, semantic, and theme-correct — and 93% of buttons, 82% of inputs, and 16 of 17 tables
bypass it. Meanwhile the app is **not operable by keyboard or screen reader**: 4 `aria-label`s in 94
files, 0 `htmlFor`, 0 `role="dialog"`, 0 `:focus-visible`.

Ranking is by **user harm × blast radius ÷ effort**. The top items are small, shared changes that fix
hundreds of call sites — because nearly every problem here is one missing primitive repeated N times.

---

## P0 — Broken for real users

### P0-1 · Build a `<Field>` and turn on focus rings
**Fixes:** A1 (0 `htmlFor`, 87 orphan labels), A4 (invisible focus), A9 (36 placeholder-only inputs)
**Blast radius:** ~110 inputs across ~20 files · **Effort:** S

No form field in the app is programmatically labelled, and `outline-none` + inline `style` leaves
focus **completely invisible** — including `kpi/KpiEntryCard.tsx:156,178`, the inputs that set salary.

`app/(auth)/login/page.tsx:172-178` already contains the correct pattern (`<label>` wrapping its
input). Promote that `Field` helper to `components/ui/`, plus one global rule:

```css
:where(button, a, input, select, textarea, [tabindex]):focus-visible {
  outline: 2px solid var(--input-focus-border);
  outline-offset: 2px;
}
```

Two changes. Most of the application.

### P0-2 · Build a `<Modal>` primitive
**Fixes:** A2 (19 modals, no dialog semantics/focus trap/Escape), C6 (21 hand-rolls, z-index 10→10000)
**Blast radius:** 19 files · **Effort:** M

There is no shared Modal. Every feature hand-rolls `fixed inset-0`, and none has `role="dialog"`,
`aria-modal`, focus trap, or Escape. `ui/MonthPicker.tsx:71` and `ReportProofModal.tsx:181`
independently chose `z-[10000]`.

One component with `role="dialog"` + `aria-modal="true"` + focus trap + Escape + a fixed z-layer fixes
**both the accessibility failure and the consistency failure at once**. This is the highest-leverage
change in the report.

### P0-3 · KPI Leaderboard clips its columns on mobile
**Fixes:** R2 · **Blast radius:** 1 file · **Effort:** XS

`components/KpiLeaderboard.tsx:91-92` — a 392px-minimum grid inside `overflow-hidden`. Below ~450px the
right-hand columns are **cut off with no way to scroll**. Data is unreachable, not just ugly.
`overflow-hidden` → `overflow-x-auto`.

### P0-4 · Make the KPI checklist keyboard-operable
**Fixes:** A5 · **Blast radius:** 5 files · **Effort:** S

`NazoratchiChecklist.tsx:153` — the Company selector is a `<div onClick>` with no `tabIndex`, `role`,
or key handler. **A keyboard user cannot choose a company to score**, which blocks the primary
workflow of the product. Same pattern: `StaffModule.tsx:330`, `KassaModule.tsx:187`,
`KPIRulesManager.tsx:197` (a toggle with no `role="switch"`), `OrganizationModule.tsx:492`.

`<div onClick>` → `<button>`.

### P0-5 · Name the icon-only buttons — destructive first
**Fixes:** A3 · **Blast radius:** ~30 buttons · **Effort:** S

~30 buttons announce only "button". Unlabelled **delete** actions: `KPIRulesManager.tsx:243`,
`HisobotlarModule.tsx:222`, `CompanyDrawer.tsx:552-566`. Worst overall:
`SettingsModule.tsx:145-147` — **an empty `<button>`** with no children at all, colour conveyed only
by `style`, selection only by outline.

---

## P1 — Materially wrong

### P1-1 · Give the Verdict a shape, not just a colour
**Fixes:** A6 · **Effort:** S

The Verdict (green/yellow/red) is the domain's core categorical value (`CONTEXT.md`) and it is
conveyed by **colour alone**:
- `kpi/KpiEntryCard.tsx:113-133` — option buttons swap colour only; no `aria-pressed`, no icon
- `OperationModule.tsx:53-58,162-190` — `PROOF_DOT` has the **same `title` string** for pending,
  approved and rejected; the RGB value is the only difference

A colour-blind Supervisor cannot read the scores they are responsible for. Add an icon or text.

### P1-2 · Adopt a type scale
**Fixes:** C8, MASTER §Type · **Blast radius:** 924 utilities · **Effort:** M (mechanical)

924 `text-[Npx]` across **17 values**, including `text-[7px]`, `[8.5px]`, `[9.5px]`, `[10.5px]`,
`[12.5px]`. `text-[7px]` (`OperationModule.tsx:881`, green at 70% opacity) is unreadable by anyone.

Spacing in this repo is **disciplined** — the team has scale discipline, it just never reached type.
Adopt the 8-step scale in MASTER.md; ~96% of usage maps onto it directly.

### P1-3 · Port the mobile shell to `/admin/*`
**Fixes:** R1 · **Effort:** M

`app/(admin)/layout.tsx:21` + `admin/AdminSidebar.tsx:16-27` — fixed 230px sidebar, no drawer, no
hamburger. At 375px it eats **61% of the screen and cannot be dismissed**. The dashboard already has
the pattern; copy it.

### P1-4 · Fix the bottom-nav overlap
**Fixes:** R3 · **Effort:** XS

`app/(dashboard)/layout.tsx:56` reserves `pb-[76px]`; `MobileBottomNav.tsx:46` can be **94px** with
safe-area. The nav covers the last ~18px of **every mobile page**. Use the nav's own `env()`
expression instead of a magic number.

### P1-5 · Migrate the 210 raw hex literals
**Fixes:** C1 · **Effort:** M

`#2563EB` (×15), `#4F46E5`, `#7C3AED`, `#DC2626` duplicate tokens exactly — and **can't flip in dark
mode**. `DashboardTopBar.tsx:78-79` renders permanently-wrong blue in dark.

Worse, `cabinets/MyCabinet.tsx:338-480` uses `#10b981`/`#f59e0b`/`#ef4444` — *near* the dark tokens but
not equal (dark `--success` is `#34D399`) — **silently off-brand**.

Start with `EmployeeDashboard.tsx`: 154 palette classes, 78 with no `dark:` variant — it opts out of
the design system entirely.

### P1-6 · Touch targets to 44px
**Fixes:** R5 · **Effort:** S

Every mobile card view kept 36px (`w-9 h-9`) icon buttons; `OrganizationModule.tsx:506-507` is 32px.
Several are delete actions.

---

## P2 — Worth doing

- **P2-1 · Z-index scale** (C6) — adopt MASTER's 7-step ladder; retire `z-[9999]`/`z-[10000]`.
- **P2-2 · `dvh`** (R7) — 0 uses today; `h-screen`/`100vh` jumps under mobile browser chrome.
- **P2-3 · `prefers-reduced-motion`** (A7) — one `@media` block; 4 infinite animations ignore it.
- **P2-4 · Convert the remaining 7 tables** (R8) — 4 are admin.
- **P2-5 · Radius** (C10) — `rounded-lg` (217) outnumbers the canonical `rounded-xl` (149). Pick 12/8/full.
- **P2-6 · Icon sizes** (C9) — 21 distinct → 4 tokens.
- **P2-7 · Replace emoji icons** (C9) — lucide is already everywhere; `.status-dot` exists for `🔴🟡🟢` and has 0 uses.
- **P2-8 · Mobile search** (R6) — `GlobalSearch` is `hidden md:flex` with no replacement.
- **P2-9 · Page headings** (A8) — 5 modules have no page-level heading; admin renders h2 before h1.
- **P2-10 · Delete dead CSS** — `.stat-card`, `.liquid-glass-card`, `.liquid-glass-input`, `.status-dot`, `.tooltip`.

---

## Two functional bugs found while auditing

Not UI polish — these are broken features. Reporting, not fixing, per the read-only scope.

### The language switcher does nothing
`components/DashboardTopBar.tsx:116-135` — a button with `onMouseEnter`/`onMouseLeave`, a `Globe`
icon, the label "O'zbekcha" and a `ChevronDown`. **It has no `onClick`.** It hovers and it is inert.

The app ships `Language = 'uz' | 'ru'` (`types.ts:3`) with dozens of components branching on it, so
the machinery exists — the control was never wired. It also masks A12: `<html lang="uz">`
(`app/layout.tsx:71`) is hardcoded and happens to be correct *only because* the switcher can't change
anything.

### `.ai-button-glow` is a global class with one consumer
`OrganizationModule.tsx:334`. A one-off CTA promoted to the global stylesheet.

---

## Suggested sequence

**Round 1 — a11y foundation (S+M).** P0-1 `<Field>` + focus ring · P0-2 `<Modal>` · P0-4 keyboard ·
P0-5 aria-labels. Turns "unusable by keyboard/SR" into "usable".

**Round 2 — mobile truth (XS+M).** P0-3 leaderboard · P1-4 nav overlap · P1-3 admin shell · P1-6 targets.

**Round 3 — system convergence (M, mechanical).** P1-2 type scale · P1-5 hex migration · P2-1 z-index ·
P2-5 radius · P2-10 delete dead CSS.

Rounds 1–2 are the ones with users on the other end. Round 3 is what stops the drift returning — and
per CONSISTENCY.md's root-cause note, it only holds if the shared components get **deep enough that
forking is the harder option**.
