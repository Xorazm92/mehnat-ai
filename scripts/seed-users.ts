/**
 * DEPRECATED — do not use.
 *
 * This script previously seeded a hardcoded admin (with a weak, in-source
 * password) plus a MOCK "Test Accountant" (user@mehnat.uz). Production must
 * contain REAL data only, so the mock seeding has been removed.
 *
 * Use instead:
 *   • Real admin (idempotent):
 *       ADMIN_EMAIL=admin@asro.uz ADMIN_PASSWORD='strong-pass' npm run create:admin
 *   • Canonical seed (same, wired to prisma db seed):
 *       ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run db:seed
 */
console.error(
  "scripts/seed-users.ts is deprecated — it used to seed MOCK data.\n" +
    "Create the real admin instead:\n" +
    "  ADMIN_EMAIL=admin@asro.uz ADMIN_PASSWORD='strong-pass' npm run create:admin"
);
process.exit(1);
