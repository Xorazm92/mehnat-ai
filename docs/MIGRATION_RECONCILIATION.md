# Migration reconciliation — **staging only**

A runbook for the one situation where `prisma migrate deploy` cannot simply be
run: a database whose schema was created with **`prisma db push`**, so the tables
exist but `_prisma_migrations` is empty or incomplete. The first `migrate deploy`
against such a DB tries to `CREATE TABLE` objects that already exist and fails.

> ## Scope
>
> **Rehearse this on staging. Do not run it unattended against production.**
>
> `prisma migrate resolve` writes to `_prisma_migrations` *without executing the
> SQL*. That is exactly what makes it useful here — and exactly what makes it
> dangerous: mark a migration applied when its SQL never ran, and the schema and
> the history disagree forever, silently, until a later migration breaks.
>
> For that reason **nothing in this repo calls `migrate resolve` automatically.**
> `scripts/deploy.sh` runs `prisma migrate deploy` only.
> `scripts/migrate-baseline.sh` exists but is a manual, human-run tool.

---

## 0. Prerequisites

- A **staging database restored from a production dump** — reconciliation must be
  rehearsed against real schema drift, not a clean dev DB.
- `DATABASE_URL` pointing at that staging DB. Export it explicitly in the shell
  and double-check it before every command in this document.
- A fresh dump you can restore from if a step goes wrong.

```bash
export DATABASE_URL='postgresql://…/asro_staging?schema=public'
psql "$DATABASE_URL" -c 'select current_database(), inet_server_addr();'  # confirm target
pg_dump "$DATABASE_URL" -Fc -f asro_staging_pre_reconcile.dump            # rollback point
```

---

## 1. Diagnose — which case are you in?

```bash
npx prisma migrate status
```

| Output | Case | Action |
|---|---|---|
| `Database schema is up to date!` | **A** — already reconciled | Nothing to do. |
| `have not yet been applied` **and the tables do not exist** | **B** — genuinely behind | Just `migrate deploy` (§2). |
| `have not yet been applied` **but the tables already exist** | **C** — `db push` legacy | Baseline (§3). |
| `following migration(s) are applied … but missing from the local` | **D** — history ahead of code | Do not baseline. §5. |
| `failed` migration recorded | **E** — partial failure | §6. |

Distinguish B from C by asking the database, not by guessing:

```bash
psql "$DATABASE_URL" -c "\dt"                          # do the tables exist?
psql "$DATABASE_URL" -c 'table _prisma_migrations;'    # what does Prisma think ran?
```

---

## 2. Case B — behind, tables absent

```bash
npx prisma migrate deploy
npx prisma migrate status     # must print "Database schema is up to date!"
```

---

## 3. Case C — `db push` legacy database (the reason this doc exists)

The schema already matches the committed migrations, but Prisma has no record of
them. Confirm that assumption **before** writing anything:

```bash
# Empty output = the live schema already equals schema.prisma. This is the gate.
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma
```

- **Empty diff** → safe to baseline. Continue.
- **Non-empty diff** → **STOP.** The DB is not equivalent to the migrations;
  baselining would record a lie. Go to §4.

Baseline — marks every committed migration applied without running its SQL:

```bash
bash scripts/migrate-baseline.sh
npx prisma migrate status
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma  # still empty
```

Then run the app's own gate:

```bash
npm run preflight
```

---

## 4. Case C′ — the diff is **not** empty

Real drift: someone `db push`-ed a change that no migration file describes.
Generate the delta as a normal, reviewable migration instead of hand-editing the
database.

```bash
mkdir -p prisma/migrations/$(date +%Y%m%d%H%M%S)_reconcile_drift
npx prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --script > prisma/migrations/*_reconcile_drift/migration.sql
```

**Read the generated SQL line by line.** `migrate diff` will happily emit
`DROP COLUMN` / `DROP TABLE` for anything present in the DB but absent from
`schema.prisma`. In this repo that is a hard stop:

- **Never keep a `DROP TABLE`, `DROP COLUMN`, or a destructive `ALTER TYPE`.**
  If the diff wants to drop something, the schema is missing a field the
  database legitimately has — fix `schema.prisma`, regenerate, and repeat.
- Additive statements (`CREATE INDEX`, `ADD COLUMN … NULL`, `CREATE TABLE`) are
  the only ones that belong in a reconciliation migration.

Then baseline the *older* migrations and apply only the new one:

```bash
bash scripts/migrate-baseline.sh          # marks pre-existing migrations applied
npx prisma migrate deploy                 # runs ONLY the reconcile migration
npx prisma migrate status
```

---

## 5. Case D — applied migrations missing from the repo

`_prisma_migrations` names migrations that no longer exist in `prisma/migrations/`.
Someone deployed from a branch and the files were never merged, or were deleted.

Do **not** baseline and do **not** delete rows. Find the commit that contains
them (`git log --all -- prisma/migrations`) and restore the directories, so code
and database agree again. If they are genuinely gone, recreate the equivalent
directory with the SQL that was actually executed, verified against the live
schema with `migrate diff`.

---

## 6. Case E — a migration is recorded as failed

```bash
psql "$DATABASE_URL" -c \
  "select migration_name, started_at, finished_at, rolled_back_at, logs
     from _prisma_migrations where finished_at is null;"
```

Decide from the live schema which is true, then record it — one, not both:

```bash
# Its SQL DID fully apply → record success:
npx prisma migrate resolve --applied "<migration_name>"

# Its SQL did NOT apply (or you reverted it by hand) → record the rollback,
# fix the SQL, and deploy again:
npx prisma migrate resolve --rolled-back "<migration_name>"
npx prisma migrate deploy
```

A partially applied migration is the dangerous middle case: finish or undo it by
hand **first**, verify with `migrate diff`, and only then record the outcome.

---

## 7. Exit criteria

Reconciliation is done when all four hold on staging:

```bash
npx prisma migrate status     # "Database schema is up to date!"
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma   # empty
npm run preflight             # "Preflight passed"
npm test                      # green against the staging DB
```

---

## 8. Promoting to production

Only after the full staging rehearsal above:

1. Take a production snapshot (RDS snapshot or `pg_dump -Fc`) and verify it restores.
2. Announce a short maintenance window — baselining is fast, but recovery is not.
3. Run the **same** commands, in the same order, with `DATABASE_URL` pointed at
   production, **by hand, watching the output**. Never wire them into
   `deploy.sh`, CI, or a cron.
4. `npx prisma migrate status` + `npm run preflight` must both pass before
   traffic returns.
5. From then on, `scripts/deploy.sh` (which runs `prisma migrate deploy`) is the
   only thing that should ever touch the production schema.
