# Mehnat ERP — Design System (Master)

> **⚠️ Superseded 2026-07-24 by the "Ledger" redesign, then softened the same day.**
> `app/globals.css` was rewritten: the accent is the ASRO mark's **azure `--brand`**, not `#2563EB`;
> chartreuse **`--live`** is the signature marker; hierarchy is carried by **`--rule` hairlines,
> not elevation** (`--card-shadow` is `none`); the type scale (`--text-micro/meta/body` + native
> Tailwind steps) is live and the 982 arbitrary `text-[Npx]` were migrated; **IBM Plex Sans + Plex
> Mono** replaced Inter (mono for all figures/dates/labels); the z-index ladder and `.erp-table`
> ledger treatment shipped.
>
> **Softening pass (premium/low-strain).** Palette values were then softened for a calmer,
> Linear/Vercel/Notion-grade feel — token **names are unchanged and still authoritative, values are not**:
> light `--brand #0F66AE`, dark `--brand #4FA3E3`; light page `--bg-primary #F4F5F6` with white cards,
> soft ink `--text-primary #262C34` (~14:1, down from near-black ~18:1); dark ground neutralised to
> `#0F1116`/card `#181C23` with soft off-white `--text-primary #D9DEE4` (~12.6:1, down from ~13.5:1
> glare); `--rule` hairlines lightened (.12/.22 → .09/.15 light, .10/.18 → .08/.14 dark); status colours
> desaturated; `--shadow-float`/`--shadow-overlay` rebuilt as soft, diffuse, multi-layer. Every
> foreground/background pair is verified WCAG AA. The counts in CONSISTENCY.md / UI-IMPROVEMENTS.md
> describe the **pre-redesign** tree. Treat the sections below as historical until this file is rewritten.
>
> **Source of truth (historical).** This documented the system that existed in `app/globals.css`
> (803 lines), extracted from the code on 2026-07-16. Components already consume these tokens;
> anything that contradicts this file is drift, catalogued in [CONSISTENCY.md](./CONSISTENCY.md).
>
> Read this before building any page. For page-specific deviations check `design-system/pages/<page>.md`;
> if that file doesn't exist, these rules apply exclusively.

## What this product is

An internal ERP for an accounting firm: 212 client Companies, 39 staff, monthly KPI that determines
pay. It is **data-dense, long-session, keyboard-heavy, desktop-first with a real mobile surface**.
It is not a marketing site. Density beats whitespace; scannability beats delight.

Domain vocabulary — Company, Supervisor, KPI Rule, Verdict, Monthly Performance — is defined in
[`CONTEXT.md`](../CONTEXT.md). Use those words in UI copy and component names.

## Foundations

**Font.** Inter, loaded from Google Fonts (`globals.css:1`), weights 300–900. One family, no pairing.

**Theme.** Light + dark, switched by a `.dark` class on `<html>` via `next-themes`
(`@custom-variant dark (&:where(.dark, .dark *))`, `globals.css:6`). **Every colour must resolve
through a token** so both themes work. Hardcoding a light-mode hex is the single most common defect
in this codebase (210 instances).

**Tailwind v4.** No `tailwind.config.js`. Tokens are bridged into Tailwind via `@theme inline`
(`globals.css:9-20`), which exposes only a subset: `bg-primary`, `bg-secondary`, `bg-card`,
`border-glass`, `accent-blue`, `accent-green`, `accent-red`, `text-primary`, `text-secondary`.
Everything else must be used as `var(--token)`.

## Colour tokens

Never write a hex in a component. Every value below flips automatically between themes.

### Surfaces & text

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg-primary` | `#F1F5F9` | `#0C0E14` | Page background |
| `--bg-secondary` | `#FFFFFF` | `#13161F` | Sidebar, topbar |
| `--bg-card` | `#FFFFFF` | `rgba(255,255,255,.04)` | Card fill |
| `--bg-hover` | `#F8FAFC` | `rgba(255,255,255,.06)` | Hover wash |
| `--text-primary` | `#0F172A` | `#F1F5F9` | Body, headings |
| `--text-secondary` | `#475569` | `#94A3B8` | Labels, meta |
| `--text-muted` | `#94A3B8` | `#64748B` | Disabled, hints |
| `--border-glass` | `rgba(0,0,0,.07)` | `rgba(255,255,255,.08)` | Hairlines |
| `--border-strong` | `rgba(0,0,0,.12)` | `rgba(255,255,255,.15)` | Emphasis borders |

> **Contrast warning.** `--text-muted` on `--bg-card` is **≈2.6:1 in light** and fails WCAG AA (4.5:1).
> It is used for hints and secondary meta throughout. See [ACCESSIBILITY.md](./ACCESSIBILITY.md) §A4.
> Treat `--text-muted` as decorative only — never for information a user must read.

### Accents

Each accent has a `-light` companion (8% alpha in light, 12% in dark) for tinted backgrounds.

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `--accent-blue` | `#2563EB` | `#3B82F6` | Primary action, info |
| `--accent-green` | `#059669` | `#10B981` | Success, positive KPI |
| `--accent-red` | `#DC2626` | `#F87171` | Danger, negative KPI |
| `--accent-amber` | `#D97706` | `#FBBF24` | Warning, neutral verdict |
| `--accent-purple` | `#7C3AED` | `#A78BFA` | AI / assistant surfaces |
| `--accent-indigo` | `#4F46E5` | `#818CF8` | Bank-client role |

### Status (semantic — prefer these over accents for state)

`--success` · `--danger` · `--warning` · `--info`, each with `-bg` and `-border`.
Light: `#059669` / `#DC2626` / `#D97706` / `#2563EB`. Dark: `#34D399` / `#F87171` / `#FBBF24` / `#60A5FA`.

**Verdict mapping (domain-critical).** A Verdict is green | yellow | red (`CONTEXT.md`). Map
green→`--success`, yellow→`--warning`, red→`--danger`. **Colour alone is never sufficient** — a
Verdict must also carry text or an icon. See ACCESSIBILITY.md §A6.

### Component tokens

Cards `--card-bg` `--card-border` `--card-shadow` `--card-shadow-hover` `--card-radius:12px` ·
Inputs `--input-bg` `--input-border` `--input-focus-border` `--input-focus-ring` `--input-text` ·
Tables `--table-header-bg` `--table-row-even` `--table-row-odd` `--table-row-hover` `--table-border` ·
Shell `--sidebar-width:240px` `--topbar-height:64px` + `--sidebar-item-*`, `--topbar-*`.

## Type scale — **the system's biggest gap**

`globals.css` defines **no type scale**. Components invent one per file: **924 arbitrary
`text-[Npx]` utilities across 17 distinct values**, including `text-[7px]`, `text-[8.5px]`,
`text-[9.5px]`, `text-[10.5px]`, `text-[12.5px]`.

**Canonical scale — adopt this; it covers 96% of current usage:**

| Token | px | Use |
|---|---|---|
| `--text-2xs` | 10 | Table micro-labels, badges (density floor) |
| `--text-xs` | 11 | Dense table cells, meta |
| `--text-sm` | 12 | Secondary body, form labels |
| `--text-base` | 13 | Default body in dense views |
| `--text-md` | 14 | Comfortable body, buttons |
| `--text-lg` | 16 | Section headings; **minimum for mobile inputs** |
| `--text-xl` | 18 | Page headings |
| `--text-2xl` | 20+ | Stat figures |

**Rules.** Nothing below 10px, ever — `text-[7px]`/`[8px]`/`[9px]` are unreadable and must go
(`OperationModule.tsx:881`, `KPIRulesManager.tsx:205,240`, `OnboardingWizard.tsx:120`). No fractional
sizes. Mobile inputs ≥16px or iOS auto-zooms on focus. Use tabular figures for money columns.

## Spacing, radius, elevation

**Spacing** follows Tailwind's 4px scale and is genuinely disciplined — only 2 arbitrary values
exist repo-wide. Keep it that way. Density target for this product: **8/12/16/24** inside cards,
**24/32** between sections.

**Radius — currently contradictory.** `--card-radius` is 12px, but `rounded-lg` (8px, 217 uses)
outnumbers `rounded-xl` (12px, 149 uses). Canonical:

| Element | Radius |
|---|---|
| Cards, modals, drawers | 12px (`--card-radius`, `rounded-xl`) |
| Inputs, buttons, badges | 8px (`rounded-lg`) |
| Pills, avatars | `rounded-full` |

`rounded-md`/`rounded-sm`/`rounded`/`rounded-2xl` (143 combined uses) are **off-system** — migrate
to the three above.

**Elevation.** Only two steps: `--card-shadow` at rest, `--card-shadow-hover` on hover. No others.

## Z-index — **must be defined; currently absent**

There is no scale. Live values range from `z-10` to `z-[10000]`, with `z-[9999]`, `z-[201]`,
`z-[190]` picked ad hoc per file. Adopt:

| Layer | z |
|---|---|
| Base content | 0 |
| Sticky table header | 10 |
| Fixed topbar / bottom nav | 40 |
| Sidebar drawer (mobile) | 50 |
| Modal backdrop | 100 |
| Modal panel | 110 |
| Toast / popover | 200 |

## Components

**Canonical (use these):**
`.dashboard-card` (80 uses) — the card. `.erp-input` (53) — the input. `.btn-primary` / `.btn-secondary` — buttons.
`.erp-table` — tables. `.glass-card` (14) — cabinet views only.

**Dead — do not use, pending deletion:** `.stat-card`, `.liquid-glass-card`, `.liquid-glass-input`,
`.status-dot`, `.tooltip` (all **0 usages**).

**Legacy — do not use in new code:** `.c1-btn*` family, `.c1-input`, `.c1-badge`.

**Missing primitives.** There is no shared `Modal`/`Dialog` — 19 files hand-roll `fixed inset-0`.
There is no `Button`, `Input`, or `Table` component; ~93% of 208 buttons and ~82% of 110 inputs are
hand-rolled. **A `<Modal>` primitive is the highest-leverage component to build** — it would fix
accessibility for 19 call sites at once (see UI-IMPROVEMENTS.md P0-2).

## Icons

**lucide-react, exclusively** — 50 files, zero competing libraries. This is the healthiest part of
the system. Two rules it currently breaks:

- **No emoji as icons.** `dashboard/page.tsx:147-150` (`icon="🏢"`), `OrganizationModule.tsx:75-80`
  (`🔴🟡🟢` as status), `PayrollTable.tsx:285-288`, `CompanyDrawer.tsx:376`, `OperationModule.tsx:25-40`
  (`✓ ✗ ⏳`). Emoji render differently per OS and can't be themed.
- **Size tokens.** 21 distinct sizes are in use. Canonical: **14** (inline/dense), **16** (default),
  **20** (actions), **24** (nav). Nothing else.

## Motion

Transitions 150–300ms, `ease-out` entering. Animate `transform`/`opacity` only.

**`prefers-reduced-motion` is honoured nowhere** (0 matches) while `.animate-spin`,
`.animate-pulse-glow`, `.animate-float`, `.animate-shimmer` run infinitely. Every animation must sit
behind a reduced-motion guard. See ACCESSIBILITY.md §A7.

## Non-negotiables

1. **No raw hex in components.** Use `var(--token)`. 210 violations today.
2. **No Tailwind palette colours** (`text-gray-500`, `bg-blue-500`). They don't theme. 247 violations.
3. **Every interactive element keeps a visible focus ring.** `:focus-visible` is used 0 times today.
4. **Every icon-only button gets an `aria-label`.** 4 exist across 94 files.
5. **Every input gets a `<label htmlFor>`.** 0 exist.
6. **Colour never carries meaning alone.** Verdicts need text or an icon.
7. **Touch targets ≥44×44px.**
8. **Type ≥10px; mobile inputs ≥16px.**
