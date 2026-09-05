# Responsive Report — Mehnat ERP

> **Holat: TARIX** · 2026-07-16 — bu hisobot redizayndan OLDINGI daraxtni tasvirlaydi.
> Amaldagi dizayn tizimi kodda: `components/ui/` primitivlari va `app/globals.css`
> tokenlari. [`docs/audit/UI_AUDIT_2026-07.md`](../docs/audit/UI_AUDIT_2026-07.md) §E10
> aynan shu beshta faylni “eskirgan va zarar keltiruvchi” deb belgilagan — ular
> qaror tarixi uchun saqlanadi, mo'ljal sifatida emas.
> Hujjatlar xaritasi: [`docs/README.md`](../docs/README.md)

**Audited** 2026-07-16 · `components/**`, `app/**`, `app/globals.css` · Tailwind v4, default breakpoints
**Reference viewports** 375 (small phone) · 768 (tablet) · 1024 (laptop) · 1440 (desktop)

## Verdict

The dashboard shell's mobile work is **real and good** — `MobileBottomNav`, the collapsible sidebar,
and 9 modules converted from tables to cards are all solid. But it stopped halfway:

- **`/admin/*` has no mobile support at all.** The work never reached it.
- **7 more tables were never converted** — they got horizontal scroll instead.
- **`dvh` is used 0 times**; `100vh`/`h-screen` is used throughout.

So mobile is a first-class surface in the dashboard and an afterthought everywhere else.

---

## HIGH

### R1 · The entire admin section is unusable on mobile
`app/(admin)/layout.tsx:21` renders `components/admin/AdminSidebar.tsx:16-27` at a fixed
`width: "230px"` with **no `hidden`, no `translate-x`, no drawer**, and
`components/admin/AdminTopbar.tsx` has **no hamburger** — unlike `DashboardSidebar`/`DashboardTopBar`,
which have all of it.

At 375px the sidebar consumes **61% of the viewport** and cannot be dismissed. Every admin
screen — user management, departments, role permissions, operation matrix — is effectively
desktop-only. The "mobile collapsible sidebar" commit only touched the dashboard shell.

### R2 · KPI Leaderboard clips its own columns
`components/KpiLeaderboard.tsx:92,104` — `grid-cols-[40px_1fr_120px_90px_110px]` = **392px minimum**,
inside `overflow-hidden` (`:91`) rather than `overflow-x-auto`. Below ~450px the rightmost columns are
**cut off with no way to scroll to them**. Reachable via KPI → Reyting.

This is the worst mobile bug in the app: data is silently unreachable, not merely awkward.

### R3 · Fixed bottom nav overlaps content on notched devices
`app/(dashboard)/layout.tsx:56` reserves `pb-[76px]`.
`components/MobileBottomNav.tsx:46` is `calc(60px + env(safe-area-inset-bottom))` — up to **94px** on a
notched iPhone. The nav covers the last **~18px** of every page. Affects the last table row / last
form field on every mobile screen.

Fix: reserve the same `env()` expression the nav uses, not a magic `76`.

### R4 · Top safe area unhandled in installed PWA
`app/layout.tsx:33-37` sets `statusBarStyle: "black-translucent"` with `"display":"standalone"`, but
`env(safe-area-inset-top)` appears **nowhere** — `MobileBottomNav.tsx:45-46` is the only `env()` usage
in the codebase. Installed on iOS, the topbar renders **under the notch/status bar**.

---

## MEDIUM

### R5 · Touch targets below 44px throughout the mobile card views
The card conversions kept desktop-sized icon buttons:

| File | Size |
|---|---|
| `StaffModule.tsx:349,352` | `w-9 h-9` = 36px |
| `AttendanceModule.tsx:200-201` | 36px |
| `InventoryModule.tsx:169-170` | 36px |
| `DocumentsModule.tsx:111` | 36px |
| `KassaModule.tsx:209` | 36px |
| `ExpenseModule.tsx:267` | 36px |
| `OrganizationModule.tsx:506-507` | `w-8 h-8` = **32px** |
| `DashboardTopBar.tsx:96,139-195` | `p-2` ≈ 33-36px |

Apple HIG 44×44pt, Material 48×48dp. Several of these are **delete** actions — undersized destructive
targets are how mis-taps become data loss.

### R6 · Global search vanishes below 768px
`components/GlobalSearch.tsx:99` — `hidden md:flex`, with **no mobile replacement**. Search is a
primary navigation affordance in a 212-company ERP; on a phone it does not exist.

### R7 · `100vh` instead of `dvh` — 0 uses of `dvh` repo-wide
`app/(dashboard)/layout.tsx:35` · `app/(admin)/layout.tsx:21` · `components/DashboardSidebar.tsx:82` ·
`components/NazoratchiChecklist.tsx:128` (`h-[calc(100vh-160px)]`).

On mobile Safari/Chrome the URL bar makes `100vh` taller than the visible viewport: content sits under
browser chrome and layouts jump as the bar hides. `min-h-dvh` fixes it.

### R8 · Table→card conversion is 9-of-16
**Converted** (`md:hidden` cards + `hidden md:block` table): AuditLogModule, AttendanceModule,
StaffModule, PayrollTable, OrganizationModule, InventoryModule, KassaModule, DocumentsModule,
ExpenseModule.

**Not converted** — horizontal scroll only: `HisobotlarModule.tsx:112-113` ·
`admin/RoleViewEditor.tsx:67-68` · `admin/AdminUserManager.tsx:150-151` ·
`admin/RolePermissionMatrix.tsx:42-43` · `cabinets/MyCabinet.tsx:490-491` ·
`OperationModule.tsx:815,831,835`.

Note 4 of 6 are admin — the same gap as R1.

### R9 · Modal table can clip instead of scroll
`components/PayrollDrafts.tsx:411` — table with no `overflow-x-auto`, inside a modal that is
`overflow-hidden` (`:361`) with only `overflow-y-auto` on the body (`:408`). Wide content is clipped.

### R10 · Unstacked two-column grids at 375px
`components/CompanyDrawer.tsx:315,425,477,568,756,782,969` — `grid-cols-2` with no responsive
variant. Fields are fluid so nothing overflows, but the drawer is cramped on a phone.

---

## LOW / informational

**R11 · Breakpoints are ad-hoc but not broken.** `sm:` 31 uses/15 files · `md:` 103/30 ·
`lg:` 39/19 · `xl:` 11/5 · `2xl:` 0. `md:` (768px) is doing nearly all the work as a single
mobile/desktop switch. No custom breakpoints in `@theme`, so Tailwind defaults apply
(640/768/1024/1280/1536). **No conflicting `@media` in `globals.css`** — verified clean.

**R12 · Viewport meta is correct.** `app/layout.tsx:55-61` sets no `maximumScale`/`userScalable`;
Next's defaults supply `width=device-width, initial-scale=1`. **Zoom is not disabled.** No violation.

## Healthy — leave alone

- `MobileBottomNav.tsx` / `MobileNavContext.tsx` — safe-area aware, correct `md:hidden` gating,
  role-filtered items. This is the best-built mobile code in the repo.
- `CompanyDrawer`, `StaffDrawer`, `FinanceAssistant`, `ReportProofModal` — all use
  `w-full max-w-[…]` and fit 375px correctly.

## Fix order

1. **R2** — one-line `overflow-hidden` → `overflow-x-auto`. Unreachable data.
2. **R3** — bottom-nav padding uses the nav's own `env()`.
3. **R1** — port the dashboard's drawer pattern to `AdminSidebar`.
4. **R5** — 36px → 44px in the card views.
5. **R7** — `h-screen`/`100vh` → `dvh`.
6. **R8** — convert the remaining 7 tables, admin first.
