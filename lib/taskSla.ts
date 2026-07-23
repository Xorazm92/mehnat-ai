// =====================================================
// TASK SLA SWEEP — breach detection (Faza C1)
// =====================================================
// Javob (response) va yechim (resolution) SLA muddati o'tgan vazifalarni topadi,
// SlaBreach yozadi (DEDUP: @@unique([taskId, breachType]) → bir marta) va mas'ulga
// in-app xabar yuboradi. Obligation sweep bilan bir jadvalda ishlaydi.
import { Prisma, type TaskStatus } from "@prisma/client";
import { logServerError } from "@/lib/logger";

type Db = Prisma.TransactionClient;

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

const OPEN_FOR_RESPONSE: TaskStatus[] = ["open", "in_progress", "blocked"];
const NOT_DONE: TaskStatus[] = ["open", "in_progress", "blocked"];

export interface TaskSlaResult {
  responseBreaches: number;
  resolutionBreaches: number;
  deduped: number;
}

async function recordBreach(
  db: Db,
  task: { id: string; slaPolicyId: string | null; assigneeUserId: string | null; title: string },
  breachType: "response" | "resolution",
  dueAt: Date,
  res: TaskSlaResult,
  now: Date,
): Promise<void> {
  try {
    await db.slaBreach.create({
      data: { taskId: task.id, slaPolicyId: task.slaPolicyId, breachType, dueAt, breachedAt: now },
    });
    if (breachType === "response") res.responseBreaches++;
    else res.resolutionBreaches++;
    if (task.assigneeUserId) {
      try {
        await db.notification.create({
          data: {
            userId: task.assigneeUserId,
            type: "sla_breach",
            title: breachType === "response" ? "SLA: javob kechikdi" : "SLA: yechim kechikdi",
            message: `Vazifa "${task.title}" — SLA muddati ${dueAt.toISOString().slice(0, 16).replace("T", " ")}`,
            link: `/tasks?task=${task.id}`,
          },
        });
      } catch (err) {
        logServerError("taskSla.notification", err, { taskId: task.id });
      }
    }
  } catch (e) {
    if (isUniqueViolation(e)) res.deduped++;
    else throw e;
  }
}

export async function sweepTaskSla(db: Db, opts: { now?: Date } = {}): Promise<TaskSlaResult> {
  const now = opts.now ?? new Date();
  const res: TaskSlaResult = { responseBreaches: 0, resolutionBreaches: 0, deduped: 0 };

  // Response: birinchi javob yo'q + response muddati o'tgan + hali ochiq.
  const responseCandidates = await db.task.findMany({
    where: {
      firstResponseAt: null,
      responseDueAt: { not: null, lt: now },
      status: { in: OPEN_FOR_RESPONSE },
    },
    select: { id: true, slaPolicyId: true, assigneeUserId: true, title: true, responseDueAt: true },
  });
  for (const t of responseCandidates) {
    await recordBreach(db, t, "response", t.responseDueAt!, res, now);
  }

  // Resolution: yechim muddati o'tgan + yakunlanmagan.
  const resolutionCandidates = await db.task.findMany({
    where: {
      resolutionDueAt: { not: null, lt: now },
      status: { in: NOT_DONE },
    },
    select: { id: true, slaPolicyId: true, assigneeUserId: true, title: true, resolutionDueAt: true },
  });
  for (const t of resolutionCandidates) {
    await recordBreach(db, t, "resolution", t.resolutionDueAt!, res, now);
  }

  return res;
}
