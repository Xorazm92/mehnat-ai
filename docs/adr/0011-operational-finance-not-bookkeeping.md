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
| **Proposed for archive** — bookkeeping ceremony | `server/accounting.ts`: period lock/unlock, year close, snapshot listing |

*(That second row was the original proposal. It was amended once and then answered — see below.
`server/accounting.ts` stays.)*

The proposal was to archive rather than delete: a note in `docs/archive/`, a git tag pinning the
code, one command to restore. Deleting working code because it is currently unused is how a team
loses six weeks of thinking; the cost of keeping a pointer to it is a paragraph.

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

## Answered, 2026-08-07 — the firm wants it; the code was unfinished

Year closing now has a UI, inside `/admin/month-closing` rather than as a new admin module: closing
twelve months and then closing the year is one job, and Article 10 asks what a new screen deletes.
`getYearClosingState` shows what is still missing *before* the button is pressed, and `unlockPeriod`
now requires a reason, matching `reopenMonth`'s discipline — reopening a closed period silently is
how a financial correction loses its "why".

`lockPeriod` is **removed**, not merely left without a button. `closeMonth` owns the
`AccountingPeriod` state machine (`lib/periodLock.ts` says so in its header) and gates a month
behind a checklist; `lockPeriod` wrote the same rows with no checklist. `closeYear` never used it —
it writes the twelve periods directly inside its own transaction — so its only remaining caller was
`test/period-lock.test.ts`, using it as a lever to reach the LOCKED state. That test's real subject
is the write guard in `lib/periodLock.ts`, so the lever was replaced with a direct row write and
every assertion stayed. Audit coverage for *locking* was never that test's job either: it belongs
to `closeMonth` and lives in `test/month-closing.test.ts`.

The private helper that remains is named `setPeriodOpen` and can only open a period. A function
that cannot express the unsafe operation is a better guarantee than a comment asking people not to
call it.

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
- Nothing was archived in the end. The two-step — amend when "zero callers" proved incomplete, then
  answer — is the record worth keeping: the original reasoning was sound and its evidence was not,
  and a deletion made on it would have taken 11 tests of the financial core with it.
- If the firm ever decides to keep its own books in ASRO — statements, tax-purpose closing — this
  ADR is the thing to supersede. Article 1 forbids that, and Article 1 is amendable by ADR.
