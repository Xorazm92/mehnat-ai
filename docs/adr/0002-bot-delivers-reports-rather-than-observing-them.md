# The bot delivers reports rather than observing them

The five accountant report rules score "hisobot guruhga vaqtida yuborilishi". Rather than watch a
Telegram Group and guess which message is the cashflow report, the ERP performs the Delivery: an
accountant sends a `FinancialReport` from the ERP, the bot posts it to the Company's Telegram
Group, and the timestamp it stamps is the proof. On time or late is then `Delivery <= deadline`.

We chose this over deriving the score from `FinancialReport.status='submitted'` because that field
is a dropdown a human sets, and this rule sets salary: an accountant would be paid for marking a
report submitted while the client received nothing. We chose it over observing the Group because
identifying which message is which report needs a naming convention, a command, or a classifier —
all fragile, and classification would stretch the AI boundary that says the model never touches
KPI.

## Consequences

- The bot is not only a signal source, as the blueprint framed it. It is a delivery channel, and
  Delivery is a fact it creates rather than infers.
- This is a workflow change: staff must stop dragging files into Telegram by hand. That is the
  price of the timestamp being trustworthy.
- The blueprint's proposed `ReportDeadline` model is redundant. `FinancialReport` already carries
  `deadline`, `submittedAt` and `assignedTo`, and `server/reports.ts:48` already queries deadlines.
- `FinancialReport.type` covers only `profit_loss | balance | qqs | cashflow`; the debitor, taxes
  and payroll reports need adding before their rules can score.
