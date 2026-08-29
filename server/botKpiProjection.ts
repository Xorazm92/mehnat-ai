"use server";

// =====================================================
// KPI LEDGER → PAYROLL PROYEKSIYA (server)
// =====================================================
// Bot `KpiEvent` ledger'idagi javob (response) hodisalarini oy uchun yig'ib,
// mavjud `*_group_response` qoidasi bo'yicha `MonthlyPerformance` ga **'submitted'**
// qator sifatida yozadi — ya'ni nazoratchi TASDIQLAGANDAN keyingina maoshga
// ta'sir qiladi. Tasdiqlangan (approved) qatorlar ustiga yozilmaydi.
// Faqat senior rollar ishga tushira oladi.
//
// Hisoblash mantiqi `lib/kpiEvidence.ts` da: oylik BullMQ job'da `auth()` yo'q,
// shuning uchun worker server action'ni emas, o'sha lib funksiyasini chaqiradi.
// Bu fayl — uning ustidagi ruxsat qobig'i.

import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/platform/permissions";
import { evaluateResponseEvidence } from "@/lib/kpiEvidence";

export async function projectResponseKpiToPerformance(month: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isSeniorRole(session.user.role as string)) {
    throw new Error("KPI proyeksiyasi uchun ruxsat yo'q");
  }

  return evaluateResponseEvidence(month, { submittedBy: session.user.id as string });
}
