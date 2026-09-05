# ASRO — Operations OS for accounting firms

> **1C keeps the books. ASRO runs the business.**
> This is deliberately **not** an ERP — no warehouse, no manufacturing, no sales,
> no CRM. See [`docs/PRODUCT.md`](docs/PRODUCT.md), which governs: if the code
> disagrees with it, the code is wrong.

It tracks the client companies the firm keeps books for, the staff assigned to
each, the obligations and deadlines they owe, the cash that moves, and the
monthly KPI that decides what those staff are paid — plus a Telegram bot that
delivers it. Built on **Next.js 16** (App Router, Server Actions),
**Prisma 7 + PostgreSQL**, **next-auth v5**, **BullMQ + Redis**, and **grammY**.

> ⚠️ This repo pins a **breaking** Next.js version. Read the bundled guides in
> `node_modules/next/dist/docs/` before changing framework-level code, and note
> that middleware lives in **`proxy.ts`** (renamed from `middleware.ts`).

## Requirements

- Node.js ≥ 20.9 (see `.nvmrc` → 24)
- PostgreSQL 14+
- Redis 6+ (bot queues; optional if you don't run the bot)

## Setup

```bash
cp .env.example .env.local     # fill DATABASE_URL, AUTH_SECRET, …
npm ci
npx prisma migrate deploy      # apply the versioned migration history
npx tsx scripts/create-admin.ts   # ADMIN_EMAIL=… ADMIN_PASSWORD=… (≥8 chars)
npm run dev
```

Generate `AUTH_SECRET` with `openssl rand -base64 32`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js app |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest — **integration tests need a seeded Postgres** |
| `npm run bot:dev` / `bot:start` | Telegram bot worker (BullMQ) |
| `npm run db:migrate` / `db:studio` | Prisma migration (dev) / Studio |
| `npm run db:push` | **Dev only** — unversioned schema push; refuses to run with `NODE_ENV=production` |

Tip: DB-free domain specs only → `npx vitest run bot/`.

## Architecture

- **`app/`** — App Router routes: `(auth)`, `(dashboard)`, `(admin)`, plus
  `api/telegram/webhook` and `api/health`.
- **`server/`** — Server Actions (`"use server"`). Every exported action
  re-checks `auth()` and role — the data layer is the real authorization
  boundary; `proxy.ts` is defense-in-depth for navigation.
- **`lib/`** — auth, prisma client, RBAC (`permissions.ts`), caching
  (`cached-queries.ts`), crypto, serialization.
- **`bot/`** — DDD-structured Telegram bot (identity / monitoring / kpi /
  billing / ai contexts) sharing the same Prisma/Postgres.
- **`prisma/schema.prisma`** — single source of truth for the DB.

## Deployment

- `Dockerfile` + `docker-compose.yml` provide a Postgres + Redis + web + bot
  stack (scaffolding — verify `docker compose build`).
- Health probe: `GET /api/health` (200 = app+DB healthy, 503 = DB down).
- See [`docs/audit/PRODUCTION_REPORT.md`](docs/audit/PRODUCTION_REPORT.md) for the (2026-07) production-readiness checklist.

## Docs

Start at **[`docs/README.md`](docs/README.md)** — it says which document is
current and which is history, in reading order.

The short version: [`docs/PRODUCT.md`](docs/PRODUCT.md) governs ·
[`docs/CONSTITUTION.md`](docs/CONSTITUTION.md) is enforced by tests ·
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) says where code lives ·
[`docs/adr/`](docs/adr/) records decisions · [`CONTEXT.md`](CONTEXT.md) fixes the
domain vocabulary · [`AGENTS.md`](AGENTS.md) is the agent contract.
Anything under [`docs/audit/`](docs/audit/) is a dated snapshot, not a target.
