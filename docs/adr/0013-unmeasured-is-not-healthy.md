# Unmeasured is not healthy

The Digital Twin gives each client three scores — Risk, Capacity, Compliance — and each of them can
be `null`. This document is about that `null`, because it is the decision in the design that is
easiest to undo later and hardest to recover from.

## The choice

A company with no obligations in a period has no compliance percentage. The arithmetic offers two
answers and they are both defensible in isolation:

- **100** — nothing was late, so nothing was missed.
- **`null`** — we have no evidence either way.

`lib/fairKpi.ts` already picked the first one, deliberately, and it was right to: `slaScore` returns
a neutral 100 when `eligible` is zero because it scores *people*, and punishing an accountant for a
quiet month is unjust. The twin scores *clients*, and the same rule inverts.

A client scoring 100 sorts to the safe end of every list on the cockpit. So the clients we know the
least about become the ones we look at last — and the reason a client has no obligations is almost
never "nothing was due". It is a template that was never activated, an `applicability` rule that
excluded them by mistake, an override left in place after the reason for it expired, or a contract
that started mid-period. Every one of those is a problem, and every one of them is *hidden* by a
green 100.

So: **absence of data reads as absence of data.** `Score.value` is `number | null`, `level` has an
`unknown` member, and the cockpit renders `—`.

## What follows from it

`capacityLoad` distinguishes two things that would otherwise collapse: `0` means measured and idle,
`null` means the work fund is unknown. "This person has nothing to do" and "we cannot tell what this
person has to do" lead to opposite actions, so they cannot share a rendering.

`persistRiskLevels` skips `unknown` rather than writing `low`. `Company.riskLevel` was a hand-entered
column read in seven places; making it computed must not quietly relabel every unmeasured client as
safe on its way through.

`selectAlerts` never fires on `null`. A missing measurement is a real problem but it is not the
problem an alert can solve, and sending one would train people to dismiss the channel.

## Why there is no Health score

The plan originally carried five scores, with Health as a weighted roll-up of the others. It is cut,
and not for cost.

A composite reads well and decides nothing. When Health drops, the only available next step is to
open the components and find out which one moved — so the components are what the product shows, and
the roll-up would exist purely to be quoted in a status meeting. Worse, a weighted average lets a
strong component mask a critical one: a client can be 95% compliant and still have an accountant at
190% capacity, and the number that averages those is actively misleading.

Profitability is cut for a different and simpler reason, recorded in [ADR-0010](0010-effort-is-normative-not-timed.md):
`EmployeeCostRate` has no rows, so margin equals revenue and the score would be fiction.

## The cost of this decision

The cockpit shows fewer confident numbers than it could. On a portfolio where template coverage is
still partial — 14 of 42 matrix columns at the time of writing — a meaningful share of clients render
as `—`, which looks like the feature is unfinished.

We accept that, because it is true. The dashes *are* the coverage gap, displayed honestly. They
disappear as templates are activated, and until then they point at exactly the work that remains.

## Enforcement

`lib/engines/analytics/twin.spec.ts` asserts `null` for each unmeasurable input, and separately that
every score's `reasons` sum to its `value` — an explanation computed apart from the number will drift
from it, and Article 7 of the constitution then holds only by convention.
