/**
 * Canonical database seed — production-safe and idempotent.
 *
 * This seed intentionally contains NO mock/demo data. It guarantees exactly one
 * thing: the bootstrap super-admin exists so that login works on a fresh
 * database. It is wired into `prisma db seed` via prisma.config.ts and is also
 * run by the deploy pipeline (scripts/deploy.sh).
 *
 * Requires ADMIN_EMAIL + ADMIN_PASSWORD in the environment. When they are absent
 * the seed is a NO-OP (so it never fails an unattended `prisma migrate` in CI),
 * but it prints a clear warning.
 *
 * Real reference data that the app needs (KPI rules) is seeded separately by
 * scripts/seed-kpi-rules-v2.ts — kept out of here so this stays a pure,
 * fast, safe-to-repeat login bootstrap.
 */
import { loadEnv, makePrisma, ensureAdmin, type AdminRole } from "../scripts/_bootstrap";

loadEnv();

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  const role = (process.env.ADMIN_ROLE as AdminRole) || "super_admin";

  const { prisma, pool } = makePrisma();
  try {
    if (!email || !password) {
      console.warn(
        "⚠ Seed: ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin bootstrap.\n" +
          "  Set them (password min 8 chars) to guarantee a login account on a fresh DB."
      );
      return;
    }

    const res = await ensureAdmin(prisma, {
      email,
      password,
      role,
      fullName: process.env.ADMIN_NAME,
    });

    if (res.created) console.log(`✓ Seed: admin created (${res.email}, ${res.role}).`);
    else console.log(`✓ Seed: admin already present (${res.email}).`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("✗ Seed failed:", e?.message ?? e);
  process.exit(1);
});
