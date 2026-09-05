# The obligation is the work; the matrix is a view

> Qaror [ADR-0009](./0009-obligation-is-the-only-unit-of-work.md) da qabul qilingan; bu hujjat uning
> qurilishini yozadi. Raqami `0008` dan `0015` ga o'zgartirildi — 0008 raqami
> [ADR-0008](./0008-imported-evidence-proposes-it-never-accepts.md) da band edi.

ASRO carried three places where the same piece of accounting work was recorded, and none of them
knew about the other two.

`/reports` held the operation matrix: 51 columns of free text on `MonthlyReport`, one row per firm
and month, plus a `ReportProof` screenshot per cell. `/deadlines` held the compliance engine:
`DeadlineTemplate` × company × period generated an `Obligation` with a due date computed against the
business calendar. `/tasks` held ad-hoc work: a `Task` with its own `SlaPolicy`, its own due date and
its own status enum.

An accountant filing VAT touched all three. The matrix cell said `topshirildi`, the obligation still
said `planned`, and the task the supervisor had opened for the same filing said `open`. Whichever
one they forgot became the version of the truth that KPI read.

**The obligation is now the record of the work.** The matrix cell and the task are two ways to move
it, not two other places to store it.

## What the bridge could and could not see

A bridge already existed (`lib/obligationBridge.ts`) and was believed to be doing this job. It was
not. Of 51 matrix columns it mapped 15, and three of those fifteen — `qqs`, `aylanma_soliq`,
`payroll_posted` — were not column keys at all. No column by those names has ever existed, so the VAT
declaration, the turnover tax and the payroll posting were the three obligations the matrix could
never move. Two more, `foyda_soliq` and `moliyaviy_natija`, were mapped to annual templates and
looked up by month key (`2026-M07`) against a stored `2026-Y`, which cannot match. Ten templates sat
in `draft` with a matrix column but no mapping.

The bridge fails silently by design — a column with no obligation behind it is normal — so none of
this surfaced as an error. `lib/obligationBridge.spec.ts` now asserts that every mapped key is a real
column, that no template is claimed by two columns, and that a template excluded from the matrix is
listed in `UNMAPPED_TEMPLATE_CODES` with a reason.

## A quarterly report is recorded in the month it is due

The matrix has one cell per month; obligations are monthly, quarterly or annual. Matching on period
key alone silently dropped everything that was not monthly.

A cell now resolves an obligation by month key **or** by a due date falling inside that month, with
the exact period key winning when both exist. Q3 turnover tax, due 15 October, belongs to the October
cell — which is where an accountant records having filed it. The 2026 annual profit tax, due 1 March
2027, belongs to the March 2027 cell.

## Cell values are claims of different strength

`+` means a reviewer accepted it, `topshirildi` means it was submitted, `-` means rejected, an empty
cell or `0` clears it. Free text — a date, a note — means work has started and moves the obligation to
`in_progress`; that is the honest reading of a half-filled cell, and it beats leaving it `planned`.

`kartoteka` deliberately moves nothing. It says a payment order is sitting in the bank's card index,
not that a report was late, and treating it as a report status would have fed a payment problem into
the KPI as an accounting delay.

Status only advances. Reversing requires either an explicit clear — which only a reviewer can perform,
since `checkCellWrite` blocks an accountant from touching a reviewer-owned cell — or a rejection.
A `cancelled` obligation cannot be revived from the matrix at all.

## Submitting produces an attempt, not just a status

An obligation that read `sent` with no submission behind it left audit and KPI with nothing to
inspect. A screenshot submission now writes an `ObligationSubmission` with an incrementing attempt
number and a `SubmissionEvidence` row pointing at the proof (`reportProof:<id>` — the reference, not
the base64). The reviewer's decision closes that attempt as `accepted` or `rejected`. Attempts are
recorded on every submission, including a resubmission after rejection, so the sequence
submit → reject → fix → resubmit survives in full.

A screenshot is still not proof that the tax authority accepted anything. It is evidence that we
submitted, reviewed by a human — which is what `accepted` has always meant here.

## A task hangs off an obligation rather than competing with it

`Task.obligationId` is nullable: a task with no obligation is ordinary internal work, exactly as
before. A task created against an obligation inherits its firm and due date from it, so one piece of
work cannot carry two different deadlines.

Closing such a task moves the obligation to `ready`, not to `sent`. Finishing internal work is not a
filing; claiming otherwise would have let an internal checkbox produce a false record of having filed
with the state.

## One screen, because it is one queue

`/deadlines` and `/tasks` now render the same inbox — obligations and tasks in one list sorted by due
date, each row labelled with its kind. `/tasks` survives as that screen opened on its tasks tab, so
existing links, notifications and the `tasks` RBAC view keep working; the sidebar carries a single
entry, **Ishlar**.

## What stays out

Twenty-eight columns remain matrix-only: statistics forms, communal bills, the payment half of split
tax columns, excise, subsoil and non-resident taxes. They have no template, and inventing universal
ones would have generated an obligation for every firm regardless of whether it owes the thing.

The ten draft templates that did have columns were activated with a `service_key` criterion tied to
`Company.activeServices` — the same array that decides which matrix columns a firm sees. One decision
now drives both. Empty `activeServices` means "show all columns" in the matrix but "generate nothing"
here: an obligation should exist because someone said the firm owes it, never because nobody said
otherwise. Until those services are filled in per firm, the ten produce almost nothing, and that
emptiness is preferable to thousands of fabricated overdue rows.

`scripts/check-matrix-obligation-link.ts` reports the live coverage for any month.
