"use server";

// =====================================================
// KPI PROYEKSIYASI — barcha dalil manbalarini bir chaqiriqda
// =====================================================
// Obligation (muddatlar) + Attendance (davomat) + KpiEvent (bot javoblari) →
// MonthlyPerformance `submitted/system` takliflari. Maoshga faqat nazoratchi
// tasdiqlagandan keyin tushadi (ADR-0001).

import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/platform/permissions";
import { toPerformanceMonth } from "@/lib/periods";
import { evaluateObligationEvidence, evaluateAttendanceEvidence } from "@/lib/kpiEvidence";
import { projectResponseKpiToPerformance } from "@/server/botKpiProjection";

export interface KpiProjectionSummary {
  month: string;
  obligations: { processed: number; updated: number; skippedApproved: number; skippedNeutral: number };
  attendance: { processed: number; updated: number; skippedApproved: number; skippedNeutral: number };
  response: { groups: number; written: number; skippedApproved: number; skippedNeutral: number };
  totalWritten: number;
}

/**
 * Bir oy uchun barcha avtomatlashtirilgan qoidalarni qayta hisoblab, nazoratchi
 * ko'rib chiqishi uchun taklif sifatida yozadi. Idempotent — qayta ishga
 * tushirilsa ayni qatorlar yangilanadi, dublikat yaratilmaydi.
 */
export async function projectAllKpiForMonth(month: string): Promise<KpiProjectionSummary> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isSeniorRole(session.user.role as string)) {
    throw new Error("KPI proyeksiyasi uchun ruxsat yo'q");
  }

  const perfMonth = toPerformanceMonth(month);
  if (!perfMonth) throw new Error("Oy formati noto'g'ri (YYYY-MM kutiladi)");

  const now = new Date();
  const obligations = await evaluateObligationEvidence(month, now);
  const attendance = await evaluateAttendanceEvidence(month, now);
  const response = await projectResponseKpiToPerformance(month);

  return {
    month: perfMonth,
    obligations,
    attendance,
    response,
    totalWritten: obligations.updated + attendance.updated + response.written,
  };
}
