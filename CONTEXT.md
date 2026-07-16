# Mehnat ERP

An accounting firm's ERP. It tracks the client companies the firm keeps books for, the staff
assigned to each, and the monthly KPI that determines what those staff are paid.

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
