/**
 * Super-admin bootstrap — idempotent. Creates the admin ONLY if it is missing.
 *
 *   ADMIN_EMAIL=admin@asro.uz ADMIN_PASSWORD='strong-pass' npx tsx scripts/create-admin.ts
 *
 * Env / flags:
 *   ADMIN_EMAIL       (required to create)  login email
 *   ADMIN_PASSWORD    (required to create)  min 8 chars, stored as bcrypt hash
 *   ADMIN_ROLE        (optional)            "super_admin" (default) | "admin"
 *   ADMIN_NAME        (optional)            full name for a newly created account
 *   RESET_IF_EXISTS=1 | --force             also reset an EXISTING account's password/role
 *   PRINT_PASSWORD=1                         echo the password back (off by default; avoid in prod logs)
 *
 * Behaviour:
 *   - admin already exists  → prints "Admin already exists" and exits 0 (no password needed)
 *   - admin missing         → creates it (requires ADMIN_EMAIL + ADMIN_PASSWORD), exits 0
 *   - cannot create         → prints a clear error and exits 1
 */
import { loadEnv, makePrisma, ensureAdmin, type AdminRole } from "./_bootstrap";

loadEnv();

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  const role = (process.env.ADMIN_ROLE as AdminRole) || "super_admin";
  const resetIfExists =
    process.env.RESET_IF_EXISTS === "1" || process.argv.includes("--force");

  const { prisma, pool } = makePrisma();
  try {
    // Existence check first, so steady-state re-deploys don't require the
    // password just to confirm the admin is already there.
    const existing = email
      ? await prisma.user.findUnique({ where: { email } })
      : null;

    if (existing && !resetIfExists) {
      console.log(
        `✓ Admin already exists: ${existing.email} (role: ${existing.role}). Nothing to do.`
      );
      return;
    }

    if (!email || !password || password.length < 8) {
      console.error(
        "✗ To create the admin, set ADMIN_EMAIL and ADMIN_PASSWORD (min 8 chars).\n" +
          "  Example: ADMIN_EMAIL=admin@asro.uz ADMIN_PASSWORD='strong-pass' npx tsx scripts/create-admin.ts"
      );
      process.exitCode = 1;
      return;
    }

    const res = await ensureAdmin(prisma, {
      email,
      password,
      role,
      fullName: process.env.ADMIN_NAME,
      resetIfExists,
    });

    if (res.created) console.log(`✓ Admin created: ${res.email} (role: ${res.role})`);
    else if (res.updated)
      console.log(`✓ Admin password/role reset: ${res.email} (role: ${res.role})`);
    else console.log(`✓ Admin already exists: ${res.email}. Nothing to do.`);

    if (res.created || res.updated) {
      if (process.env.PRINT_PASSWORD === "1") {
        console.log(`  Login: ${res.email}\n  Password: ${password}`);
      } else {
        console.log(
          "  Log in with the ADMIN_EMAIL / ADMIN_PASSWORD you provided. " +
            "(set PRINT_PASSWORD=1 to echo the password)"
        );
      }
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("✗ create-admin failed:", e?.message ?? e);
  process.exit(1);
});
