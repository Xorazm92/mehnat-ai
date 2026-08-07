# An alert fires on change, not on condition

Threshold alerts are the feature most likely to be quietly switched off by the people who need them.
Not because the thresholds are wrong — because of how often they repeat.

## The failure this avoids

A scheduled job that sends "Risk 42% — 3 overdue" every time it runs produces the same message every
day for as long as the situation lasts. Within a week it is wallpaper. The damage is not that the
alert is ignored; it is that the *channel* is ignored, and the escalation messages from
[ADR-0007](0007-escalation-is-private-and-laddered.md) that share it go unread too. One noisy
producer degrades every consumer of the same attention.

## The rule

The dedup key carries the **level**, not just the subject:

```
twin:<kind>:<subjectId>:<level>:<YYYY-MM>:<recipientId>
```

`NotificationDelivery` has `@@unique([channel, dedupKey])`, so the key *is* the policy:

- A client moving `medium` → `high` produces a different key, so it sends. That is new information.
- A client sitting at `high` produces the same key, so it is silent. That is not.
- A new month produces a different key, so a still-bad situation resurfaces once. The month is the
  operational cycle here — the matrix, the payroll, and the obligations all turn over on it.
- The recipient is in the key, so a client visible to two seniors reaches both.

Alerts fire on the way up only. Crossing back below a threshold sends nothing: good news is never
urgent, and the cockpit shows recovery without being asked to.

## Why not track previous state explicitly

The obvious alternative is a `lastAlertedLevel` column and a comparison. It stores the same
information the dedup key already encodes, adds a write path that can disagree with what was
actually delivered, and answers "what did we decide" rather than "what did they receive". The
delivery table answers the second question, which is the one that matters when someone says they
were never told.

## Reserve before sending

The claim row is written before the Telegram call, not after. A worker that sends first and records
second will send twice whenever it retries — and BullMQ retries by default. A worker that reserves
first can at worst drop a message, which is recoverable and visible: the row stays `pending` or
becomes `failed`.

This is the same ordering `runDailyDigest` uses, for the same reason.

## Scope is per recipient

Scores are computed once **per senior, with that senior's own actor**, rather than once globally and
filtered afterwards. It costs more queries and it is the only version that cannot leak: a supervisor
is told about their portfolio because that is the only portfolio the computation ever saw. Filtering
after the fact would put the boundary in the last step instead of the first, where a later refactor
can drop it without any test noticing.

`test/twin-alerts.test.ts` asserts a supervisor never receives another supervisor's client.

## Cap per run

Five messages per recipient per run, worst-first. A senior whose portfolio genuinely has thirty
problems does not need thirty notifications to learn that — they need the worst five and a reason to
open the cockpit. The remainder is counted in `skippedCapped` so the number is visible rather than
lost.
