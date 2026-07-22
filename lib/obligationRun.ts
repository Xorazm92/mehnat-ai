// =====================================================
// OBLIGATION GENERATION RUNNER — advisory lock + catch-up (Faza A)
// =====================================================
// generateObligations'ni Postgres advisory lock ostida yuritadi — bir necha
// worker/instance parallel ishlasa ham faqat bittasi generatsiya qiladi
// (unique constraint dublikatni allaqachon to'xtatadi; lock ortiqcha ishni
// oldini oladi). Catch-up: joriy davr + oxirgi N oyni qayta ko'radi (downtime
// vaqtida o'tkazib yuborilgan davrlar ham yaratiladi; idempotent). Reviewer #8.
import type { PrismaClient } from "@prisma/client";
import { generateObligations, type GenerateResult } from "@/lib/obligations";

// Barqaror advisory lock kaliti (obligation generatsiyasiga xos).
const GEN_LOCK = 918273645;

export interface RunGenerationResult {
  skipped?: "locked";
  results?: GenerateResult[];
}

export async function runGenerationLocked(
  prisma: PrismaClient,
  opts: { now?: Date; catchUpMonths?: number; createdBy?: string } = {},
): Promise<RunGenerationResult> {
  const now = opts.now ?? new Date();
  const catchUp = Math.max(0, opts.catchUpMonths ?? 2);

  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${GEN_LOCK}::bigint) AS locked
      `;
      if (!rows[0]?.locked) {
        return { skipped: "locked" as const };
      }

      const results: GenerateResult[] = [];
      // Joriy oy + oxirgi `catchUp` oy. Idempotent → takroriy davrlar skip.
      for (let i = 0; i <= catchUp; i++) {
        const ref = new Date(now);
        ref.setUTCMonth(ref.getUTCMonth() - i);
        results.push(await generateObligations(tx, { ref, createdBy: opts.createdBy }));
      }
      return { results };
    },
    { timeout: 120_000 },
  );
}
