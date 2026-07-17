import type { PrismaClient } from "@prisma/client";

/**
 * Mark every pending Question whose deadline has passed as `late`, and return
 * their ids so the caller can emit a KPI penalty per expired question. Scans
 * only pending rows via the `(status, deadlineAt)` index — never a per-chat
 * walk. Restart-safe: all state lives in Postgres.
 */
export async function expireOverdueQuestions(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<string[]> {
  const overdue = await prisma.question.findMany({
    where: { status: "pending", deadlineAt: { lt: now } },
    select: { id: true },
  });
  if (overdue.length === 0) return [];

  const ids = overdue.map((q) => q.id);
  await prisma.question.updateMany({
    where: { id: { in: ids } },
    data: { status: "late" },
  });
  return ids;
}
