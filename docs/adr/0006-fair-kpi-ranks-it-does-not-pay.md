# Fair KPI ranks, it does not pay

Three KPI mechanisms coexist: `KpiRule`/`MonthlyPerformance` (the reglament, wired to payroll),
`FairKpiScore` (a 0–100 weighted composite, built in "shadow mode"), and `KpiEvent` (the bot's signal
ledger). `ASRO_CPO_AUDIT.md` reads this as sprawl and recommends retiring the first and taking Fair
KPI live. We are keeping all three and giving each one job, because the audit's recommendation would
break something it did not weigh.

`MonthlyPerformance` is not an implementation detail — it *is* the compensation agreement. The
reglament says "20% + KPI 5%", "‑0.5% each time a group message goes unanswered past the regulation",
"‑1% of that firm's monthly share". A composite of 82/100 cannot express any of those, so shipping
Fair KPI as the payer would silently replace terms employees agreed to with terms nobody signed.

So: **`MonthlyPerformance` pays. `FairKpiScore` ranks. `KpiEvent` + `Obligation` + `Attendance` are
the shared evidence underneath both.** That is one source of facts and two readings of it, which
answers the audit's real complaint (three parallel truths) without changing anyone's pay contract.

`shadowMode` therefore stops meaning "not launched yet" and starts meaning "this layer does not pay,
by design". The `/fair-kpi` banner says so plainly; the previous wording ("2–3 oy kuzatib, keyin bonus
tizimiga ulanadi") promised a migration we are explicitly not doing.

## Consequences

- Nothing should ever wire `FairKpiScore` into `lib/kpiLogic.ts` or `server/payroll.ts`. If leadership
  later wants composite-based pay, that is a change to the employment agreement first and a code
  change second, in that order.
- The audit says Fair KPI's `volume` reads `TimeEntry`. It does not, and did not — `server/fairKpi.ts`
  has always summed `complexityWeight` over obligations. The real defect was narrower and worse: it
  counted every obligation whose deadline fell in the period *regardless of status*, so volume
  measured what someone was assigned rather than what they finished, and an employee who did nothing
  scored the same as one who closed everything. Volume now counts only `accepted` obligations and
  `done` tasks. That number only became meaningful once the bridge in
  [ADR-0005](./0005-kpi-is-derived-from-evidence-and-confirmed-by-a-human.md) started moving
  obligations out of `planned`; before it, the honest reading of every volume score was zero.
- `server/fairKpi.ts` selects obligations by `dueAt` falling inside the month, while the reglament
  projectors select by the obligation's period. The two answer different questions — "what was due in
  July" versus "how did July's work go" — and are intentionally not unified.
