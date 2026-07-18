import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

/**
 * Lazy Prisma singleton.
 *
 * The client is deliberately NOT constructed when this module is imported — only
 * on first actual use. CLI scripts (scripts/*.ts, prisma/seed.ts) import this
 * module at the top of the file but load their environment (DATABASE_URL) a
 * moment later via scripts/_bootstrap#loadEnv. If the client were built during
 * import, DATABASE_URL would still be undefined and every script would crash with
 * "DATABASE_URL environment variable is not set" — which is exactly what broke
 * the production deploy at `npx tsx scripts/seed-kpi-rules-v2.ts`.
 *
 * Next.js and the bot load env before any request/query runs, so deferring
 * construction is transparent to them.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });
}

/**
 * Get (or lazily create) the shared Prisma client. The instance is memoised on
 * `globalThis` so dev hot-reloads and repeated imports reuse a single client and
 * connection pool. Call this the moment you need the client; DATABASE_URL is only
 * read here, never at import time.
 */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

/**
 * Backwards-compatible drop-in for the old eager `prisma` export. It is a thin
 * Proxy that forwards every access to the lazily-created client, so existing
 * `import { prisma } from "@/lib/prisma"` call sites keep working unchanged — but
 * nothing touches DATABASE_URL until the first real query.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
