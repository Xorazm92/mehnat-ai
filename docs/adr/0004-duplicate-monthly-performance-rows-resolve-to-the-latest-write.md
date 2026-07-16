# Duplicate Monthly Performance rows resolve to the latest write

`MonthlyPerformance` never carried the `(month, companyId, employeeId, ruleId)` unique constraint
that [ADR-0001](./0001-bot-proposes-human-disposes.md) assumes, and `server/kpi.ts` looked for a row
to update with `status: { not: "approved" }` while `NazoratchiChecklist.tsx` wrote `status='approved'`
on every counter click — so the guard could never match its own writes and inserted instead. We
deduplicated the surviving rows by keeping the **latest by `recordedAt`** per natural key, then added
the constraint.

We chose latest-wins because the checklist client already merged each response into local state by
natural key and rendered only the newest row: the Supervisor was looking at the latest value and
believed it was the value. Deduplicating to latest makes the database agree with the screen the human
was making decisions in front of. The alternatives were worse — keeping the most favourable score per
key would silently overrule the Supervisor's actual last judgment, and quarantining the duplicates for
manual re-entry would blank 13 cells whose correct value we can already read off the newest row.

## Consequences

- 281 rows across 13 natural keys were deleted, all `status='approved'`. Approved rows reach payroll
  (`lib/kpiLogic.ts:104`), so this changed real pay. Worst case: one accountant's July penalty was
  −197.00% across 187 rows where 14 cells existed; deduplicated it is −14.00%. Because penalties are
  uncapped by design (`lib/kpiScoring.ts:150`) and `finalAmount = Math.max(0, base + kpiBonus)`, he was
  being paid **zero** rather than taking a 14% cut.
- 5 of the 13 keys were `source='supervisor'` (the live bug). The other 8 came from
  `scripts/seed-kpi-*.ts`, which write `source='system', status='approved'` demo history and had to be
  made constraint-safe in the same change.
- A pre-migration dump of all 11,563 rows is the only record of the deleted values. Latest-wins is not
  reversible from the surviving data.
- This is a repair, not a new rule. The write path now keys its guard on `source` rather than `status`,
  which is what ADR-0001 specified all along: the rollup "may only ever touch rows that are still
  draft-and-system", and "a Supervisor's edit mutates that same row".
