# `bot/` — Telegram KPI bot (integrated into mehnat-ai)

The KPI Telegram bot is **not a separate service**. It lives in this repo and
shares one Prisma/Postgres with the Next.js app. The bot is a *signal source* +
*ledger* + *Telegram I/O* on top of the KPI engine that already exists here
(`KpiRule`, `CompanyKpiRule`, `MonthlyPerformance`, `PayrollAdjustment`,
`Payment`, `Notification`, `AuditLog`, `Attendance`).

Full design: [`KPI_BOT_BLUEPRINT.md`](../KPI_BOT_BLUEPRINT.md).
Regulament/roadmap: the platform doc pasted into the tracking issue.

---

## Two processes, one source of truth

```
Telegram ──webhook──▶ app/api/telegram/webhook   (Next.js route: verify secret → enqueue → 200, <50ms)
                              │
                              ▼
                        Redis (BullMQ queues)
                              │
                              ▼
                   bot/main.ts  (long-running: BullMQ workers + grammY sender + cron)
                              │  domain layer — no Prisma/BullMQ/Telegram imports
                              ▼
                    Prisma 7 ──▶ Postgres  (KpiEvent ledger → MonthlyPerformance projection)
                              ▲
                              │
                    app/  (Next.js UI) reads results — never mutated by the read path (CQRS)
```

- **Next.js app** owns the HTTPS webhook (thin: verify → enqueue → 200). No business logic.
- **`bot/` process** owns all the work: BullMQ workers, Telegram sending, cron.
- Shared: `lib/prisma.ts`, one Postgres, one Redis, one `prisma/schema.prisma`.

---

## DDD layer rule (non-negotiable)

Each bounded context is split into four layers:

| Layer | May import | Contains |
|---|---|---|
| `domain/` | nothing framework-specific | entities, value objects, domain events, pure rules — **DB-free unit tests live here** |
| `application/` | domain + ports | use-cases / command handlers, transaction orchestration |
| `infrastructure/` | anything | Prisma repos, Claude adapter, Telegram gateway, BullMQ producers |
| `interface/` | application | BullMQ workers, cron jobs, grammY handlers (anti-corruption layer) |

A Telegram handler never computes KPI. It validates the update → turns it into a
command → persists → enqueues. Everything else runs in workers.

---

## Layout

```
bot/
├── README.md
├── shared/                         # cross-context kernel (framework-free)
│   ├── domain/
│   │   ├── domain-event.ts         # DomainEvent base class
│   │   └── value-objects/          # Percentage, PeriodMonth, WorkingHours, ResponseWindow (+ .spec.ts)
│   ├── events/domain-event-bus.ts  # in-process pub/sub (plain TS, no NestJS)
│   └── index.ts
├── contexts/                       # (added per phase) identity, monitoring, attendance,
│   │                               #  reports, kpi, notifications, billing, ai
├── queues/                         # (Phase A) BullMQ queue + worker registry
├── telegram/                       # (Phase A) grammY instance, update parsing, sending
├── cron/                           # (Phase B+) deadline sweep, rollup, escalation, reminders
└── main.ts                         # (Phase A) entry: starts workers + bot + cron
```

Contexts are created when their phase lands — no empty placeholder folders.

---

## Resolved architecture decisions

These close the open questions in `KPI_BOT_BLUEPRINT.md` §18. Flag any you disagree with.

- **D1 — Framework:** plain-TS DDD layers, **not NestJS**. The bot runs as a
  `tsx bot/main.ts` process next to Next.js; BullMQ is the real backbone, and the
  repo's `tsconfig.json` has no `experimentalDecorators`/`emitDecoratorMetadata`
  (enabling them repo-wide could disturb the Next.js build). DI is not worth that risk.
- **D2 — ORM:** Prisma 7 (the repo's ORM), not TypeORM. The `KPI_bot-main/`
  TypeORM app is legacy reference only; its 4 framework-free value objects were ported here.
- **D4 — Webhook location:** Next.js `app/api/telegram/webhook` (already an HTTPS surface).
- **Idempotency:** every Telegram `update_id` is recorded once in `ProcessedUpdate`;
  `TelegramMessage` has no `(chatId, messageId)` unique so edits/reactions append as history.

Still open (not blocking the foundation): report reconciliation (§18.2 — leaning a
small `ReportDeadline` tied to existing `ReportProof`, Phase G), STT provider
(§18.3, Phase H), deploy target (§18.5, Phase J). **Needs your business rules
before Phase F2 (billing):** payment-reminder escalation days + message templates
(§18.6) and who receives the 🔴 reminder (§18.7).

---

## Environment

Add to `.env.local` (the bot process loads `.env` + `.env.local` via `bot/env.ts`):

| Var | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | — | Postgres (shared with Next.js) |
| `REDIS_URL` | no | `redis://127.0.0.1:6379` | BullMQ queues |
| `TELEGRAM_BOT_TOKEN` | for I/O | — | @BotFather token; empty ⇒ sending/polling disabled |
| `TELEGRAM_WEBHOOK_SECRET` | for webhook | — | echoed in `X-Telegram-Bot-Api-Secret-Token`; empty ⇒ webhook returns 503 |
| `TELEGRAM_ADMIN_TELEGRAM_ID` | no | — | bootstrap super-admin Telegram id (can run `/bind`, `/link` before anyone is linked) |
| `BOT_MODE` | no | `webhook` | `polling` for local dev (no public URL needed) |
| `MINI_APP_URL` | for Mini App | `AUTH_URL` → `NEXT_PUBLIC_SITE_URL` | public **https** origin for `web_app` buttons; non-https ⇒ the buttons are not rendered |
| `GEMINI_API_KEY` | for AI | — | Gemini question classifier; empty ⇒ heuristic-only detection |
| `GEMINI_MODEL` | no | `gemini-2.5-flash` | Gemini model id |
| `BILLING_ENABLED` | no | `true` | set `false` to disable the daily payment-reminder cron |
| `BILLING_CRON_HOUR` | no | `9` | hour of day (0-23, local) the reminder run fires |

## Running

```bash
npm run dev        # Next.js UI + webhook route
npm run bot:dev    # bot worker process (tsx watch bot/main.ts)
```

- **Prod (webhook):** set `BOT_MODE=webhook`, register the webhook with your bot token +
  secret pointing at `https://<host>/api/telegram/webhook`, run `npm run bot:start` under PM2.
- **Local (polling):** set `BOT_MODE=polling` + `TELEGRAM_BOT_TOKEN`; `bot:dev` long-polls and
  enqueues to the same `message` queue the webhook uses — identical worker path, no tunnel.

> **Telegram privacy mode:** for the bot to capture *all* group messages (not just commands and
> replies to itself), disable privacy via @BotFather → `/setprivacy` → Disable, **or** make the
> bot a group admin. Required for KPI monitoring.

## Interaction surface

The bot is **button-driven**. Only three commands are registered with BotFather
(`scripts/set-telegram-webhook.ts`); everything else is an inline button.

| Command | Who | Effect |
|---|---|---|
| `/start` | anyone | private + unlinked → `request_contact` button (one-tap linking); private + linked → main menu; in a group → points at the private chat |
| `/menu` | linked | the main menu (same as `/start`) |
| `/help` | anyone | short orientation |

**Hidden aliases**, still dispatchable for one release so nobody mid-habit is stranded, but
absent from the menu: `/whoami`, `/stats`, `/link_me <email|PINFL>`, `/bind <INN|companyId>`,
`/link <email|PINFL>` (admin, by reply), `/kpi_award`, `/kpi_penalty` (admin).

### Buttons

| Flow | How it starts | Handler |
|---|---|---|
| **One-tap linking** | `/start` → 📱 Raqamni yuborish → Telegram sends a `contact` | `identity/application/link-by-phone.ts` — matches `User.phoneNormalized` (last 9 digits, `lib/phone.ts`). Refuses a forwarded third-party card, an ambiguous number, or a record already linked elsewhere. |
| **Smart bind** | bot added to a group (`my_chat_member`) | `identity/application/bind-suggest.ts` — registers the chat as unbound, then DMs the **admin who added it** a paginated picker of companies without a live group. |
| **Menu** | `/start` when linked | `interaction/application/menu.ts` — 📅 Bugun / 📋 Vazifalarim / 📊 KPI ballarim, plus 🏢 Portfelim for senior roles. |
| **Morning plan** | pushed at 08:50 Asia/Tashkent | `lib/dailyDigest.ts` + `bot/contexts/digest/`. |

`callback_data` is **signed and stateless** (`interaction/domain/callback-token.ts`):
`<hmac8>:<action>:<id>`, under Telegram's 64-byte cap thanks to base36/base64url id packing.
The signature only proves the button is ours — **every press re-resolves the presser to a
`User` and re-checks their role**, and every effect is idempotent, because a stateless token
can always be replayed by pressing the same button twice.

Admin = the `TELEGRAM_ADMIN_TELEGRAM_ID` bootstrap account, or a linked user whose mehnat-ai
role is `super_admin`/`admin`. Every bind/link writes an `AuditLog` row.

> **The bot cannot open a private chat.** Writing to a staffer who never pressed Start fails
> with 403. `trySendMessage`/`deliver` (`bot/telegram/`) report that as `no_private_chat` so
> callers fall back to an in-app `Notification` instead of retrying.

## Escalation ladder (ADR-0007)

Missed deadlines walk **L0 responsible → L1 Supervisor → L2 Chief Accountant**, all in private
chats. There is no director rung, and the client's group never sees an internal reminder.

| | Question | Obligation |
|---|---|---|
| **L0** | at the deadline (10 min accountant / 5 min bank-client) | `D-5`, `D-3`, `D-1` DM |
| **L1** Supervisor | the moment it is marked `late` | the due date |
| **L2** Chief | 30 min later (`QUESTION_L2_AFTER_MINUTES`) | the day after |

Core: `lib/escalation.ts` (`resolveChain`, `escalate`, `sweepQuestionEscalations`) — framework-free,
takes `db` first, and reaches Telegram only through an injected `EscalationSender`
(`bot/contexts/escalation/interface/escalation-sender.ts`). Obligations escalate from inside
`lib/obligationSweep.ts`; questions from the `notify` queue.

**Idempotency, no new table:** each rung claims one `NotificationDelivery` row keyed
`<kind>:<id>:esc:L<n>` on channel `escalation`, written before any send. The claim is checked with a
single indexed read *before* resolving the chain, and `sweepDeadlines` batch-preloads existing
claims — an hourly sweep over thousands of open obligations must not cost five queries apiece.

**Verdict buttons** (`bot/contexts/escalation/application/`): `🔴 Jarima −5%` / `🟡 Ogohlantirish` /
`🟢 Sababli` on a question, `🟢 Sababli` / `🙋 O'zim bajaraman` on an obligation. The three question
verdicts share one `<kind>:<id>:verdict` claim, so the first press settles it.

A penalty appends a `KpiEvent` and notifies the Chief to confirm in the ERP. It **never** writes
`MonthlyPerformance` — per ADR-0001 only an `approved` row pays, and a Telegram button is the wrong
instrument for an irreversible deduction.

## Morning digest

At **08:50 Asia/Tashkent** every linked staffer who has something on gets a plan for the day:
overdue obligations first, then what is due today, then counters (unanswered client questions; for
seniors also the KPI approval queue and clients who have not paid this period).

`lib/dailyDigest.ts` gathers the data and owns the fan-out; `bot/contexts/digest/` renders the text
and keyboard. The same `buildDigest` backs the on-demand **📅 Bugun** button — which deliberately
does *not* claim the daily slot, so checking during the day never suppresses tomorrow's push.

- **An empty digest is not sent.** A daily "nothing to do" trains people to ignore the bot, and the
  real alerts go unread with it.
- **Once per person per day**: `NotificationDelivery` keyed `digest:<userId>:<YYYY-MM-DD>`, claimed
  before sending, so a worker retry cannot double-post.
- Only users with a linked `telegramUserId` are recipients — there is no point failing with 403
  every morning for someone who never pressed Start.

## Telegram Mini App

Two screens, opened from the menu's `web_app` buttons: **📄 Dalil yuklash**
(`/telegram-app/proof`) and **📊 Dashboard** (`/telegram-app/dashboard`). Requires an HTTPS origin —
`MINI_APP_URL` (or `AUTH_URL` / `NEXT_PUBLIC_SITE_URL`); on a plain-HTTP local run the buttons are
not rendered at all, because Telegram would reject them.

**No new auth surface.** `/telegram-app` is a public handshake page that hands Telegram's `initData`
to a second next-auth CredentialsProvider (`id: "telegram"`). `lib/telegramInitData.ts` verifies the
HMAC against the bot token and rejects anything older than 15 minutes; the provider then requires an
already-linked, active `User.telegramUserId` — the Mini App never creates an account. From there the
screens are ordinary RSC pages: `auth()`, server actions and `proxy.ts` RBAC all work unchanged, and
`/telegram-app/proof` maps to the `reports` view, `/telegram-app/dashboard` to `dashboard`.

The proof screen reuses `compressImageFile` + `saveReportProof` verbatim, so an upload from Telegram
lands in the same `ReportProof` row, triggers the same `syncProofToObligation` bridge and is reviewed
by the same senior flow as one from the web matrix.

## Client payment receipts

The daily payment reminder in a client group now carries **📄 Kvitansiya yuborish**. Pressing it is
one of the few callbacks that does *not* require a linked user — the presser is the client, who has
no ASRO account. It only arms a 30-minute window on a chat already bound to a company (Redis key
`asro:receipt-expect:<chatId>`, `GETDEL` on use).

A photo posted inside that window is forwarded to the responsible accountant's private chat by
`file_id` — nothing is downloaded or stored — with an in-app `Notification` as the channel of record.

**The confirm button is a link, not a write.** Recording a payment posts double-entry ledger rows
against a period lock and needs the real amount; a button can only guess it. So the bot delivers the
receipt and drops the accountant on `/kassa?company=…&period=…`, where `upsertPayment` applies the
existing rules. `test/bot-receipt.test.ts` asserts no `Payment` row is ever created by this path.

### Queues

`message` · `question` · `obligation` · `integration` · `kpi` · **`notify`**

`notify` carries the outbound fan-out (escalation sweeps, morning digests) and is the only worker
with a rate limiter — `{ max: 25, duration: 1000 }`, under Telegram's ~30/s ceiling. Its Redis
schedulers: escalation sweep every 5 minutes, digest at `50 8 * * *`. The minute-by-minute question
expiry cron also enqueues an escalation sweep immediately, so a Supervisor hears about an SLA breach
while it still matters.

## Status & how to verify

**Phase A (foundation) — done & verified:**
- Domain kernel ported; unit tests green (`npx vitest run bot/`).
- Prisma models added (`TelegramGroup`, `ProcessedUpdate`, `TelegramMessage`, `Question`,
  `Answer`, `KpiEvent`, `NotificationDelivery`, `PaymentReminder`) + `User.telegram*`,
  `Company` relations, `Attendance.source/lateMinutes`; pushed to the dev DB.

**Phase A (infra) — done & verified:**
- `bullmq` + `ioredis` + `grammy` installed; `bot/queues` (`message` queue), thin
  `app/api/telegram/webhook` route (secret → enqueue → 200), `bot/main.ts` (workers +
  polling ingress), and the Monitoring **Message worker** (dedup via `ProcessedUpdate`,
  atomic capture into `TelegramMessage`).
- **Verified end-to-end:** `npx vitest run bot/` (31 tests: value objects + `parseInboundMessage`),
  plus a Redis→worker→Postgres round-trip and DB-level idempotency (dedup writes exactly one row).
- Type-clean (`tsc --noEmit` reports nothing under `bot/` or the route).

**Phase B (identity) — done & verified:**
- Telegram↔employee linking (`/link` by reply) and chat↔company binding (`/bind`), authorized via
  the `TELEGRAM_ADMIN_TELEGRAM_ID` bootstrap or an admin-role linked user; every bind/link audited.
- Captured messages enriched with the resolved `userId`; `/whoami` reports the linked profile.
- Verified: 43 unit + integration tests, plus a Redis→worker round-trip driving a real `/bind`
  end-to-end. Live bot: **@kpinazoratbot**.

**Phase C (Question Engine) — done & verified:**
- Cheap `looksLikeQuestion` gate → the `message` worker fans out to the `question` queue → the
  Question worker classifies (**Gemini** via `@google/genai`, heuristic fallback) and opens a
  `Question` with a `ResponseWindow × WorkingHours` deadline.
- Reply-based answering closes the question; a 1-minute cron sweep marks overdue pending
  questions `late` (indexed, restart-safe — no per-chat walk).
- Verified: 76 tests (incl. Postgres open/answer/expire/idempotency) + a full two-queue worker
  round-trip. Set `GEMINI_API_KEY` to switch from heuristic to Gemini.

**Attendance — via e-jurnal, NOT the bot.** Attendance comes from e-jurnal (ejurnal.uz face
scanner) on the Next.js side: [`server/ejurnal.ts`](../server/ejurnal.ts) syncs into `Attendance`
(`source='ejurnal'`, computed `lateMinutes`), [`lib/attendance.ts`](../lib/attendance.ts) holds the
08:30/09:00 thresholds + monthly aggregation, and `deriveAttendanceKpi(employeeId, month)` derives
the `earlyDays/lateMinutes/absentDays` KPI counters. The bot has **no** attendance context or queue.

**Phase E (KPI ledger) — done & verified:**
- `KpiEvent` append-only ledger ([bot/contexts/kpi/](contexts/kpi/)): `appendKpiEvent` (idempotent per
  employee+sourceRef+type), attribution (`resolveResponsibleUserId`: company+role → employee).
- Question outcomes emit events: on-time answer `+1`, late/expired `−1` (`response`), wired into the
  Question worker (answer) and cron (expiry). Manual `/kpi_award` `/kpi_penalty` → `manual` events + audit.
- `rollupLedger` read-model (pure, tested). Verified: 97 tests incl. Postgres append idempotency,
  question→event attribution, and manual adjustment with audit.
- **Payroll projection (approval-gated) — done & verified:** `projectResponseKpiToPerformance(month)`
  (senior-only, [server/botKpiProjection.ts](../server/botKpiProjection.ts)) rolls response events up
  into a `submitted` `MonthlyPerformance` row per (employee, company) via the `*_group_response` select
  rule (0 late → green, 1–2 → yellow, ≥3 → red). It upserts on the unique tuple (no ADR-0004
  duplicates) and **never overwrites an `approved` row** — the supervisor still approves before salary
  is affected.

**Phase F (billing notifications) — done & verified:** [bot/contexts/billing/](contexts/billing/)
- `assessDebt` (pure: level 🟡🟠🔴 + amount from `Payment`/`Company.contractAmount`/`paymentDay`),
  `detectPeriodDebts`, `buildReminderMessage` (pure templates), and the `runBillingReminders` pipeline.
- **Escalation:** 🟡 on the due day, 🟠 +3 days, 🔴 +7 days.
- **Routing:** 🟡🟠 → Telegram group; 🔴 → group **+** in-app `Notification` (responsible accountant +
  every active director).
- **Idempotent & retry-safe:** a `PaymentReminder` is reserved per (company, period, level) before
  sending; an already-`sent` row is skipped and red in-app notifications are keyed on (user, link) —
  so re-running the cron never double-sends or double-notifies. A send failure marks the row `failed`
  (surfaced, not silently retried into a duplicate).
- **Cron:** daily at `BILLING_CRON_HOUR` (default 09:00), restart-safe. Injected sender → the pipeline
  is unit-testable without real Telegram.

> After `prisma generate`, restart any running `next dev` or it 500s with
> "Unknown field …" on the new columns (stale client in the server process).
