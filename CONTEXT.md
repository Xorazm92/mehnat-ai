# ASRO — domain language

The one place a concept gets its name. If two words mean the same thing, only the one
listed here is written in code, in the UI and in commits.

ASRO is the operations system of an accounting outsourcing firm: the client companies it
keeps books for, the staff assigned to each, the obligations they owe, and the monthly KPI
that determines what those staff are paid. It is not an ERP — see
[`docs/PRODUCT.md`](docs/PRODUCT.md).

## Language

### Organisation

**Company**:
A client business the firm keeps books for. Carries a contract amount, a payment day, and named
staff in three roles.
_Avoid_: firm, client, organisation, tenant

**Bank-client**:
The role responsible for a Company's bank operations. Written `bank_client` on a KPI Rule but
`bank_manager` on a User — one role, two spellings, mapped at the boundary.
_Avoid_: bank manager, bank operator

**Supervisor**:
The role that assesses another employee's monthly KPI and is itself assessed. Uzbek: Nazoratchi.
_Avoid_: controller, reviewer, manager

**Telegram Group**:
The chat where a Company's staff and its client talk, and where reports are delivered. This is
what "guruh" means in an `acc_*` rule.
_Avoid_: group, guruh, chat

**Portfolio**:
The set of Companies one Supervisor is accountable for. This is what "guruh" means in a `sup_*`
rule and what a rule's `per_group` scope is scoped to — never a Telegram Group.
_Avoid_: group, guruh, supervisor group

### Work

**Obligation**:
One thing a Company owes for one period — a declaration, a report, an internal regulation step —
generated from a Deadline Template against the business calendar. It is the record of the work;
everything else that mentions the work is a way to move it or a way to look at it.
_Avoid_: deadline, requirement, duty

**Matrix Cell**:
One firm × month × column square in the operation matrix. A way to move an Obligation, not a second
place to store its state. Its text carries a claim: `+` accepted, `topshirildi` submitted, `-`
rejected, `kartoteka` a payment stuck at the bank (which says nothing about the report), free text
work in progress.
_Avoid_: matrix field, report column value

**Submission**:
One attempt at handing an Obligation in, numbered, with its own Evidence and its own outcome. A
rejection followed by a fix is a second Submission, never an edit of the first.
_Avoid_: filing, send, delivery — Delivery is the Telegram sense above

**Evidence**:
What backs a Submission: a screenshot, a receipt, an external reference. It is a reference to
stored material, never the material itself. Evidence shows we submitted; it is not the state's word
that we did.
_Avoid_: proof, attachment

**Task**:
Ad-hoc work someone was asked to do. A Task attached to an Obligation is a step on it and inherits
its firm and due date; closing that Task makes the Obligation `ready`, never `sent` — internal work
finishing is not a filing.
_Avoid_: ticket, todo, assignment

**Late**:
Past the Obligation's due date without an approved reason. There is one definition and one clock —
the task SLA layer that kept a second one was removed. A reason excuses lateness only once a manager
approves it, which is also what keeps it out of KPI.
_Avoid_: overdue, breach, SLA breach

**Financial Report**:
The document — its lines, its format, who signed it. Not the work: the deadline and the responsible
person live on the Obligation it is attached to. A report with no Obligation is something prepared
outside the regulation.
_Avoid_: report — that is the Matrix Cell sense; statement

### KPI

**KPI Rule**:
A configured bonus or penalty definition. Rules are data, never code — an admin changes one
without a deploy.

**Counter Rule**:
A KPI Rule whose month is a running total: days arrived early, minutes late, days absent. Its
value is additive, so it can be summed from Signals.
_Avoid_: counter-type rule, numeric rule

**Verdict Rule**:
A KPI Rule whose month resolves to exactly one colour. Its value is categorical, so it can never
be summed from Signals — it needs a threshold to turn counted Signals into a colour.
_Avoid_: select rule, three-state rule

**Verdict**:
The single colour — green, yellow, or red — that a Verdict Rule resolves to for one employee, one
Company, one month.
_Avoid_: score, rating, state

**Signal**:
An immutable observed fact: an arrival, a response, a report reaching a group. What the bot
records. A Signal is evidence, never a conclusion.
_Avoid_: event, message, log entry

**Monthly Performance**:
The per-rule, per-employee, per-Company monthly KPI record that payroll reads. The conclusion a
Signal is evidence for.
_Avoid_: score, KPI entry, performance row

**Review Window**:
The period a system-proposed Monthly Performance waits for a Supervisor before it approves itself.
_Avoid_: grace period, timeout

**Delivery**:
The moment a Company receives a report in its Telegram Group. A report is on time or late against
its deadline by its Delivery, not by anyone's word for it.
_Avoid_: send, submission, dispatch
