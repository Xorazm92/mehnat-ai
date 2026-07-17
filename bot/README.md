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
| `GEMINI_API_KEY` | for AI | — | Gemini question classifier; empty ⇒ heuristic-only detection |
| `GEMINI_MODEL` | no | `gemini-2.5-flash` | Gemini model id |

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

## Commands (Phase B)

| Command | Who | Effect |
|---|---|---|
| `/whoami` | anyone | reports the caller's linked employee + role |
| `/bind <INN\|companyId>` | admin | binds the current group chat to a company (`TelegramGroup`) |
| `/link <email\|PINFL>` | admin | **reply** to a user's message to link their Telegram account to that employee |
| `/kpi_award <email\|PINFL> <percent> [reason]` | admin | records a manual KPI bonus to the ledger (+audit) |
| `/kpi_penalty <email\|PINFL> <percent> [reason]` | admin | records a manual KPI penalty to the ledger (+audit) |
| `/help` | anyone | lists commands |

Admin = the `TELEGRAM_ADMIN_TELEGRAM_ID` bootstrap account, or a linked user whose mehnat-ai
role is `super_admin`/`admin`. Every `/bind` and `/link` writes an `AuditLog` row.

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

**Phase F (billing detection) — done & verified:** [bot/contexts/billing/](contexts/billing/) —
`assessDebt` (pure: level 🟡🟠🔴 + amount from `Payment`/`Company.contractAmount`/`paymentDay`),
`detectPeriodDebts` (unpaid active companies for a period), `recordPaymentReminder` (idempotent per
company+period+level via `@@unique` — no spam). Escalation days default to orange +3 / red +7.

**Still needed from you (business rules, §18.6/18.7) to finish sending:** confirm escalation days,
the 🟡🟠🔴 message templates, and who receives the 🔴 (group only, or also the responsible
accountant in-app). Once set: wire the daily cron → `TelegramGroup` lookup → `sendMessage`, gated by
`recordPaymentReminder`.

> After `prisma generate`, restart any running `next dev` or it 500s with
> "Unknown field …" on the new columns (stale client in the server process).
