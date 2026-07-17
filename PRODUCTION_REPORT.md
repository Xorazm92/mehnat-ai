# ASRO — Production Readiness Audit

**Date:** 2026-07-17 · **Branch:** `nextjs-v2` · **Auditor:** Senior architecture review (automated)
**Stack:** Next.js 16.2.7 (App Router + Server Actions) · Prisma 7 + PostgreSQL · next-auth v5 · BullMQ + Redis · grammY (Telegram bot) · React 19 · Tailwind v4

---

## 1. Executive summary

ASRO is a **well-engineered** accounting-firm ERP. The core is genuinely strong: a clean,
well-indexed database schema; consistent server-side authorization on **every** Server Action;
bcrypt (cost 12) with hashes never leaving the DB; AES-256-GCM for client credentials; a proper
caching layer; an idempotent, gracefully-shutdown Telegram bot; and a green test suite
(123 tests) with clean typecheck and lint.

The gaps are in **production hardening / operability**, not core correctness: there was no CI/CD,
no containerization, no HTTP security headers, no rate limiting, no migration history, no
monitoring, and one plaintext-credential field. This audit **fixed the safe subset automatically**
and documents the rest.

### Overall production readiness score

| | Score |
|---|---|
| **Before this audit** | **68 / 100** |
| **After automated fixes** | **78 / 100** |
| **Reachable after the manual checklist (§7)** | **~92 / 100** |

### Scorecard by area

| Area | Grade | Notes |
|---|---|---|
| Database schema & modelling | A | Indexes, unique constraints, cascade rules, thoughtful ADR-backed comments |
| Authentication | A− | next-auth v5, bcrypt-12, generic errors, open-redirect guard; no MFA/rate-limit |
| Authorization (RBAC) | A | Data-layer `auth()` in every action + `proxy.ts` navigation gate |
| Input validation | C | zod schemas exist but are **unused**; actions hand-coerce with `String()`/`Number()` |
| Secrets management | B− | `.env` gitignored, AES-GCM for credentials; **one plaintext credential field** |
| HTTP security headers | B (was F) | **Fixed** — added HSTS/X-Frame/nosniff/Referrer/Permissions; CSP still manual |
| Rate limiting | F | Constants defined, **never enforced** — login brute-force possible |
| Performance & caching | A− | `unstable_cache` + `React.cache` + tag revalidation; no obvious N+1 |
| Scalability | B+ | Stateless app + Redis/BullMQ workers; JWT sessions; bot cleanly separable |
| Logging & monitoring | D | `console.*` only; no Sentry/OTel/structured logs |
| Docker | B (was F) | **Fixed** — Dockerfile + compose scaffolding added (needs build verification) |
| CI/CD | B (was F) | **Fixed** — GitHub Actions workflow added (typecheck/lint/domain tests) |
| Env var hygiene | A− (was C) | **Fixed** — `.env.example` + Node pin added |
| Tests | B | 123 passing incl. integration; but integration needs a live seeded DB, no CI DB job |
| DB migrations | D | **No migration history** — `db push` workflow; risky for production change management |

---

## 2. What was fixed automatically (this audit)

All changes verified: `typecheck` ✅ (exit 0), `lint` ✅ (0 errors), `test` ✅ (123 passing).

| # | Fix | File(s) | Type |
|---|---|---|---|
| 1 | **HTTP security headers** — HSTS, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `X-DNS-Prefetch-Control`. Recommended CSP documented inline. | `next.config.ts` | Security |
| 2 | **Password floor 6 → 8 chars** (aligns with `CONFIG.PASSWORD.MIN_LENGTH`). All 3 checks (create / change / admin-reset). | `server/users.ts` | Security |
| 3 | **`createAuditLog` now requires an authenticated caller** — prevents anonymous audit-trail poisoning (was `session?.` optional). | `server/audit.ts` | Security |
| 4 | **Health/readiness probe** at `GET /api/health` — 200 when app+DB healthy, 503 on DB failure. | `app/api/health/route.ts` | Ops |
| 5 | **`.env.example`** — full documented template of all 19 env vars (no secrets). | `.env.example` | Ops |
| 6 | **Node version pin** — `.nvmrc` (24) + `engines: node >=20.9.0`. | `.nvmrc`, `package.json` | Ops |
| 7 | **CI pipeline** — GitHub Actions: typecheck + lint + DB-free domain tests; commented integration-test job template. | `.github/workflows/ci.yml` | CI/CD |
| 8 | **Docker scaffolding** — multi-stage `Dockerfile` (web + bot), `docker-compose.yml` (Postgres + Redis + web + bot), `.dockerignore`. | `Dockerfile`, `docker-compose.yml`, `.dockerignore` | Deploy |
| 9 | **Real README** — replaced default create-next-app boilerplate with accurate setup/architecture docs. | `README.md` | Docs |

> The Dockerfile/compose are **scaffolding**: they follow standard Next.js/Prisma conventions but
> were **not** built in this environment. Run `docker compose build` to verify before relying on them.

---

## 3. Issues found (by severity)

### 🔴 Critical
*None.* No SQL injection (Prisma parameterizes; scripts use tagged templates), no XSS sink
(`dangerouslySetInnerHTML` not used; React auto-escapes), no unauthenticated data actions, no
committed secrets, and Next.js 16.2.7 is past the CVE-2025-29927 middleware-bypass patch.

### 🟠 High

| Issue | Detail | Status |
|---|---|---|
| **Plaintext client credentials** | `Company.login` / `Company.password` are stored as plaintext (`server/companies.ts:141`), while the parallel `ClientCredential` model correctly uses AES-256-GCM (`lib/crypto.ts`). Portal passwords for client firms sit in the clear. | **Manual** — encrypt with `encryptSecret()` + data migration, or drop the field in favour of `ClientCredential`. |
| **No login rate limiting** | `CONFIG.RATE_LIMIT` (5 attempts / 15 min) is defined but **never enforced**. The credentials provider allows unlimited password attempts → brute-force / credential-stuffing risk. | **Manual** — add an IP+email limiter (Redis is already available via `ioredis`) in the `authorize()` path. |
| **No DB migration history** | Only `prisma/schema.prisma` exists; the workflow is `prisma db push`. Production schema changes are unversioned and non-reviewable, with no rollback path. | **Manual** — adopt `prisma migrate` and baseline the current schema. |

### 🟡 Medium

| Issue | Detail | Status |
|---|---|---|
| **Validation layer is dead code** | `lib/validation.ts` (zod schemas) and `lib/sanitize.ts` (DOMPurify) are imported **nowhere**. Server Actions coerce inputs by hand (`String()`, `Number()`, `Boolean()`) with no bounds/format checks (e.g. INN format, max lengths, non-negative amounts). Not an injection risk (Prisma is parameterized) but a data-integrity and robustness gap. | **Manual** — wire zod `.parse()` into action entrypoints, starting with money/identity fields. |
| **No monitoring / error tracking** | No Sentry/OpenTelemetry/structured logging. `CONFIG.FEATURES.ENABLE_ERROR_TRACKING`/`ENABLE_PERFORMANCE_MONITORING` are decorative. Production incidents are invisible. | **Manual** — add Sentry (or OTel) + a structured logger (pino). |
| **`console.*` logging** | 49 `console.*` calls; no log levels, no correlation ids, no redaction. | **Manual** — replace with a leveled logger. |
| **`xlsx` (SheetJS) high CVEs** | 0.18.5 has prototype-pollution + ReDoS advisories with **no npm fix**. **Mitigating factor:** the app only *writes* exports from its own data (`lib/exportExcel.ts`, `XLSX.writeFile`) — it never *parses* untrusted spreadsheets, which is the exploit path. Practical risk is low today. | **Manual** — migrate to the patched SheetJS CDN build or `exceljs` to clear the advisory. |
| **No global error boundary route** | No `app/global-error.tsx` / root `error.tsx` (there is a component `ErrorBoundary`, used only in the dashboard layout). Unhandled render errors in other segments fall back to the default. | **Manual** — add `global-error.tsx`. |

### 🔵 Low

| Issue | Detail | Status |
|---|---|---|
| Weak default password `Password123!` | Fallback when an admin creates a user without a password (`lib/admin/system-settings-config.ts`, `AdminUsersClient.tsx:41`). Admin-controlled but predictable. | **Manual** — generate a random temp password + force reset on first login. |
| `postcss < 8.5.10` moderate CVE | Transitive via Next; **build-time only** (processes your own CSS), not a runtime vector. `audit fix --force` would downgrade Next — do not. | **Manual** — resolves on a future Next patch bump. |
| `dompurify` moderate CVE | Safe patch available, but the lib is only referenced by the (unused) `lib/sanitize.ts`. | **Manual** — `npm audit fix` (non-breaking) or remove the dead module. |
| `createNotification` caller trust | Requires *a* session but accepts an arbitrary `userId`, so any user can create a notification for anyone. | **Manual** — restrict to senior roles or self. |
| README/DB `TELEGRAM_BOT_NAME` unused in code | Present in `.env` but not read via `process.env`. | Informational. |
| 130 ESLint warnings | Intentional `any`/react-hooks debt, downgraded to warnings. Non-blocking. | Informational — burn down incrementally. |

---

## 4. Security risks (consolidated)

1. **Brute-force on login** (High) — no rate limiting. *Highest-priority manual item.*
2. **Plaintext client-portal passwords** (High) — encrypt or remove `Company.password`.
3. **No CSP** (Medium) — safe headers now shipped; CSP left off to avoid breaking base64-image
   rendering + inline styles. A tested policy is documented in `next.config.ts`.
4. **No audit of privileged mutations** — audit logging exists (`AuditLog` + `createAuditLog`) but
   is wired into **only one** action (payroll approval). Sensitive operations (user role changes,
   password resets, company edits, expense approvals) are **not** audited.
5. **`xlsx` advisory** (Medium, low practical risk) — write-only usage; no untrusted parsing.
6. **JWT session strategy** — fine, but rotation/short TTL and a secret-rotation plan are not
   documented; `AUTH_SECRET` is 38 chars (adequate).

**Verified NOT at risk:** SQL injection (parameterized), stored XSS (no HTML sinks, React
escaping), secret leakage in git (`.env*` gitignored, nothing tracked), password hash exposure
(`SAFE_USER_SELECT` projection), open redirect on login (internal-path guard).

---

## 5. Performance & scalability

**Strengths (no change needed):**
- **Caching layer** (`lib/cached-queries.ts`): `unstable_cache` (5-min TTL, tag-based
  revalidation) composed with `React.cache` for per-render dedup, split by role to avoid
  over-fetching. Notifications use a tighter 60s TTL. This is textbook.
- **DB indexes** on every hot query path (foreign keys, `period`, `status`, composite
  `[status, deadlineAt]` for the bot's deadline sweep, `[chatId, createdAt]` for message history).
- **Aggregations** use `groupBy`/`count` in parallel via `Promise.all` rather than fetch-and-count.
- **No N+1**: the only in-loop awaits are in `create/updateCompany`, over small (≤4) assignment
  arrays inside a single `$transaction` — negligible.
- **Bot**: dedicated Redis connection per queue/worker (BullMQ best practice), idempotency ledger
  (`ProcessedUpdate`), `@@unique` reminder trail (restart-safe, no spam), graceful SIGINT/SIGTERM.

**Improvements to consider (manual):**
- The senior-role company/report caches load **all** rows with no pagination — fine at hundreds of
  firms, revisit at tens of thousands (add cursor pagination; `CONFIG.PAGINATION` already defines limits).
- Add DB connection-pool sizing to `DATABASE_URL` for multi-instance deploys (pgBouncer or
  `?connection_limit=`), since each app instance opens its own `pg` Pool.

---

## 6. Deployment checklist

**Environment**
- [ ] Copy `.env.example` → set `DATABASE_URL`, `AUTH_SECRET` (`openssl rand -base64 32`), `AUTH_URL`/`NEXTAUTH_URL`, `NEXT_PUBLIC_SITE_URL`.
- [ ] Set a dedicated `CREDENTIALS_SECRET` (don't reuse `AUTH_SECRET`).
- [ ] Bot: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (required — webhook 503s without it), `REDIS_URL`, optionally `GEMINI_API_KEY`.
- [ ] Confirm `NODE_ENV=production` (enables the singleton Prisma path + error-only logging).

**Database**
- [ ] Adopt `prisma migrate` and baseline current schema (replace `db push` for prod). **[High]**
- [ ] Provision managed Postgres with backups + PITR; set connection pooling.
- [ ] Run the admin bootstrap: `ADMIN_EMAIL=… ADMIN_PASSWORD=… npx tsx scripts/create-admin.ts` (≥8 chars).

**Security**
- [ ] Add login rate limiting. **[High]**
- [ ] Encrypt/remove `Company.password`. **[High]**
- [ ] Enable the documented CSP after E2E verification.
- [ ] Terminate TLS at the proxy (HSTS header is already emitted).
- [ ] Extend audit logging to user/role/expense/company mutations.

**Observability**
- [ ] Add Sentry (or OTel) + structured logger.
- [ ] Wire the load balancer / uptime monitor to `GET /api/health`.

**CI/CD & containers**
- [ ] CI added (`.github/workflows/ci.yml`) — enable branch protection requiring it.
- [ ] `docker compose build` to verify the image; then `prisma db push`/`migrate deploy` on release.
- [ ] Enable the commented integration-test CI job once seeding is CI-idempotent.

**Runtime**
- [ ] Run the bot as its own process/container (`npm run bot:start`) with Redis reachable.
- [ ] Set up the billing-reminder cron env (`BILLING_ENABLED`, `BILLING_CRON_HOUR`).

---

## 7. Prioritized manual backlog (to reach ~92/100)

1. **Login rate limiting** (High, ~½ day) — Redis sliding window in `authorize()`.
2. **Encrypt `Company.password`** (High, ~½ day) — reuse `lib/crypto.ts`; migrate existing rows.
3. **Prisma migrations** (High, ~½ day) — baseline + switch deploy to `migrate deploy`.
4. **Monitoring** (Medium, ~1 day) — Sentry + pino; replace `console.*`.
5. **Wire zod validation** (Medium, ~1–2 days) — `.parse()` at action boundaries.
6. **Broaden audit logging** (Medium, ~1 day) — cover privileged mutations.
7. **Replace `xlsx`** (Medium, ~½ day) — clear the advisory.
8. **Enable CSP + `global-error.tsx` + integration CI job** (Low, ~1 day total).

---

## 8. Verification evidence

```
npm run typecheck   →  exit 0   (tsc --noEmit, clean)
npm run lint        →  exit 0   (0 errors, 130 pre-existing warnings — unchanged)
npm test            →  exit 0   (24 files, 123 tests passed)
npx vitest run bot/ →  exit 0   (12 files, 64 DB-free domain tests passed)
npm audit --omit=dev→  7 vulns  (1 high [xlsx, no exploit path], 6 moderate [build-time/dead-code])
```

All automated fixes in §2 were applied and re-verified against the full test suite with no regressions.

---

## 9. Score rationale

**78/100 (post-fix).** The application is architecturally sound and secure at its core boundary
(data-layer authz, hashing, encryption-for-credentials, parameterized queries, strong schema) with
a healthy, passing test suite and clean type/lint gates — that earns a high base. Points are
withheld for the operability gaps that remain manual: **no rate limiting**, **no migration
history**, **no monitoring**, **one plaintext credential field**, and **unused validation**. Closing
the §7 backlog — chiefly rate limiting, migrations, and monitoring — moves this to the low-90s and a
confident production posture.

---

## 10. Telegram bot & AI assistant readiness (follow-up)

### Telegram KPI bot — **production-grade**
Full audit of `bot/` (DDD contexts: identity / monitoring / kpi / billing / ai):

- **Ingress** (`app/api/telegram/webhook`): thin, fails closed (503) without
  `TELEGRAM_WEBHOOK_SECRET`, constant-time secret compare, enqueue-and-200.
- **Workers** (`message`, `question`): dedup via `ProcessedUpdate` ledger, 5-retry
  exponential backoff, concurrency 10/5, best-effort side-effects that never fail
  the job, error handlers on `failed`/`error`.
- **Cron**: minute deadline-sweep + daily billing; all state in Postgres →
  restart-safe. Billing reserves a `PaymentReminder` slot (unique-constraint
  guarded) before any I/O → idempotent, never double-sends.
- **AI classifier**: Gemini (structured JSON, temp 0) with an automatic
  **heuristic fallback** when `GEMINI_API_KEY` is unset — no outage.

**Verdict:** code is ready. The only real gap was **operational**: nothing
registered the webhook with Telegram. Fixed — see below.

### In-app "Moliyachi AI" assistant — **built & wired** (was a mock)
The header `FinanceAssistant` existed as a polished UI shell but its replies were
**canned/mock** (a `/api/assistant` that never existed). Now wired to a real
backend, **web-chat only (no Telegram)** as requested:

- `lib/ai/knowledge.ts` — ported BHMS + Soliq Kodeksi + Mehnat Kodeksi corpus
  (20 chunks) + a grounded Uzbek system prompt with guardrails (never fabricate
  live company figures; route users to the right ASRO module).
- `server/assistant.ts` — auth-gated Server Action `askFinanceAssistant()` calling
  Gemini (`@google/genai`), multi-turn history, input/History caps, graceful
  keyword fallback when no key.
- `components/FinanceAssistant.tsx` — mock removed; calls the action with history.

### Deployment tooling added (AWS + asro.uz)
- `scripts/set-telegram-webhook.ts` (`npm run bot:webhook`) — registers the
  webhook URL + secret, opts in to `edited_message`/`message_reaction`, sets the
  command menu. **This was the missing deploy step.**
- `docs/DEPLOYMENT.md` — full AWS + asro.uz runbook (Docker Compose on 1 EC2 as
  chosen): nginx + certbot TLS, RDS/ElastiCache, health checks, webhook, smoke test.
- `.env.example` — added `AUTH_TRUST_HOST` (required behind nginx/ALB) and clarified
  `GEMINI_API_KEY` now powers both the bot and the assistant.

### Verification (this follow-up)
```
npm run typecheck  → exit 0
npm run lint       → 0 errors
npm run build      → exit 0 (all routes: /api/health, /api/telegram/webhook,
                      dashboard bundling FinanceAssistant + @google/genai)
npm test           → 24 files, 123 passed
knowledge/fallback → verified (20 chunks, Uzbek answers for QQS/ta'til/foyda/KPI)
```

> Live Gemini responses require `GEMINI_API_KEY` + a logged-in session to
> exercise end-to-end; without the key the assistant serves the heuristic
> fallback (verified). The bot's webhook path needs a public TLS URL (asro.uz)
> before Telegram can deliver — run `npm run bot:webhook` after TLS is live.

### Deploy blockers to set before go-live (config, not code)
1. `TELEGRAM_BOT_TOKEN` + `TELEGRAM_WEBHOOK_SECRET` (bot won't ingress without them).
2. `AUTH_TRUST_HOST=true` + `AUTH_URL=https://asro.uz` (login breaks behind nginx otherwise).
3. `REDIS_URL` reachable by **both** web and bot processes.
4. Run `npx prisma db push` + `scripts/seed-kpi-rules-v2.ts` on the RDS instance.
5. `npm run bot:webhook` once `https://asro.uz` serves TLS.
6. (Optional) `GEMINI_API_KEY` for full-quality AI (bot classifier + assistant).
