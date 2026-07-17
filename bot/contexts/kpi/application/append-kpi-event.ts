import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type { KpiEventInput } from "../domain/kpi-event";

export interface AppendResult {
  appended: boolean;
  id?: string;
}

/**
 * Append one signed event to the KPI ledger. For automatic events (those with a
 * `sourceRef`) it is idempotent: at most one event per (employee, sourceRef,
 * type), so BullMQ retries and the expiry/answer overlap can never double-count.
 * Manual events (no sourceRef) are always appended.
 */
export async function appendKpiEvent(
  prisma: PrismaClient,
  input: KpiEventInput,
): Promise<AppendResult> {
  if (input.sourceRef) {
    const existing = await prisma.kpiEvent.findFirst({
      where: {
        employeeId: input.employeeId,
        sourceRef: input.sourceRef,
        type: input.type,
      },
      select: { id: true },
    });
    if (existing) return { appended: false, id: existing.id };
  }

  const event = await prisma.kpiEvent.create({
    data: {
      employeeId: input.employeeId,
      companyId: input.companyId ?? null,
      ruleId: input.ruleId ?? null,
      periodMonth: input.periodMonth,
      type: input.type,
      points: new Prisma.Decimal(input.points),
      sourceRef: input.sourceRef ?? null,
      meta: (input.meta ?? {}) as Prisma.InputJsonValue,
      createdBy: input.createdBy ?? null,
    },
    select: { id: true },
  });
  return { appended: true, id: event.id };
}
