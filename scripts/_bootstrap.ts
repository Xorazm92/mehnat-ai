/**
 * Shared production-bootstrap helpers used by:
 *   - scripts/create-admin.ts  (CLI admin bootstrap)
 *   - prisma/seed.ts           (canonical, idempotent seed)
 *   - scripts/preflight.ts     (deploy readiness gate)
 *
 * There is NO mock/demo data here — only the REAL super-admin bootstrap and the
 * DB/connection primitives. Keep it that way: production must contain real data.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import * as dotenv from "dotenv";

/**
 * Load env from `.env.local` (dev) then `.env` (prod). dotenv never overrides an
 * already-set `process.env` var, so a real deploy env (systemd / PM2
 * EnvironmentFile / shell) always wins over the files.
 */
export function loadEnv(): void {
  dotenv.config({ path: ".env.local" });
  dotenv.config();
}

/**
 * A single Prisma client wired to the pg driver adapter (same setup as
 * `lib/prisma.ts`). The caller OWNS the lifecycle — always
 * `await prisma.$disconnect()` and `await pool.end()` when finished.
 */
export function makePrisma(): { prisma: PrismaClient; pool: Pool } {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — cannot connect to the database.");
  }
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  return { prisma, pool };
}

/** bcrypt cost factor — matches lib/auth.ts and the rest of the codebase. */
export const BCRYPT_COST = 12;

/** Privileged roles that count as an "admin" for the readiness gate. */
export type AdminRole = "super_admin" | "admin";
export const ADMIN_ROLES: AdminRole[] = ["super_admin", "admin"];

export interface EnsureAdminOptions {
  email: string;
  password: string;
  fullName?: string;
  role?: AdminRole;
  /** When true, reset the password/role of an existing account (recovery). */
  resetIfExists?: boolean;
}

export interface EnsureAdminResult {
  created: boolean;
  updated: boolean;
  email: string;
  role: string;
}

/**
 * Idempotent super-admin bootstrap. Creates the account only when it is missing;
 * with `resetIfExists` it also repairs (re-hashes password, restores role +
 * active flag) an existing one. Safe to run any number of times.
 *
 * The password is validated (>= 8 chars) and stored as a bcrypt hash — never in
 * plaintext.
 */
export async function ensureAdmin(
  prisma: PrismaClient,
  opts: EnsureAdminOptions
): Promise<EnsureAdminResult> {
  // Do not lowercase — the login authorize() matches email exactly, so keep parity.
  const email = opts.email.trim();
  const role: AdminRole = opts.role ?? "super_admin";
  if (!email) throw new Error("Admin email is empty.");
  if (!opts.password || opts.password.length < 8) {
    throw new Error("Admin password must be at least 8 characters.");
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing && !opts.resetIfExists) {
    return { created: false, updated: false, email, role: existing.role };
  }

  const passwordHash = await bcrypt.hash(opts.password, BCRYPT_COST);

  if (existing) {
    await prisma.user.update({
      where: { email },
      data: { passwordHash, role, isActive: true },
    });
    return { created: false, updated: true, email, role };
  }

  await prisma.user.create({
    data: {
      email,
      fullName: opts.fullName?.trim() || "Super Admin",
      passwordHash,
      role,
      isActive: true,
    },
  });
  return { created: true, updated: false, email, role };
}

/** Count active, privileged admins — used by the preflight readiness gate. */
export async function countAdmins(prisma: PrismaClient): Promise<number> {
  return prisma.user.count({
    where: { isActive: true, role: { in: ADMIN_ROLES } },
  });
}
