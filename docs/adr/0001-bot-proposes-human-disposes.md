# The bot proposes a KPI number, a human disposes of it

The Telegram bot records Signals but never owns a Monthly Performance. Its rollup writes rows as
`status='draft', source='system'` and may only ever touch rows that are still draft-and-system; a
Supervisor's edit mutates that same row, which becomes unique on
`(month, companyId, employeeId, ruleId)`. A draft whose net `calculatedScore` is >= 0 approves
itself once the Review Window closes; a draft that nets < 0 never self-approves and waits for a
named human.

We chose this because the KPI bot blueprint assumed `MonthlyPerformance` was a projection it could
idempotently recompute, and it is not: it is a human judgment record with an approval chain, one
row per rule, whose approved rows the write path at `server/kpi.ts:238` deliberately refuses to
touch. Recomputing it would overwrite a chief accountant's approved judgment, and because no
unique constraint existed, a rollup that respected that guard would instead insert duplicate rows
that payroll would count twice into real salary.

## Consequences

- Only `approved` reaches payroll (`lib/kpiLogic.ts:104`). `submitted` is vestigial — nothing pays
  on it, which is why the Supervisor's checklist writes `approved` directly.
- Silence may grant a bonus but must never dock pay. Penalties accumulate uncapped by design
  (`lib/kpiScoring.ts:150`), all six counter rules carry `maxPenalty: null`, and arrival is scored
  from a Telegram message — a proxy for attendance, not attendance. An unreviewed proxy error must
  not reach someone's salary.
- The cost is real: if Supervisors ignore negative drafts, penalties never bite and those rules
  lose their teeth. We accepted that over silently docking pay.
- "Bot said red, Supervisor said green" stays answerable from the KpiEvent ledger, which is what a
  ledger is for — not from duplicate Monthly Performance rows.
