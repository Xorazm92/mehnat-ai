/**
 * One-off repair for the duplicate-MonthlyPerformance bug — see ADR-0004.
 *
 * Keeps the latest row by recordedAt per (month, companyId, employeeId, ruleId)
 * and deletes the rest. Latest-wins because the checklist client merged each
 * response into local state by natural key and rendered only the newest row —
 * the Supervisor was looking at the latest value and believed it was the value.
 *
 * Idempotent: a second run finds nothing to delete. Run BEFORE the migration that
 * adds @@unique, otherwise the constraint cannot be created.
 *
 *   npx tsx scripts/dedupe-monthly-performance.ts --dry-run
 *   npx tsx scripts/dedupe-monthly-performance.ts
 */
import * as dotenv from "dotenv";

// Must precede the lib/prisma import: it reads DATABASE_URL at module load.
dotenv.config({ path: ".env.local" });

type DupeGroup = {
  month: string;
  companyId: string;
  employeeId: string;
  ruleId: string;
  n: bigint;
};

async function main() {
  const { prisma } = await import("../lib/prisma");
  const dryRun = process.argv.includes("--dry-run");

  const groups = await prisma.$queryRaw<DupeGroup[]>`
    SELECT month, "companyId", "employeeId", "ruleId", count(*) AS n
    FROM "MonthlyPerformance"
    GROUP BY month, "companyId", "employeeId", "ruleId"
    HAVING count(*) > 1
    ORDER BY count(*) DESC
  `;

  if (groups.length === 0) {
    console.log("No duplicate natural keys. Nothing to do.");
    return;
  }

  const excess = groups.reduce((sum, g) => sum + Number(g.n) - 1, 0);
  console.log(`${groups.length} duplicated keys, ${excess} excess rows.`);

  // The delete and its verification run in one transaction so --dry-run can roll
  // back for real. Throwing outside a transaction would leave the rows deleted.
  await prisma.$transaction(async (tx) => {
    // Delete every row that is not the newest in its natural-key group. Ties on
    // recordedAt break by id so the choice is deterministic across runs.
    const deleted = await tx.$executeRaw`
      DELETE FROM "MonthlyPerformance" mp
      WHERE mp.id IN (
        SELECT id FROM (
          SELECT id, row_number() OVER (
            PARTITION BY month, "companyId", "employeeId", "ruleId"
            ORDER BY "recordedAt" DESC, id DESC
          ) AS rn
          FROM "MonthlyPerformance"
        ) ranked
        WHERE ranked.rn > 1
      )
    `;

    const left = await tx.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM (
        SELECT 1 FROM "MonthlyPerformance"
        GROUP BY month, "companyId", "employeeId", "ruleId" HAVING count(*) > 1
      ) t
    `;
    const remaining = Number(left[0]?.n ?? 0);
    if (remaining > 0) throw new Error(`${remaining} duplicate keys remain — aborting.`);

    if (dryRun) {
      console.log(`--dry-run: would delete ${deleted} rows. Rolling back.`);
      throw new Error("dry-run-rollback");
    }

    console.log(`Deleted ${deleted} rows.`);
    console.log("Verified: one row per (month, companyId, employeeId, ruleId).");
  });
}

main().catch((e) => {
  if ((e as Error).message === "dry-run-rollback") return;
  console.error(e);
  process.exitCode = 1;
});
