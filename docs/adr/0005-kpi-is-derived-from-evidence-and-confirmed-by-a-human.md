# KPI is derived from evidence and confirmed by a human

The reglament defines 25 scoring rules, and until now a Supervisor clicked almost all of them from
memory at month end. Three of those rules could already have been answered by data the system
collects — `Obligation` timing, `Attendance` check-ins, and the bot's `KpiEvent` response ledger —
but nothing connected them, so a figure that moves real salary was in practice a recollection.

We now generate a **proposal** for every rule that has observable evidence and leave the judgment
call where it was. The projectors in `lib/kpiEvidence.ts` write `status='submitted', source='system'`,
never `approved`; `lib/kpiLogic.ts` still pays only on `approved`. This is [ADR-0001](./0001-bot-proposes-human-disposes.md)
applied to a second class of writer, and the guard that protects it is the same one: an existing
`approved` row, or one a Supervisor has touched (`source='supervisor'`), is never overwritten.

Four rules stay entirely manual — `acc_critical_error`, `bank_wrong_transfer`, `bank_personal_resp`,
`sup_unresolved`. Each asks whether something was *serious*, *avoidable*, or *well handled*, and no
column in this database answers that. Automating them would have meant inventing a proxy and paying
people against it, which is exactly the failure [ADR-0003](./0003-the-bot-scores-only-what-telegram-can-witness.md)
already refused for the bot.

A delay only stops counting against someone when it is **marked and then approved by a manager** and
the reason is not `accountant_delay`. Marking alone is deliberately not enough: a one-stage excuse is
one an employee can grant themselves.

## Consequences

- The evidence layer needs `Obligation` rows to actually move. They do not move on their own — the
  accountants work the `MonthlyReport` matrix, so `lib/obligationBridge.ts` transitions the matching
  obligation when a report proof is submitted and reviewed. Before that bridge existed, all 2,571
  obligations sat at `planned` and any obligation-based score would have read "nobody did anything".
- `Obligation.periodKey` is `"2026-M07"`. Two call sites searched it with `contains: "2026-07"`, which
  never matches, so both the bridge and the obligation projector silently did nothing. Period keys now
  go through `toObligationMonthKey` (`lib/periods.ts`); do not hand-build them.
- `MonthlyPerformance.month` is canonically `"YYYY-MM-01"`. The bot projection used to write
  `"YYYY-MM"`, which the `@@unique` treats as a different month — the duplicate-penalty hole of
  [ADR-0004](./0004-duplicate-monthly-performance-rows-resolve-to-the-latest-write.md) reopened by
  formatting. All writers normalise through `toPerformanceMonth` first.
- Attendance counters come from `lib/attendance.ts` `aggregateMonthlyAttendance`, not from a second
  hand-rolled classifier. The thresholds (08:30 early, 09:00 late) and the rule that `excused` is not
  a penalty live there and are tested there; a parallel implementation produced different answers for
  the same day.
- Scores are proposals, so re-running the projection is safe and the monthly BullMQ job
  (`bot/queues/kpi.worker.ts`, 2nd of the month, 03:00 Tashkent) cannot by itself move money.
