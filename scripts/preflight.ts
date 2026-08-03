/**
 * Production preflight / readiness gate.
 *
 * Verifies the four things that silently break a fresh deploy — the exact class
 * of failure that left production with a schema but no users and a login page
 * that only ever returned `CredentialsSignin`:
 *
 *   1. required environment variables are present
 *   2. the database is reachable
 *   3. the schema is applied (the User table exists)
 *   4. the User table is NON-EMPTY and an active admin account exists
 *   5. the live database MATCHES schema.prisma (no drift)
 *
 * Exits non-zero with a clear message when any hard check fails, so the deploy
 * pipeline aborts instead of shipping a login-broken system.
 *
 * Modes:
 *   npx tsx scripts/preflight.ts env   → env-only (fast, no DB) — run early in deploy
 *   npx tsx scripts/preflight.ts       → full check (env + DB + schema + admin) — run at the end
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadEnv, makePrisma, countAdmins } from "./_bootstrap";

const run = promisify(execFile);

loadEnv();

const isProd = process.env.NODE_ENV === "production";

type Level = "error" | "warn";
interface Problem {
  level: Level;
  msg: string;
}
const problems: Problem[] = [];
const err = (msg: string) => problems.push({ level: "error", msg });
const warn = (msg: string) => problems.push({ level: "warn", msg });

function checkEnv(): void {
  // Hard requirements in every environment.
  if (!process.env.DATABASE_URL) err("DATABASE_URL is missing.");

  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    err("AUTH_SECRET (or NEXTAUTH_SECRET) is missing — JWT sessions cannot be signed, login always fails.");
  } else if (secret.length < 16) {
    warn("AUTH_SECRET looks short — generate a strong one with `openssl rand -base64 32`.");
  }

  const url = process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  if (!url) (isProd ? err : warn)("AUTH_URL / NEXTAUTH_URL is not set.");

  if (isProd) {
    // The app now sets `trustHost: true` in lib/auth.config.ts, so a missing
    // AUTH_TRUST_HOST env no longer breaks login behind nginx/ALB. Keep this as
    // a warning for operators who still rely on the env-driven setup.
    if (process.env.AUTH_TRUST_HOST !== "true") {
      warn('AUTH_TRUST_HOST is not "true" — fine (code sets trustHost), but set it if you prefer env-driven config.');
    }
    if (url && url.startsWith("http://")) {
      warn("AUTH_URL uses http:// in production — it should be https:// (secure session cookies require it).");
    }
  }
}

async function checkDatabase(): Promise<void> {
  const { prisma, pool } = makePrisma();
  try {
    // 2. reachability
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (e) {
      err(`Database is unreachable: ${(e as Error)?.message ?? e}`);
      return;
    }

    // 3. schema applied  +  4. data present
    try {
      const users = await prisma.user.count();
      if (users === 0) {
        err(
          'User table is EMPTY — no one can log in. Create the admin:\n' +
            "    ADMIN_EMAIL=… ADMIN_PASSWORD=… npx tsx scripts/create-admin.ts"
        );
      } else {
        const admins = await countAdmins(prisma);
        if (admins === 0) {
          err("No active admin (super_admin/admin) account exists — run scripts/create-admin.ts.");
        }
      }
    } catch (e) {
      err(
        `Schema not applied (User table missing?): ${(e as Error)?.message ?? e}\n` +
          "    Apply it with: npx prisma migrate deploy"
      );
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

/**
 * 5. Does the live database actually match schema.prisma?
 *
 * `migrate deploy` only replays the migration files; it cannot know about a
 * column that was added to the schema and never given a migration. Prisma
 * Client is generated FROM the schema, so that gap is invisible until a query
 * touches the missing column at runtime — and then every write to that table
 * fails, not just the new field. That is exactly how a single unmigrated
 * `MonthlyReport.ekologiya` turned every screenshot upload into a 500.
 *
 * `--exit-code`: 0 = in sync, 2 = drift, 1 = the diff itself failed.
 */
async function checkSchemaDrift(): Promise<void> {
  try {
    await run(
      "npx",
      [
        "prisma",
        "migrate",
        "diff",
        "--from-config-datasource",
        "--to-schema",
        "prisma/schema.prisma",
        "--script",
        "--exit-code",
      ],
      { timeout: 60_000 },
    );
  } catch (e) {
    const e2 = e as { code?: number; stdout?: string };
    if (e2.code === 2) {
      const sql = (e2.stdout ?? "")
        .split("\n")
        .filter((l) => l.trim() && !l.startsWith("--") && !l.includes("Prisma config"))
        .slice(0, 10)
        .map((l) => `      ${l.trim()}`)
        .join("\n");
      (isProd ? err : warn)(
        "Database does NOT match prisma/schema.prisma. Queries touching these will fail at runtime:\n" +
          `${sql}\n` +
          "    Write a migration for it (never `migrate dev` on a shared DB), then:\n" +
          "      npx prisma migrate deploy",
      );
      return;
    }
    warn(`Schema drift check could not run: ${(e as Error)?.message?.split("\n")[0] ?? e}`);
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  checkEnv();
  if (mode !== "env") {
    await checkDatabase();
    await checkSchemaDrift();
  }

  const errors = problems.filter((p) => p.level === "error");
  const warns = problems.filter((p) => p.level === "warn");

  for (const w of warns) console.warn(`⚠ ${w.msg}`);
  for (const e of errors) console.error(`✗ ${e.msg}`);

  if (errors.length > 0) {
    console.error(`\nPreflight FAILED with ${errors.length} error(s). Deployment aborted.`);
    process.exit(1);
  }

  console.log(
    mode === "env"
      ? "✓ Env preflight passed."
      : "✓ Preflight passed — DB reachable, schema applied, admin present."
  );
}

main().catch((e) => {
  console.error("✗ Preflight crashed:", e?.message ?? e);
  process.exit(1);
});
