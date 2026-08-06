# Effort is normative, not timed

`server/profitability.ts` computes a per-client contribution margin correctly: revenue minus
`TimeEntry` minutes valued at an effective-dated `EmployeeCostRate`. It is tested. It is also
useless, because `TimeEntry` has **0 rows** and `EmployeeCostRate` has **0 rows**. Labour cost is
therefore zero and margin equals revenue for every client in the portfolio.

The single entry point for time is a ⏱ button on each row of the tasks page
(`app/(dashboard)/tasks/TasksClient.tsx`). There is no timer, no timesheet, no bulk entry, no bot
command. `TimeSource` declares `timer | estimate | normative` and nothing has ever written any of
them.

The instinct is to fix adoption — remind people, add a timer widget, score it in KPI. We are not
going to do that. An accounting outsourcing firm does not do 100% time tracking; this has been
tried here and it did not happen, and the reason is structural rather than motivational. An
accountant working six clients in one afternoon cannot honestly attribute minutes after the fact,
so what a timer produces is not measurement but a second act of recollection — with the added cost
of interrupting the work it claims to measure.

So effort is **derived from work that already gets recorded**:

```
minutes(obligation) = normativeMinutes(template) × complexity(company)
```

`DeadlineTemplate.normativeMinutes` is set once per obligation type by the chief accountant.
`Company.complexity` already exists as a `CompanyComplexity` enum. Every obligation that reaches
`accepted` contributes its normative minutes automatically — nobody presses anything.

Manual entry is kept and **wins**: a `TimeEntry` with `source='timer'` overrides the normative
figure for that obligation. The normative model is the floor, not a ceiling.

## Consequences

- Capacity becomes computable for every employee on day one instead of never:
  `Σ normativeMinutes × complexity ÷ working-hours fund`. "Abdulloh 178%, Jahongir 62%" is the
  single most requested number in the cockpit and it now costs no behaviour change from anyone.
- Profitability stays in the icebox anyway, because `EmployeeCostRate` is still empty and a margin
  computed from a zero cost rate is a confident lie on the buyer's main screen. Normative *minutes*
  are available immediately; normative *money* waits for rates to be seeded.
- `lib/margin.ts` accepts `extraCost` and `penalties` and no caller has ever supplied either, so
  both are permanently 0. They get wired when profitability ships — direct client expenses and
  late-filing penalties respectively.
- The numbers are estimates and must be labelled as such wherever they appear. A normative figure
  presented as measured fact is the failure mode
  [ADR-0003](./0003-the-bot-scores-only-what-telegram-can-witness.md) refused for the bot: inventing
  a proxy and then paying people against it. Capacity informs assignment; it does not move salary.
- Because effort now derives from `Obligation`, its accuracy improves as template coverage grows.
  That is a useful coupling: the same work that satisfies "nothing is forgotten" also makes the
  workload figure truer.
