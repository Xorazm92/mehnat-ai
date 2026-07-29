# Escalation is private and laddered

Until now a missed deadline produced one of two outcomes, and neither reached a person who could act.

An unanswered question was marked `late` by the minute cron, docked one KPI point, and then **nothing
happened**. No Supervisor was told, no Chief Accountant was told. The signal existed only as a row
that someone might read at month end — by which point the client had already been kept waiting.

An obligation reminder did the opposite: it went to the **client's Telegram Group**. Every `D-5`,
`D-3` and `overdue` notice announced our own lateness to the customer whose work was late. The firm's
internal control loop was being performed in front of the client.

Escalation now walks a ladder, in private:

| | Who | When (question) | When (obligation) |
|---|---|---|---|
| **L0** | responsible employee | at the deadline | `D-5`, `D-3`, `D-1` |
| **L1** | Supervisor (`Company.supervisorId`) | the moment it is `late` | the due date |
| **L2** | Chief Accountant (`Company.chiefAccountantId`) | 30 minutes later | the day after |

There is deliberately **no director level**. A ladder that ends at the person who set it up teaches
everyone below to wait for them; ending it at the Chief Accountant keeps the decision inside the
accounting line.

A level with nobody assigned is skipped rather than held, and a person who already heard about it at
a lower level is not told twice — `resolveChain` de-duplicates, so a Supervisor who is also the
responsible accountant gets one message, not two.

Every message reaches a **private chat**. `Company.telegramGroups` is no longer a target for internal
reminders. The group keeps only what the client should see: payment reminders, and (per
[ADR-0002](./0002-bot-delivers-reports-rather-than-observing-them.md)) delivered reports. That ADR is
about the bot *delivering work product* to a group and is unaffected — this one governs the separate
question of where *internal control* is performed.

## The alerts carry buttons, and a button is not a payroll write

An L1/L2 alert arrives with a verdict keyboard: `🔴 Jarima −5%`, `🟡 Ogohlantirish`, `🟢 Sababli` for
a question; `🟢 Sababli`, `🙋 O'zim bajaraman` for an obligation.

Pressing `🔴 Jarima` appends a signed `KpiEvent` and notifies the Chief Accountant to confirm it in
the ERP. It does **not** write `MonthlyPerformance`, and therefore does not move anyone's salary.
This is [ADR-0001](./0001-bot-proposes-human-disposes.md) held to: the ledger is evidence, and only
an `approved` `MonthlyPerformance` row pays. A Telegram button is the wrong instrument for an
irreversible deduction — it is one mis-tap on a phone.

`🟢 Sababli` on an obligation is the one place a single press completes both halves of the two-stage
excuse (`delayMarkedById` + `delayApprovedById`). That is safe because it is gated on
`delay-reason:approve`, which is senior-only — the reason [ADR-0005](./0005-kpi-is-derived-from-evidence-and-confirmed-by-a-human.md)
requires two stages is to stop an employee excusing themselves, and a Supervisor pressing it is
already the approver.

## Consequences

- **Idempotency has no new table.** Each rung claims one `NotificationDelivery` row keyed
  `<kind>:<id>:esc:L<n>` under `@@unique([channel, dedupKey])`, written *before* any message is sent.
  The three question verdicts share a single `<kind>:<id>:verdict` claim, so the first press settles
  it and later ones answer "already handled" instead of stacking penalties.
- **A bot cannot open a private chat.** Anyone who never pressed Start is unreachable (403), so the
  in-app `Notification` is written first and unconditionally; Telegram is the enhancement, not the
  channel of record. Delivery failure is recorded as `status='failed'` on the claim row rather than
  retried, because retrying will not create a conversation that does not exist.
- **Authorization is re-checked on every press, never encoded in the button.** An alert can sit in a
  chat for days, and portfolios change. `assertCompanyPermission` runs against the entity's company
  at press time.
- Delay-reason and reassignment logic moved from `server/obligations.ts` to `lib/obligationDelay.ts`.
  A BullMQ worker has no `auth()` context and cannot call a server action, and duplicating the
  permission checks in the bot would have let the two copies drift.
