# ASRO ERP — Chief Product Officer Audit & Product Strategy

> **Holat: TARIX** · 2026-07-23 — o'sha kungi tashxis — bugungi kod bilan qayta solishtirilmagan.
> [`docs/PRODUCT.md`](../PRODUCT.md) buni **almashtiradi** (PRODUCT.md §Almashtiradi). Mahsulot yo'nalishi bo'yicha bu hujjatga tayanmang.
> Amaldagi hujjatlar xaritasi: [`docs/README.md`](../README.md)

**Author:** CPO / ERP Architect (audit)
**Date:** 2026-07-23
**Basis:** Read of the actual source — `prisma/schema.prisma` (1,722 lines, 55+ models), 42 app routes, 39 server-action files, 49 lib modules, the DDD Telegram bot, and the two internal strategy docs (`PROJECT_REVIEW.md`, `ASRO_PRODUCT_BLUEPRINT_2.0.md`).
**Tone:** Brutally honest. Every claim is grounded in code that exists, not in what the docs assert.

> **One-line verdict:** ASRO is a genuinely excellent *engineering* project pointed slightly off its own target. It has built the hardest 30% (accounting-grade financial core) deeply, and the strategically decisive 70% (a live truth-feed from 1C, a director cockpit, and a data-grounded AI) either shallowly or not at all. The foundation is a 9; the product a buyer would pay for is a 5.

---

## 0. The Reframe (read this first — everything else depends on it)

The internal blueprint already got the most important thing right, and I'll reinforce it harder than the docs do:

> **ASRO is not an ERP. It is an Accounting-Firm Operations & Compliance Operating System.**

It is the **control tower over N isolated per-client 1C installations**. 1C is the accounting engine, one per accountant, forever. ASRO's entire reason to exist is four sentences:

1. **No client obligation is ever missed** (deadline/compliance).
2. **Every hour of effort is attributed to a client** (workload/cost).
3. **Every client's and every employee's profitability is known** (margin).
4. **The director sees risk before it becomes loss** (cockpit + AI).

Any module, table, or line of code that does not serve one of those four is scope creep — no matter how well-built. This lens is what makes the rest of this audit's "delete / redesign" calls non-arbitrary.

---

## TASK 1 — What ASRO Actually Is

### 1.1 What kind of product it is
An **operations & compliance management layer** for a bookkeeping *outsourcing firm*. The customer (economic buyer) is the **firm owner / director / COO**. The users are accountants, bank-client operators, and supervisors. It is a *system of engagement and control*, sitting on top of *systems of record* (many 1C instances). Calling it "ERP" is a category error that invites the wrong feature demands.

### 1.2 Business problems it SOLVES today (verified in code)
- **Client registry + responsibility map** — `Company` with accountant/supervisor/chief/bank-client roles, department structure. ✅ Solid.
- **Recurring obligation generation + deadline escalation** — `DeadlineTemplate → Obligation`, `BusinessCalendarDay` (workday shifting), `lib/obligationSweep.ts` (idempotent D-5/D-3/D-1/due/overdue reminders, in-app + Telegram, dedup-keyed). ✅ **This is the crown jewel — genuinely good.**
- **Monthly report status + screenshot-proof workflow** — `MonthlyReport`, `ReportProof`, `NazoratchiChecklist`. ✅ Works, but architecturally wrong (see 1.6).
- **KPI → payroll computation** — `KpiRule`/`MonthlyPerformance`, `PayrollAdjustment` vs `Payout` (obligation-vs-payment separation). ✅ Correct accounting instinct.
- **Telegram signal capture + question SLA** — DDD bot (bounded contexts, value objects, specs). ✅ **Second crown jewel — high-quality.**
- **Billing + debt escalation** — `Invoice`, `PaymentReminder` (🟡🟠🔴 per company+period). ✅ Solid.
- **Firm's own cash/expense tracking** — `KassaEntry`, `Expense` (3-tier approval), `LedgerEntry`, `AccountingPeriod`, `FinancialSnapshot`. ✅ Works — but over-built (see 1.5).

### 1.3 Business problems it does NOT solve (the honest list)
1. **It has no authoritative source of truth.** Almost every status in ASRO is *manually typed by a human into a matrix*. The 1C integration that would make ASRO authoritative is **scaffolding only** — schema (`OneCConnection`, `IntegrationEvent`, `SyncRun`) + an ingest seam (`lib/oneCIngest.ts`) + an admin page, but **no live 1C-side agent and no field mapping**. → **This is the existential gap.** Until it closes, ASRO is a very well-engineered shared spreadsheet.
2. **The director has no cockpit.** There are role cabinets (`AdminCabinet`, 271 lines) but not the "what is on fire right now" single screen the buyer opens every morning. The blueprint's "Director Mode Dashboard" is a mockup, not a page.
3. **The AI cannot answer one question about a real client.** `server/assistant.ts` + `lib/ai/knowledge.ts` **never import Prisma**. It's a static UZ tax-law chatbot with a heuristic fallback. The blueprint's "analyze Artel Logistics' last 30 days" **does not exist**.
4. **Profitability is theoretical.** `server/profitability.ts` computes `margin = paid Payment − (TimeEntry minutes × cost rate)`. If nobody logs `TimeEntry` (and nothing in the workflow forces them to), `laborCost = 0` and margin = revenue. **Garbage-in, garbage-out.**
5. **No client acquisition/onboarding** — there is no lead/CRM/pipeline model at all.
6. **The client experience is a bare ticket form** — `ClientUser` + `ClientRequest` + `/portal`. The client sees almost nothing (no reports, no payment history, no documents).

### 1.4 What is MISSING (in priority order)
1. **Live 1C sync** — the truth feed. Without it, nothing else is trustworthy.
2. **Director Cockpit** — the buyer's daily screen.
3. **Data-grounded AI copilot** — LLM narration over deterministic DB reads (not free chat).
4. **Frictionless effort capture** — so workload & profitability aren't fiction. (Recommendation: derive effort from *normative minutes per obligation-type × company complexity*, not hand-logged timers.)
5. **A single atomic "unit of work"** — today "did the client's report get filed?" is represented **three different ways**: `MonthlyReport` (60+ hardcoded columns), `Operation` (annual/quarterly), and `Obligation` (the real engine). This triplication is the deepest structural debt.
6. **Real client portal** — report visibility, payment history, document exchange.

### 1.5 What should be REMOVED / de-scoped (the brutal part)
- **⚠️ Downgrade the accounting-grade financial core for the firm's OWN money.** The double-entry `LedgerEntry`, `AccountingPeriod` state machine, DB-trigger-locked immutable `FinancialSnapshot` — this is *enterprise-accounting machinery for the firm's own books.* **The firm is an accounting firm; it already keeps its own books in its own 1C.** Building this inside ASRO **duplicates 1C** — violating your own stated rule ("Do NOT duplicate accounting"). Recommendation: keep **operational** cash tracking (who paid us, did we pay salaries, what's the cash position) and **delete/freeze** the period-close/immutable-snapshot/double-entry layer. This is my single strongest challenge to your assumptions — force this decision explicitly: *does the firm keep its own books in ASRO or in 1C?* If 1C (almost certainly), this layer is gold-plating that will cost you maintenance forever.
- **Freeze the Inventory module** (`InventoryItem`). Zero strategic value for a bookkeeping firm's OS. Keep the table, never invest another hour.
- **Collapse two of the three KPI systems.** `KpiRule/MonthlyPerformance` + `KpiEvent` + `FairKpiScore` is conceptual sprawl. One model.
- **Kill `MonthlyReport`'s 60+ hardcoded columns.** A spreadsheet transplanted into Postgres is not a data model. These become obligation instances.

### 1.6 What should be REDESIGNED
- **Report matrix → obligation instances.** Retire `MonthlyReport`/`Operation` as parallel truth; make `Obligation` the one model. `ReportProof` becomes `SubmissionEvidence` (the schema already bridges this — finish it).
- **KPI → one model, out of shadow.** Ship Fair KPI v2 live after fixing its volume input.
- **Dashboard → true Director Cockpit** on top of the role cabinets.
- **AI → grounded copilot** with read-tools over the DB.

### 1.7 What should be the CORE (the product's spine)
1. **Company Workspace** (the object everything hangs off)
2. **Obligation & Deadline Engine** (the heartbeat — already best-built)
3. **1C Integration** (the truth feed — currently the biggest hole)
4. **Director Cockpit + Grounded AI** (the buyer's value)
5. **Telegram Workflow** (the capture surface — the firm already lives there)

---

## TASK 2 — Module Architecture (CORE / IMPORTANT / OPTIONAL / FUTURE)

| Tier | Module | Why it's in this tier |
|---|---|---|
| **CORE** | **Company Workspace** | Every other object references a company. If this isn't the center of gravity, nothing coheres. |
| **CORE** | **Obligation & Deadline Engine** | The one thing SAP/Odoo/1C-ITS don't localize for UZ bookkeeping firms. Already ~85% built. This *is* the product. |
| **CORE** | **1C Integration Layer** | Converts ASRO from "manual spreadsheet" to "authoritative system." Today the weakest link; strategically the most important. |
| **CORE** | **Director Cockpit** | The economic buyer opens this daily. If it isn't excellent, the firm churns regardless of backend quality. |
| **CORE** | **Telegram Workflow** | The firm *already* operates in Telegram. This is the lowest-friction capture and delivery surface. |
| **IMPORTANT** | **Profitability Engine** | Drives the CEO's "renegotiate/fire client" decisions — but only after trustworthy effort data exists. |
| **IMPORTANT** | **Workload / Capacity** | Prevents burnout and unfair assignment. Same effort-data dependency as profitability. |
| **IMPORTANT** | **Billing & Debt** | Cash collection; already solid. Automate invoice issuance from contracts. |
| **IMPORTANT** | **KPI / Payroll (unified)** | Retention & fairness. Collapse the 3 systems; ship Fair KPI live. |
| **IMPORTANT** | **Document & Credential Vault** | Proofs + encrypted client credentials. Finish encryption (see security debt). |
| **IMPORTANT** | **Grounded AI Copilot** | A leverage multiplier — but only *after* the data is trustworthy. Garbage data + AI = confident garbage. |
| **OPTIONAL** | **Client Portal** | Real differentiator *later*; a ticket form today. Invest after internal flows are trusted. |
| **OPTIONAL** | **CRM / Leads** | A genuine gap, but the firm can sell without it initially. Add when scaling client intake. |
| **OPTIONAL** | **Attendance / E-jurnal** | Feeds discipline KPI only. Low leverage. |
| **OPTIONAL** | **Firm Financial Reports (P&L/Balance export)** | If the firm's books live in 1C, this is redundant. Keep only as operational cash views. |
| **FUTURE / REJECT** | **Accounting-grade ledger & period-close** | Duplicates 1C. Downgrade to operational. |
| **FUTURE / REJECT** | **Inventory** | Freeze. |
| **FUTURE** | **Multi-tenant SaaS** | Only after single-tenant is proven with 3+ paying firms. Schema is deliberately single-tenant today. |
| **FUTURE** | **Cross-firm benchmarking, mobile apps, marketplace** | Moat-building, but far out. |

---

## TASK 3 — Enterprise Information Architecture

```
ASRO
├── 🏠 Cockpit (role-aware home)
│    ├── Director Mode      — "what's wrong right now": overdue obligations, at-risk clients, SLA rate, revenue/debt, action-required queue
│    ├── Supervisor Mode    — pending KPI approvals, team's overdue obligations, proof review queue
│    ├── Chief Mode         — department health, approvals (expenses/reports), team payroll
│    └── Accountant Mode    — my obligations this week, my tasks, my SLA clock, my KPI
│
├── 🏢 Clients (Companies)
│    ├── List / Portfolio   — filter by risk, regime, department, margin, overdue count
│    └── Company Workspace  — the 360° record (see Task 4) ★ the heart
│
├── ⏰ Compliance
│    ├── Deadlines Board    — all open obligations, calendar + kanban, by due date / responsible / risk
│    ├── Obligation Detail  — timeline, submissions, evidence, delay reason + approval
│    └── Calendar Admin     — business days / holidays (workday shifting)
│
├── ✅ Work
│    ├── Tasks              — in-app tasks + SLA clocks
│    └── SLA / Breaches     — response & resolution breach monitor
│
├── 💰 Money (the firm's own — OPERATIONAL, not accounting)
│    ├── Billing            — invoices, issue-from-contract, debt aging
│    ├── Payments (in)      — client contract payments + reminders
│    ├── Cash & Expenses    — kassa, expense approval
│    └── Payroll            — obligation (compute) vs payout (paid)
│
├── 📊 Intelligence
│    ├── Profitability      — client margin ranking (loss-makers first)
│    ├── Workload           — capacity % per employee (complexity-weighted)
│    ├── KPI                — unified score (out of shadow)
│    └── AI Copilot         — grounded queries + scheduled digests
│
├── 📄 Documents            — proofs, contracts, encrypted credentials vault
├── 🔗 Integrations         — 1C connections/sync health, Didox, Soliq, Bank
├── 👥 Client Portal        — (client-facing) their reports, payments, documents, requests
└── ⚙️ Admin                — users, roles/RBAC, departments, deadline templates, SLA policies, month-closing, settings, audit
```

**Page-by-page purpose (the ones that matter most):**
- **Director Mode** — the buyer's 5-second situational awareness. Exists as mockup only; build it.
- **Company Workspace** — replaces the "data scattered across Excel + Telegram" problem. Today it's a 1,076-line *drawer*; promote to a full page.
- **Deadlines Board** — the operational nerve center; the engine exists, the board UI needs to be first-class.
- **Profitability / Workload / KPI** — the three decision screens for the owner; all depend on trustworthy effort data.
- **Integrations** — sync health must be visible or nobody trusts the numbers.

---

## TASK 4 — Company Workspace (the heart)

Promote today's `CompanyDrawer` to a **full-page workspace** with these tabs. Every widget earns its place:

| Tab / Widget | Why it exists |
|---|---|
| **Overview (360 passport)** | Regime, responsible staff, contract, this-month payment status, obligation completion %, risk badge. The one screen that answers "what is this client and is it OK?" |
| **AI Summary** | 3-sentence grounded narration ("6/7 reports filed, avtokameral letter missing, margin +14%, low risk"). Generated from DB, not typed. High CEO value. |
| **Deadlines** | This company's obligations (upcoming + overdue), with responsible + status. The compliance heartbeat, scoped to one client. |
| **Reports/Submissions** | Filed reports + evidence (proof screenshots → external receipts). The audit trail of "did we do the work." |
| **Payments** | Invoices issued, payments received, debt, reminder history. Answers "are they paying us?" |
| **Documents & Credentials** | Contracts, certificates, encrypted soliq/bank/didox logins. Kills the "passwords in Telegram" problem. |
| **Timeline / Activity** | Chronological event stream (invoice arrived → accountant took it → filed → client notified). The "where did it stall?" view. |
| **Assigned Employees** | Who works this client + their effort/hours. Feeds workload & profitability. |
| **Profitability** | Revenue − effort cost = margin, for *this* client. The renegotiate/fire signal. |
| **Risks** | Risk level + notes + open flags (overdue count, debt, rejected submissions). |
| **Comments / History** | Human notes + full change history (from `AuditLog` / status events). |

**Design principle:** the workspace is *read-first, act-second*. A director should understand the client in 5 seconds (Overview + AI Summary), and only drill into tabs when acting. Today's drawer buries this in a modal — that's the redesign.

---

## TASK 5 — Deadline Engine (mostly built — here's the business logic + the one missing piece)

**You already built this well.** The logic (verified in `lib/obligations.ts`, `lib/obligationSweep.ts`, `lib/deadlines.ts`, schema):

1. **Templates are versioned & lifecycle-gated** (`draft → approved → active → retired`). An admin *cannot* push a rule to production instantly. Old obligations keep their `templateVersion` snapshot. ✅ Correct — this is how enterprise compliance rules should work.
2. **Applicability is multi-criteria** (`TemplateApplicability`: tax_regime, vat_payer, has_employees, stats_type…), not just tax regime. ✅
3. **Company overrides** (`CompanyObligationOverride`: disable / custom due / reassign). ✅
4. **Workday shifting** via `BusinessCalendarDay` + `WorkdayAdjustmentPolicy` (next/previous workday). ✅
5. **Deadline anchoring**: `period_end_offset` (+N days after period) or `fixed_day_of_month`. ✅
6. **Escalation sweep** is idempotent (D-5 🟡 / D-3 🟡 / D-1 🟠 / due 🟠 / overdue 🔴) with dedup keys so restarts never double-send, to both in-app and Telegram. ✅ **Excellent.**
7. **Delay reason is two-stage**: marked *then manager-approved*, and KPI exclusion only applies when approved + evidenced. ✅ Fair-process design.
8. **Evidence discipline**: the schema explicitly encodes that *a screenshot is NOT "soliq accepted."* Only `external_reference` / `receipt` / `api_response` / `manual_approval` closes an obligation as accepted. ✅ **This is exactly right and rare — don't lose it.**

**The one missing piece:** obligations still **close by hand**. The compliance engine's value doubles the moment **1C/Didox/Soliq auto-close them**: a Soliq acceptance receipt or Didox status flips the obligation to `accepted` automatically. That's the bridge from "reminder system" to "assurance system." Wire it in the `applyIntegrationEvent` seam that's already stubbed.

---

## TASK 6 — KPI 2.0 (you have the model — here are the formulas + the fix)

You already built `FairKpiScore`: **SLA 35 / Quality 25 / Client 15 / Volume 15 / Discipline 10**, complexity-normalized, in shadow mode. Good bones. Map to the enterprise dimensions you asked for:

| Dimension | Formula (0–100) | Data source (mostly exists) |
|---|---|---|
| **Timeliness (SLA)** | `100 × on_time_obligations / total_obligations` (excluding approved-delay) | `Obligation` (dueAt, completedAt, delayApprovedById) |
| **Accuracy (Quality)** | `100 × (1 − rejected_submissions / total_submissions)` − rework penalty | `ObligationSubmission` (status=rejected), `Task.reworkReason` |
| **Client Satisfaction** | Blend of question-response SLA + client-request resolution + complaint flags | `Question` (answered on time?), `ClientRequest` |
| **Productivity (Volume)** | complexity-weighted obligations completed ÷ role norm | `Obligation` × `CompanyComplexity` (**not** TimeEntry — see fix) |
| **Workload** | see Task 8 (this is capacity, feeds fairness not reward) | obligations + complexity |
| **Profitability contribution** | Σ margin of the employee's clients (senior-only view) | `server/profitability.ts` |
| **Capacity** | `assigned_workload_minutes / available_minutes` | Task 8 model |
| **Risk** | count of overdue + rejected + at-risk clients owned | `Obligation`, `Company.riskLevel` |
| **Discipline** | attendance/lateness | `Attendance` (lateMinutes, absentDays) |

**Composite** = weighted sum. **The critical fix:** the *Volume* input must be **complexity-weighted completed obligations**, not `TimeEntry`. Nobody logs time reliably; obligations are auto-generated and their completion is observable. This makes KPI *and* workload *and* profitability all run on data you actually have.

**Decision to force:** Fair KPI has been sitting in shadow. Pick a date, validate 2 months of shadow scores against reality, then **flip it live and retire KPI v1**. Shadow forever = never shipped.

---

## TASK 7 — Profitability Engine

**Dashboards:**
1. **Client Margin Ranking** — every client sorted *loss-makers first* (already the sort order in `getMarginOverview`). Columns: revenue, effort cost, margin, margin %, debt. Red rows = renegotiate/fire.
2. **Contract Health** — margin trend over 3–6 months per client → flags contracts that decayed (client grew, price didn't).
3. **Employee Contribution** — Σ margin of clients each employee owns → who generates vs. consumes value.
4. **Effort Heatmap** — effort-minutes per client × complexity → which clients consume disproportionate effort for their fee.

**The brutal caveat (must fix first):** the engine is only as good as effort data. **Do not rely on hand-logged `TimeEntry`.** Use a **normative-effort model**: `effort(client) = Σ over its obligations of base_minutes[obligation_type] × complexity_multiplier[company] × regime_multiplier`. Calibrate base minutes once from a sample. Then profitability works *on day one* for every client, and hand-logged time becomes an optional refinement, not a prerequisite. This is the difference between a dashboard that's always populated and one that's always empty.

Answers the CEO's five questions directly: which client makes/loses money (margin ranking), which accountant is overloaded (Task 8), which contract to renegotiate (contract health + margin %), which company consumes too much effort (effort heatmap).

---

## TASK 8 — Workload Engine (measure complexity, not company count)

**Do NOT count companies.** Score complexity:

```
workload_minutes(employee, period) =
    Σ over assigned obligations:
        base_minutes[obligation_type]           // e.g. QQS decl 120, stats 45, payroll 60
      × complexity_multiplier[company]           // simple 0.6 / standard 1.0 / complex 1.6 / enterprise 2.4
      × regime_multiplier[tax_regime]            // VAT 1.3 / turnover 1.0 / fixed/yatt 0.7
  + Σ question/SLA handling minutes               // from Question / Task volume
  + rework_penalty (rejected submissions × redo)  // ObligationSubmission rejects

capacity_pct = workload_minutes / available_minutes(period)
            // available = workdays × 8h × utilization_target (e.g. 0.8)
```

You already have every input: `Obligation` (type + due), `CompanyComplexity` enum, `Company.taxRegime`, `Question`, `ObligationSubmission`. **This engine needs zero new data — only the scoring lib and a UI widget.** Output: the "AKMAL — 83% capacity, 5 active deadlines, 🟡 medium risk" card from the blueprint, but *computed* instead of mocked.

Business value: fair assignment, burnout prevention, and the hiring signal (when the team is structurally >90%, hire — with the data to justify it).

---

## TASK 9 — AI Features (real enterprise AI, not "ChatGPT")

**Today's reality:** a static tax-law chatbot that never reads the database. To make AI *enterprise*, the pattern is **deterministic DB reads + LLM narration** (and, later, tool-calling) — never free-form generation over invented facts.

| Feature | What it reads (deterministic) | LLM's job | Business value | Build order |
|---|---|---|---|---|
| **Monthly Summary** (per client) | obligations filed/late, payment status, margin, risk | Narrate 3 sentences in UZ | Fills Company Workspace AI Summary; zero-effort client status | **1st** (batch, cheap, high value) |
| **Daily Digest** (per role) | today's overdue, at-risk, action-required | Prioritize + phrase | Director/accountant opens one message instead of 10 screens | **2nd** |
| **Risk Analysis** | overdue count, rejected submissions, debt, capacity | Explain *why* a client/employee is at risk + suggested action | Turns data into decisions | **3rd** |
| **CEO Copilot** (interactive) | tool-calls: margin, obligations, workload by name | Answer "how is Artel doing?" from real data | The blueprint's promised feature — finally real | **4th** (needs tool-calling) |
| **Manager Copilot** | team obligations, SLA, approvals | "Who's overloaded? What needs approval?" | Ops leverage | 5th |
| **Accountant Copilot / Daily Planning** | my obligations, SLA clocks, priority | "What should I do first today?" | Front-line productivity | 6th |
| **Client Summary** (portal-facing) | that client's own reports/payments | Plain-language monthly recap | Client retention / perceived value | 7th |

**Principle:** start with **scheduled batch summaries** (cheap, safe, always-on) before interactive chat. Ground everything; forbid invented amounts (your knowledge.ts already forbids this for law — extend the discipline to data). AI is a *multiplier of trustworthy data* — which is why it comes *after* the 1C truth-feed, not before.

---

## TASK 10 — Integrations (never duplicate accounting)

**The golden rule:** ASRO **reads status and stores evidence**. It **never writes to accounting**. Data flows *into* ASRO; accounting stays in 1C.

| Integration | Direction | Data flow | Closes/updates |
|---|---|---|---|
| **1C** | 1C → ASRO (one-way) | Sync-agent reads 1C (OData/HTTP-service) on the firm's LAN → POSTs `IntegrationEvent` (idempotency-keyed) → `applyIntegrationEvent` maps payload → obligation status / doc counts | Report status, document counts, org mapping. **The primary truth feed.** |
| **Didox** | Didox → ASRO | E-invoice/e-doc status polled → matched to company | Auto-closes `didox` obligations; feeds document flow |
| **Soliq** | Soliq → ASRO | Declaration acceptance receipts | **The ONLY thing that closes a tax obligation as `accepted`** (matches your evidence discipline) |
| **Bank** | Bank → ASRO | Payment confirmations | Auto-reconciles client `Payment`; kills manual "did they pay?" |
| **Telegram** | bidirectional | grammY bot: capture signals/questions in; deliver reminders/escalations out | Already built — the capture+delivery surface |
| **SMS / Email** | ASRO → out | Notification channels for clients without Telegram | Reminder redundancy |

**The architecture is already right** — `IntegrationEvent` as an idempotent raw-payload ledger with a DLQ (`SyncError`), `SyncRun` batches, method-agnostic ingest. The **hard, undone 80%** is the *1C-side agent* and the *field mapping*. That's the highest-leverage engineering work in the entire product.

---

## TASK 11 — The $500,000 CEO Test

**If I were investing $500k, I would build the SPINE and nothing else:**

**BUILD FIRST (the spine — ~$300k):**
1. **1C sync pilot on 5 real clients** — the truth feed. Without it, every other number is manual and untrusted. *This is the single most important line item.*
2. **Director Cockpit** — the buyer's daily screen. The reason they'll pay.
3. **Grounded Monthly/Daily AI Summary** — cheap batch AI that makes the cockpit and workspace feel alive.
4. **Unify the "unit of work"** — retire `MonthlyReport`/`Operation`; `Obligation` is the one model.
5. **Ship Fair KPI live** (with the complexity-weighted volume fix) + **normative-effort profitability**.
6. **Security hardening** — encrypt `Company.password`, enforce rate limiting, adopt Prisma migrations.

**POSTPONE (~$150k, phase 2):** interactive AI copilot, workload UI polish, client portal v1, billing automation, Didox/Bank integrations.

**COMPLETELY REJECT (or de-fund):**
- Accounting-grade ledger / period-close / immutable snapshots for the firm's own money → **downgrade to operational cash tracking** (it duplicates 1C).
- Inventory module → freeze.
- Multi-tenant SaaS → **not one dollar** until a single firm is delighted and 3 more are asking to buy.
- CRM → defer until client intake volume demands it.

**Why:** the money doesn't create value by adding modules (you have 55+ models already). It creates value by making the *existing* engine **trustworthy** (1C), **visible** (cockpit), and **intelligent** (grounded AI). One deep, trusted, beloved firm beats ten half-configured ones.

---

## TASK 12 — Roadmaps, Vision, Mission, Moat

### 3-Month Roadmap — "TRUTH + COCKPIT"
- **1C ingest pilot** live on 5 clients (agent + field mapping + sync-health UI).
- **Director Cockpit** shipped (overdue, at-risk, SLA rate, revenue/debt, action queue).
- **Obligation unification** — `MonthlyReport`/`Operation` retired into `Obligation`; `ReportProof → SubmissionEvidence` bridge finished.
- **Fair KPI v2 live** (complexity-weighted volume); retire KPI v1.
- **Normative-effort profitability** — margins populated for *every* client without hand-logged time.
- **Security hardening** — encrypt credentials, enforce rate limiting, Prisma migration baseline, structured logging (pino) + error tracking (Sentry).

### 6-Month Roadmap — "INTELLIGENCE + MARGINS"
- **Grounded AI copilot** (interactive, tool-calling) + scheduled daily/monthly digests.
- **Workload/Capacity engine** live (the "83%" card, computed).
- **Billing automation** — auto-issue invoices from contracts; debt aging.
- **Client Portal v1** — clients see their reports, payment history, documents (not just a ticket form).
- **Didox + Bank integrations** — auto-close obligations, auto-reconcile payments.

### 12-Month Roadmap — "SCALE + MOAT"
- **Multi-firm SaaS** *if validated* — tenant isolation, onboarding, per-firm deadline-template libraries.
- **Soliq integration** — declaration receipts auto-close tax obligations.
- **Predictive risk** — flag clients likely to miss deadlines or churn before it happens.
- **Cross-firm benchmarking** — "your on-time rate vs. peer firms" (the network-effect moat).

### Product Vision
> *Every accounting outsourcing firm in Central Asia runs its operations on ASRO. 1C keeps the books; ASRO runs the business.*

### Mission
> *Make missed deadlines, unbilled work, and unprofitable clients impossible for accounting firms — without ever touching the accounting itself.*

### Competitive Advantage (the moat)
The **localized UZ compliance calendar** (tax/statistics/labor deadlines as versioned, applicability-scoped templates) + **Telegram-native** capture/delivery + **1C-read** integration. SAP/Dynamics/NetSuite/Odoo don't localize this operational layer for Uzbek bookkeeping firms; 1C-ITS handles accounting but not cross-client *operations management*. This specific combination, done deeply, is defensible.

### Unique Selling Proposition
> *The only operations platform built for how Uzbek accounting firms actually work — Telegram-first, 1C-connected, deadline-obsessed. It doesn't replace your 1C; it makes sure nothing your 1C should have done ever gets forgotten.*

---

## ASRO ERP PRODUCT AUDIT REPORT — Scorecard (1–10)

| Dimension | Score | Justification |
|---|---:|---|
| **Product Vision** | **7** | Correct instinct (control tower over 1C), muddied by scope-creep into accounting the firm doesn't need. |
| **Architecture** | **8** | Genuinely sophisticated — DDD bot, idempotent sweeps, versioned templates, ledger. Over-engineered in the wrong places. |
| **UX** | **4** | Role cabinets exist; no director cockpit, workspace is a modal drawer, report matrix is a spreadsheet, write-paths unverified in browser. |
| **Scalability** | **6** | Strong domain model; ops-immature (single-tenant, `db push` not migrations, no PgBouncer/observability). |
| **ERP Completeness** | **5** | Broad surface but as "ERP" it's shallow and partly duplicates 1C; as an *ops platform* ~60%. |
| **Accounting Workflow** | **6** | Proof/obligation/evidence discipline is excellent; but no live 1C = truth is still manual. |
| **CEO Value** | **4** | The buyer's cockpit and grounded AI — the two things that justify the purchase — don't exist yet. Biggest miss vs. the stated goal. |
| **Accountant Value** | **6** | Deadlines, tasks, proofs genuinely help; high manual-entry burden. |
| **Client Value** | **3** | Portal is a bare ticket form; the client sees almost nothing. |
| **SaaS Readiness** | **3** | Single-tenant, no migrations, plaintext creds, rate-limit unenforced, no observability. |
| **Technical Debt** (10 = clean) | **5** | Three KPI systems, triple "unit of work," `db push`, plaintext creds, and a real doc-vs-reality gap. |
| **Competitive Advantage** | **7** | The UZ-compliance-calendar × Telegram × 1C-read combination is a real, defensible moat *if executed*. |
| **OVERALL** | **≈ 5.3** | **Exceptional engineering foundation, aimed slightly off-target; the two things that create buyer value are still unbuilt.** |

---

## The Next 100 Tasks — Prioritized by BUSINESS VALUE (not technical complexity)

> Ordering principle: **Trust → Visibility → Intelligence → Scale.** A task that makes the data trustworthy or the buyer's screen better always outranks a technically interesting task that does neither.

### Tier 1 — TRUTH FEED & FOUNDATION (the spine; do these first)
1. Build the 1C sync-agent (reads 1C on LAN, POSTs `IntegrationEvent`) — pilot on 1 client.
2. Define the 1C→ASRO field mapping (report status, doc counts) in `applyIntegrationEvent`.
3. Auto-close obligations from 1C-sourced accepted status.
4. Sync-health dashboard (last-seen, events processed/failed, DLQ) on the Integrations page.
5. Roll 1C pilot to 5 clients; reconcile against manual entry; measure divergence.
6. Retire `MonthlyReport` 60-column model → obligation instances.
7. Retire `Operation` (annual/quarterly) → obligation instances.
8. Finish `ReportProof → SubmissionEvidence` bridge; deprecate `ReportProof`.
9. Enforce evidence discipline in UI (screenshot ≠ accepted; require external receipt to close).
10. Adopt Prisma migrations (baseline current schema; stop `db push` in prod).
11. Encrypt `Company.login`/`password` via `lib/crypto.ts` (migrate existing rows).
12. Enforce login rate limiting (`lib/rateLimit.ts`) in `authorize()`.
13. Add structured logging (pino) replacing the ~49 `console.*`.
14. Add error tracking (Sentry) with release tagging.
15. Wire Zod validation at every server-action boundary.
16. Replace vulnerable `xlsx@0.18.5` (ReDoS/proto-pollution) with a maintained lib.
17. Verify CSP headers in `next.config.ts` are live in prod.
18. Browser write-path QA pass on all modal/checklist flows (currently only unit-tested).

### Tier 2 — DIRECTOR COCKPIT & WORKSPACE (visibility; the buyer's value)
19. Build **Director Mode** cockpit: overdue obligations count + list.
20. Cockpit: at-risk clients panel (overdue + debt + rejected submissions).
21. Cockpit: firm-wide SLA/on-time rate tile.
22. Cockpit: revenue + net (operational) + outstanding debt tiles.
23. Cockpit: "Action Required" queue (approvals, delay-reason sign-offs).
24. Promote `CompanyDrawer` → full-page **Company Workspace** (routed, deep-linkable).
25. Workspace: Overview 360 passport widget.
26. Workspace: Deadlines tab (this client's obligations).
27. Workspace: Payments tab (invoices, payments, debt, reminders).
28. Workspace: Documents & encrypted credentials vault tab.
29. Workspace: Timeline/activity stream (from audit + status events).
30. Workspace: Assigned employees + effort widget.
31. Workspace: Risks tab (flags + notes).
32. Deadlines Board as a first-class page (calendar + kanban, filters).
33. Portfolio list: filter/sort by risk, regime, department, margin, overdue count.
34. Supervisor cockpit: proof-review + KPI-approval queues surfaced.
35. Chief cockpit: department health + approvals.
36. Accountant cockpit: "my week" (obligations + tasks + SLA clocks).
37. Global notification center: obligation reminders + escalations unified.
38. Mobile-responsive cockpit + workspace (the director checks on phone).

### Tier 3 — INTELLIGENCE FROM TRUSTWORTHY DATA (margins, KPI, AI)
39. Implement normative-effort model (base minutes × complexity × regime).
40. Populate profitability for *every* client from normative effort (no TimeEntry dependency).
41. Client Margin Ranking dashboard (loss-makers first).
42. Contract Health (margin trend over months → renegotiate flags).
43. Employee contribution (Σ margin of owned clients).
44. Effort heatmap (effort per client × complexity).
45. Implement workload scoring lib (Task 8 formula).
46. Workload/Capacity widget per employee ("83%" card, computed).
47. Team capacity view for assignment decisions.
48. Fix Fair KPI volume input → complexity-weighted completed obligations.
49. Validate 2 months of Fair KPI shadow vs. reality.
50. **Ship Fair KPI v2 live**; connect to payroll.
51. Retire KPI v1 (`KpiRule`/`MonthlyPerformance` reward/penalty) — keep one system.
52. Consolidate `KpiEvent` into the unified KPI model.
53. KPI transparency view (component breakdown per employee).
54. Ground the AI layer in Prisma (give it read access).
55. Scheduled **Monthly Summary** per client (batch AI → Workspace AI Summary).
56. Scheduled **Daily Digest** per role (Telegram + in-app).
57. **Risk Analysis** AI (explain *why* at-risk + suggested action).
58. **CEO Copilot** interactive (tool-calling over margin/obligations/workload by name).
59. Manager Copilot (team obligations, SLA, approvals).
60. Accountant Copilot / Daily Planning ("what first today?").
61. Guardrails: forbid AI from inventing amounts; cite the source module.

### Tier 4 — MONEY OPERATIONS (cash, billing, payroll — operational, not accounting)
62. **Decision + downgrade**: strip accounting-grade ledger/period-close for firm's own books → operational cash tracking. *(Confirm firm keeps its own books in 1C first.)*
63. Auto-issue monthly invoices from contract terms.
64. Debt aging report (30/60/90) per client.
65. Auto-reminder escalation tuning (🟡🟠🔴) — verify against real groups.
66. Payroll: obligation (compute) vs payout (paid) reconciliation view.
67. Payroll drafts → approval → payout flow polish.
68. Expense approval routing UI (the 3-tier thresholds) surfaced clearly.
69. Cash position widget (operational, real-time).
70. Bank integration: auto-reconcile client payments.
71. Payment-received → obligation-linked confirmation.

### Tier 5 — CLIENT EXPERIENCE (portal beyond a ticket form)
72. Client Portal: view their own filed reports + status.
73. Client Portal: payment history + outstanding invoices.
74. Client Portal: document exchange (upload/download, e.g. primary docs).
75. Client Portal: monthly plain-language AI recap (Client Summary).
76. Client Portal: request/ticket flow improvements + notifications.
77. Client Portal: harden auth isolation + audit (per the reviewer note).
78. Client onboarding flow (from signed contract → workspace populated).

### Tier 6 — INTEGRATIONS DEPTH
79. Didox integration: e-invoice status → auto-close `didox` obligations.
80. Didox: document ingestion into document flow.
81. Soliq integration: declaration acceptance receipts (the accepted-source).
82. SMS channel for clients without Telegram.
83. Email channel for reminders/digests.
84. Integration retry/DLQ operator tooling (`SyncError` triage UI).
85. E-jurnal/attendance real API adapter (currently scaffolded).

### Tier 7 — SCALE, SAAS, MOAT (only after a single firm is delighted)
86. Multi-tenant data isolation design + spike.
87. Per-firm deadline-template libraries.
88. Firm onboarding/self-serve setup.
89. PgBouncer + connection pooling.
90. Read-replica for analytics/dashboards.
91. Background-job observability (BullMQ dashboard, alerting).
92. Predictive risk model (likely-to-miss / likely-to-churn).
93. Cross-firm benchmarking (on-time rate vs. peers).
94. Usage analytics + product telemetry.
95. Role/RBAC self-service admin polish.
96. Audit-log search + export for compliance.
97. Data retention & backup policy (automated, tested restores).
98. Performance budget + load testing at 10× clients.
99. CRM/lead pipeline (when intake volume demands).
100. Public API for firms to integrate their own tools.

---

### Closing note from your CPO
You have built something most teams never reach: a **deep, correct, well-tested engine**. The risk isn't capability — it's *aim*. You've been rewarded (by tests passing and features shipping) for building *more*, when the value is now entirely in building the **three things that make the engine trusted, visible, and intelligent**: the 1C truth feed, the director cockpit, and grounded AI. Stop adding modules. Make the ones you have earn the buyer's morning attention. Everything in Tier 1–3 above serves that; almost nothing below Tier 4 does yet.
