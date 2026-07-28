import { prisma } from "@/lib/prisma";
import { timingPatch } from "@/lib/obligationWorkflow";
import { toObligationMonthKey } from "@/lib/periods";
import type { ObligationStatus } from "@prisma/client";

/**
 * Mapping from MonthlyReport column keys (OperationFieldKey) to DeadlineTemplate codes.
 */
export const COL_KEY_TO_TEMPLATE_CODE: Record<string, string> = {
  pul_oqimlari: "CASHFLOW",
  debitor_kreditor: "AR_AP",
  tovar_ostatka: "MATERIALS",
  one_c: "ONEC_BASE",
  xatlar: "LETTERS",
  hisoblangan_oylik: "PAYROLL_CALC",
  chiqadigan_soliqlar: "TAX_SCHEDULE",
  foyda_va_zarar: "PNL_REPORT",
  inps: "INPS_IJTIMOIY",
  daromad_soliq: "DAROMAD_AGENT",
  qqs: "QQS_DECL",
  aylanma_soliq: "AYLANMA_SOLIQ",
  foyda_soliq: "FOYDA_YILLIK",
  moliyaviy_natija: "MOLIYAVIY_YILLIK",
  payroll_posted: "PAYROLL_POSTED",
};

/**
 * Synchronizes a report proof submission or review action to its corresponding Obligation.
 * Purely additive/non-blocking — if no template matches or no obligation is found, fails silently.
 */
export async function syncProofToObligation(opts: {
  companyId: string;
  period: string; // e.g. "2026-07" or "2026-07-01" or "2026 Iyul"
  colKey: string;
  targetStatus: "sent" | "accepted" | "rejected";
}) {
  const code = COL_KEY_TO_TEMPLATE_CODE[opts.colKey];
  if (!code) return;

  const template = await prisma.deadlineTemplate.findFirst({
    where: { code, active: true },
    select: { id: true },
  });
  if (!template) return;

  // Obligation.periodKey = "2026-M07". `contains: "2026-07"` HECH QACHON mos
  // kelmaydi — shu sabab bu ko'prik jimgina hech narsa qilmasdi.
  const monthKey = toObligationMonthKey(opts.period);
  if (!monthKey) return;

  const obligation = await prisma.obligation.findFirst({
    where: { companyId: opts.companyId, templateId: template.id, periodKey: monthKey },
    orderBy: { createdAt: "desc" },
  });

  if (!obligation) return;

  const now = new Date();
  const patch = timingPatch(opts.targetStatus as ObligationStatus, now);

  await prisma.obligation.update({
    where: { id: obligation.id },
    data: {
      status: opts.targetStatus,
      ...patch,
    },
  });
}
