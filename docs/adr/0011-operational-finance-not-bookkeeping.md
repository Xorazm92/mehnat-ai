# ASRO tracks operational money; it does not keep the firm's books

The product line is "1C keeps accounting, ASRO runs the business", and the honest question that
follows is whether the firm's *own* books belong in ASRO. A double-entry `LedgerEntry`, an
`AccountingPeriod` state machine, immutable `FinancialSnapshot` rows and a year-closing routine
were all built here, which looks like the answer is yes.

The code says otherwise. `server/accounting.ts` — period lock, period unlock, year close, snapshot
listing, opening balance — is 200 lines exporting six functions, and **not one of them has a caller
anywhere in the repo**. The accounting-grade ceremony was built and then never used, which is the
clearest possible evidence that the firm keeps its books in 1C, as it should.

But the ledger itself is a different thing entirely, and the distinction is the whole decision.
`lib/ledger.ts` is imported by `server/kassa.ts`, `server/payouts.ts`, `server/payroll.ts`,
`lib/monthClose.ts` and `server/monthClosing.ts`. It is live, it is load-bearing, and what it
provides is not bookkeeping — it is an **integrity guarantee on the firm's cash**. Balanced legs
mean a movement cannot be recorded half-way; `reverseLedger` works on the net outstanding amount so
that post→reverse→post cycles cannot drift; the journal is append-only so corrections are visible
rather than silent.

So the boundary is drawn between the ledger and the ceremony, not around double-entry as a
technique:

| | |
|---|---|
| **Kept** — Operational Finance | `lib/ledger.ts`, `LedgerEntry`, `Kassa`, `Expense`, `Payout`, `Payroll`, month closing |
| **Archived** — bookkeeping ceremony | `server/accounting.ts`: period lock/unlock, year close, snapshot listing |

Archived, not deleted: `docs/archive/accounting-core/` records what it was and why it was removed,
the git tag `archive/accounting-core-v1` pins the code, and one command restores it. Deleting
working code because it is currently unused is how a team loses six weeks of thinking; the cost of
keeping a pointer to it is a paragraph.

## Amendment, 2026-08-06 — the archive is deferred

The argument above rests on "zero callers", which is true and turned out to be incomplete. Four of
the six exports — `lockPeriod`, `unlockPeriod`, `closeYear`, `getOpeningBalance` — are covered by
`test/period-lock.test.ts` and `test/year-closing.test.ts`: **11 tests, 252 lines**. Nobody calls
them from the app, but somebody sat down and specified how they must behave.

That makes archiving a **product decision**, not a cleanup. Removing the file removes those tests,
and with them the recorded answer to "may a locked period be written to?" and "what does closing a
year do to opening balances?". Cleanup deletes things nobody decided about; this is not that.

So: the two genuinely dead exports (`getAccountingPeriods`, `getFinancialSnapshots`) are gone, and
the rest stays until the question is answered explicitly. The question is narrow —

> Does the firm want a period lock and a year close for its **own** operational cash, or does it
> want neither because 1C already does it?

If neither, archive the file and its two test suites together, as one decision with one record. If
the lock is wanted, the code is not dead — it is unfinished, and it needs a caller rather than a
tag. Either answer is fine; the wrong move is to archive it as though the question never existed.

## Consequences

- [Modda 1](../CONSTITUTION.md) forbids **new period-closing ceremony**, not double-entry. An
  earlier draft of the constitution said "no model with debit/credit legs", which would have failed
  the build on `lib/ledger.ts` — a rule that breaks working code on day one teaches people to
  disable rules.
- Month closing stays because it is used and because it is operational: it answers "is this month's
  cash settled" for the firm's own management, not "what does the tax authority get". It reads
  `getTrialBalance` as an invariant check, which is exactly the ledger's intended job.
- The firm's own staff payroll stays core. It is the output of KPI — 63 employees are paid from it —
  and it is not the same thing as keeping a client's books. Client payroll (`my_mehnat`,
  `hisoblangan_oylik`) is an **obligation**, tracked but not computed here.
- If the firm ever does decide to keep its own books in ASRO, this ADR is the thing to supersede,
  and the restore path is one tag away. That is the point of archiving rather than deleting.
