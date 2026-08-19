import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { periodOf } from "../domain/kpi-event";

export type ManualKind = "award" | "penalty";

export interface ManualKpiInput {
  employeeId: string;
  percent: number; // magnitude; sign is set by `kind`
  reason: string;
  byUserId?: string | null;
  companyId?: string | null;
}

export interface ManualKpiResult {
  id: string;
  points: number;
  /** Aynan shunday yozuv shu oyda allaqachon bor edi — yangisi YOZILMADI. */
  duplicate: boolean;
}

/**
 * Qo'lda kiritilgan tuzatishning BARQAROR kaliti.
 *
 * Avtomatik hodisalar `sourceRef` orqali dedup qilinadi, qo'lda kiritilganlar
 * esa `sourceRef: null` bilan SHARTSIZ qo'shilardi. Ya'ni ikki marta bosilgan
 * tugma yoki qayta yuborilgan buyruq bitta jarimani ikki barobar qilardi va
 * bu to'g'ridan-to'g'ri xodimning maoshiga tushardi.
 *
 * Kalitga sabab ham kiradi: bir oyda bir xodimga bir xil foizli IKKI XIL
 * jarima qonuniy holat, va ular sababi bilan farqlanadi.
 */
const manualSourceRef = (kind: ManualKind, period: string, percent: number, reason: string) =>
  `manual:${period}:${kind}:${Math.abs(percent)}:${reason.trim().toLowerCase().replace(/\s+/g, " ")}`;

/**
 * Record a manual KPI adjustment as a ledger event (+percent for an award,
 * −percent for a penalty) plus an audit entry — kim/qachon/nima/nega. This is
 * an immutable ledger record; applying it to payroll is the deliberate rollup
 * step, not automatic.
 */
export async function recordManualKpi(
  prisma: PrismaClient,
  kind: ManualKind,
  input: ManualKpiInput,
): Promise<ManualKpiResult> {
  const points = kind === "award" ? Math.abs(input.percent) : -Math.abs(input.percent);
  const period = periodOf(new Date());
  const sourceRef = manualSourceRef(kind, period, input.percent, input.reason);

  // Takroriy yuborishni RAD ETADI, jimgina yutmaydi: chaqiruvchi buni
  // foydalanuvchiga aytadi, shunda haqiqatan ikkinchi hodisa bo'lsa u sababni
  // aniqlashtirib qayta yuboradi.
  const existing = await prisma.kpiEvent.findFirst({
    where: { employeeId: input.employeeId, sourceRef, type: "manual" },
    select: { id: true, points: true },
  });
  if (existing) {
    return { id: existing.id, points: Number(existing.points), duplicate: true };
  }

  let id = "";

  await prisma.$transaction(async (tx) => {
    const event = await tx.kpiEvent.create({
      data: {
        employeeId: input.employeeId,
        companyId: input.companyId ?? null,
        ruleId: null,
        periodMonth: period,
        type: "manual",
        points: new Prisma.Decimal(points),
        sourceRef,
        meta: { kind, reason: input.reason } as Prisma.InputJsonValue,
        createdBy: input.byUserId ?? null,
      },
      select: { id: true },
    });
    id = event.id;
    await tx.auditLog.create({
      data: {
        userId: input.byUserId ?? null,
        action: "create",
        tableName: "KpiEvent",
        recordId: event.id,
        newData: {
          type: "manual",
          kind,
          points,
          period,
          employeeId: input.employeeId,
          reason: input.reason,
        },
      },
    });
  });

  return { id, points, duplicate: false };
}
