# A module earns its tables

> Raqami `0009` dan `0016` ga o'zgartirildi — 0009 raqami
> [ADR-0009](./0009-obligation-is-the-only-unit-of-work.md) da band edi.

A survey of all 68 Prisma models against the live database found that **26 had code but not a single
row**, and two — `Operation` and `InventoryItem` — had a model and working code paths but *no table
at all*: opening `/inventory` was a 500, and thirteen references to `Operation` pointed at something
Postgres had never heard of.

None of this was visible from inside the app. Every one of those modules had a page, a server action,
a nav entry or an admin screen, so the product presented itself as far larger than it was. Staff
opening ASRO could not tell which parts were real.

Sixteen models are now gone. The rule that decided each one: **a module keeps its tables when it is
either carrying data or waiting on a connection someone is actually making.** Everything else was
scaffolding for a phase that never started.

## Waiting on a connection is not the same as unfinished

`Question`, `Answer`, `KpiEvent`, `TelegramGroup` and `PaymentReminder` are all empty too, and all of
them stayed. They are empty for one reason: no Telegram group has been bound yet, so the bot has
nothing to observe. The moment a group is bound they fill, and the KPI evidence chain from
[ADR-0003](./0003-the-bot-scores-only-what-telegram-can-witness.md) and
[ADR-0005](./0005-kpi-is-derived-from-evidence-and-confirmed-by-a-human.md) starts producing rows.
Deleting them would have removed a working design because its upstream had not been switched on.

The removed models had no such upstream. `OneCConnection`, `IntegrationEvent`, `SyncRun`,
`SyncError`, `OneCCompanyMapping` were a one-way 1C ingest pilot with no agent to talk to.
`ClientUser` and `ClientRequest` were a client portal with no clients. `TimeEntry` and
`EmployeeCostRate` were the input to a contribution-margin calculation nobody was recording minutes
for. Each was waiting on a decision, not a switch.

## Two systems answering "who was late?"

`SlaPolicy` and `SlaBreach` computed lateness from response and resolution clocks on a task.
`Obligation.delayReason` computes it from a due date plus a two-stage, manager-approved reason that
KPI already reads. Both were live in the schema; one had never been configured.

Keeping both meant a task could breach its SLA while its obligation was comfortably on time, or the
reverse — and each answer had its own screen. Now that a task hangs off an obligation
([ADR-0008](./0015-the-obligation-is-the-work-the-matrix-is-a-view.md)), the SLA layer was measuring
a deadline the task no longer owns. It is gone, along with `Task.responseDueAt`,
`resolutionDueAt` and `firstResponseAt`. Lateness has one definition.

## A document is not a deadline

`FinancialReport` carried `deadline` and `assignedTo` of its own. So did `Obligation`. So did
`Operation`. Three tables answering "when is this due and who owes it" is three chances to disagree,
and the matrix could show one date while the deadline list showed another.

`FinancialReport` now keeps only what is genuinely about the document — its type, its lines, its
format, who signed it and when — and links to the obligation that supplies the deadline and the
responsible person. The nine existing rows did have real values in those columns, so the migration
copies them into the row's own `data` JSON under `legacy` before dropping them. Data that a human
entered does not get deleted to make a schema tidier.

`Operation` is deleted outright. It modelled annual and quarterly report statuses, which is exactly
what an obligation with a quarterly or annual template is. The dashboard's progress tile used to
count its rows and therefore counted nothing; it now counts obligations, so the tile and
`/deadlines` are reading the same number.

## Rentabellik went with its inputs

`/profitability` computed contribution margin as revenue minus labour cost, and showed debt from
`Invoice`. With `TimeEntry` and `EmployeeCostRate` gone there is no labour cost, and with `Invoice`
gone its debt column would have had to come from the contract-based source that
`/kassa/qarzdorlik` already presents more completely — including the 1C snapshot comparison and the
plan/fact view.

What remained was a page whose headline metric was structurally impossible and whose surviving column
duplicated another screen. It is removed. Reinstating it is a revert plus a decision to record time;
`lib/debt.ts` keeps the note explaining why invoice-based debt was a different concept from contract
debt, because that distinction will matter again if invoicing returns.

## What this costs

Every removal is recoverable from git, and none of them dropped a row a person had typed — the only
table with data behind a removed column had that data copied first. What is not recoverable is the
argument for building them, which is why the phases are named here: 1C ingest (B), client portal (F),
time and cost (C2), invoicing (D). If one comes back, it comes back because someone needs it, not
because the schema still remembered it.
