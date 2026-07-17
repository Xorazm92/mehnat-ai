import type { PrismaClient } from "@prisma/client";
import { appendKpiEvent } from "./append-kpi-event";
import { resolveResponsibleUserId } from "./resolve-responsible";
import { periodOf } from "../domain/kpi-event";

export type QuestionOutcome = "on_time" | "late";

export interface RecordQuestionKpiResult {
  appended: boolean;
  reason?: string;
}

/**
 * Turn a question outcome into a signed KPI ledger event, attributed to the
 * company's responsible employee. On-time answer → +1, late/expired → −1.
 * Idempotent per question (one response event), so answering a
 * previously-expired question does not double-count.
 */
export async function recordQuestionKpi(
  prisma: PrismaClient,
  questionId: string,
  outcome: QuestionOutcome,
): Promise<RecordQuestionKpiResult> {
  const q = await prisma.question.findUnique({
    where: { id: questionId },
    select: { id: true, companyId: true, responsibleRole: true, createdAt: true },
  });
  if (!q) return { appended: false, reason: "question not found" };

  const employeeId = await resolveResponsibleUserId(prisma, q.companyId, q.responsibleRole);
  if (!employeeId) {
    return { appended: false, reason: "no responsible employee (unbound company or role)" };
  }

  const res = await appendKpiEvent(prisma, {
    employeeId,
    companyId: q.companyId,
    periodMonth: periodOf(q.createdAt),
    type: "response",
    points: outcome === "on_time" ? 1 : -1,
    sourceRef: q.id,
    meta: { outcome, questionId: q.id, role: q.responsibleRole },
  });
  return { appended: res.appended };
}
