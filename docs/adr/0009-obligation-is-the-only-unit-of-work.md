# Obligation is the only unit of work

> Bu qarorning AMALGA OSHIRILISH yozuvi — [ADR-0015](./0015-the-obligation-is-the-work-the-matrix-is-a-view.md).
> (0015 ilgari xato bilan `0008-` raqami bilan turgan edi: repoda ikkita 0008 va ikkita 0009 bor edi.)

"Did the client's filing happen?" had three answers in this database, and they did not agree.

`MonthlyReport` (`prisma/schema.prisma:259`) holds ~65 nullable `String?` columns, one per matrix
cell, keyed `(companyId, period)` where period is `"2026-07"`. Cell values are free strings — `"+"`,
`"-"`, `"topshirildi"`. `Operation` (`:425`) holds annual and quarterly statuses and has **no writer
anywhere in the repo**; it survives only as five `count()` calls in `lib/cached-queries.ts` feeding
one dashboard tile. `Obligation` (`:1243`) is the real engine — versioned templates, workday-shifted
due dates, a status machine, an escalation ladder, a two-stage delay excuse, and 34 call sites.

Three models meant three truths. The bridge between the first and the third,
`lib/obligationBridge.ts`, was written fail-silent by design and was quietly doing almost nothing:
of its fifteen column mappings, three name keys that are not valid `OperationFieldKey`s so no cell
ever sends them, and two more point at **annual** templates whose `periodKey` is `"2026-Y"` while the
bridge always builds a monthly `"2026-M07"`. Ten of fifteen worked. Nobody noticed, because a silent
bridge looks exactly like a working one.

We retire `MonthlyReport` and `Operation` into `Obligation`. The matrix survives as a **projection**:
213 rows × 47 columns is how this firm actually reads its month, and a solo developer has no budget
to also win a UX argument. But it stops being a second store of truth.

## Consequences

- The real work is not data migration. `MonthlyReport` holds **7 rows across 2 periods** and
  `ReportProof` holds 8; that is an afternoon. The work is **coverage** — 51 matrix columns need
  `DeadlineTemplate` rows and only 15 exist, and writing the other 37 requires tax knowledge, not
  TypeScript. That is why this is the longest block in the plan and why its calendar depends on the
  chief accountant, not on the developer.
- `OperationEntry` keeps its exact shape. Twenty-odd files — `/payroll`, `/kpi`, `/staff`,
  `server/cabinet.ts`, `lib/kpiLogic.ts` — compare its cell values as strings. Projecting into the
  existing shape turns a 20-file migration into one conditional in `lib/cached-queries.ts`, which is
  the only reason the read switch is survivable.
- The period window is resolved from **the template's own periodicity**, never from the UI's month.
  `periodWindowFor(template.periodicity, ref)` is what makes `FOYDA_YILLIK` reachable at all; the old
  bridge's hand-built monthly key is the bug, and hand-building period keys is now forbidden
  ([ADR-0005](./0005-kpi-is-derived-from-evidence-and-confirmed-by-a-human.md) said the same thing
  about `toObligationMonthKey`, and the lesson did not stick the first time).
- Cell-level authorisation survives as transition-level authorisation. `lib/reportPermissions.ts`
  blocks a supervisor from approving a company where they are also the accountant;
  `lib/access.ts:assertCompanyPermission` does **not** — so today a supervisor can `accept` their own
  obligation from `/deadlines`. Unifying without fixing that exports the hole to the whole system, so
  `checkTransition()` lands before the migration, not after.
- `ReportProof.imageData` is a base64 data URL inside Postgres and it is the **only** copy of those
  bytes. It moves to content-addressed files behind an authenticated route, and the tables are
  dropped only after a dump, a checksum and a restore rehearsal — in a separate PR, on a separate
  day. `MonthlyReport` is regenerable from `Obligation`; the blobs are not.
- Adding an obligation type is now a seed row, not a deploy. That property is
  [Modda 8](../CONSTITUTION.md) and it is what makes a second vertical cheap later.
