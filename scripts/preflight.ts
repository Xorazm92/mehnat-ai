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
 *
 * Exits non-zero with a clear message when any hard check fails, so the deploy
 * pipeline aborts instead of shipping a login-broken system.
 *
 * Modes:
 *   npx tsx scripts/preflight.ts env   → env-only (fast, no DB) — run early in deploy
 *   npx tsx scripts/preflight.ts       → full check (env + DB + schema + admin) — run at the end
 */
import { loadEnv, makePrisma, countAdmins } from "./_bootstrap";

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
    // Behind nginx / ALB, next-auth v5 rejects the forwarded Host without this
    // and login breaks even when users exist.
    if (process.env.AUTH_TRUST_HOST !== "true") {
      err('AUTH_TRUST_HOST must be "true" in production (app runs behind nginx/ALB) or login breaks.');
    }
    if (url && url.startsWith("http://")) {
      warn("AUTH_URL uses http:// in production — it should be https://.");
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
          "    Apply it with: npx prisma db push   (or: npx prisma migrate deploy)"
      );
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  checkEnv();
  if (mode !== "env") await checkDatabase();

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
