"use server";

// =====================================================
// KPI LEDGER → PAYROLL PROYEKSIYA (server)
// =====================================================
// Bot `KpiEvent` ledger'idagi javob (response) hodisalarini oy uchun yig'ib,
// mavjud `*_group_response` qoidasi bo'yicha `MonthlyPerformance` ga **'submitted'**
// qator sifatida yozadi — ya'ni nazoratchi TASDIQLAGANDAN keyingina maoshga
// ta'sir qiladi. Tasdiqlangan (approved) qatorlar ustiga yozilmaydi.
// Faqat senior rollar ishga tushira oladi.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { isSeniorRole } from "@/lib/permissions";
import { computeRuleScore } from "@/lib/kpiScoring";
import {
  responseColorFromCounts,
  RESPONSE_RULE_BY_ROLE,
  type KpiColor,
} from "@/lib/kpiProjection";

interface Group {
  employeeId: string;
  companyId: string;
  role: string;
  onTime: number;
  late: number;
}

export async function projectResponseKpiToPerformance(month: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  if (!isSeniorRole(session.user.role as string)) {
    throw new Error("KPI proyeksiyasi uchun ruxsat yo'q");
  }
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Oy formati YYYY-MM bo'lishi kerak");

  // Ledger'dan shu oyning javob hodisalari (faqat korxonaga bog'langanlar).
  const events = await prisma.kpiEvent.findMany({
    where: { type: "response", periodMonth: month, companyId: { not: null } },
    select: { employeeId: true, companyId: true, points: true, meta: true },
  });

  // (employee, company, role) bo'yicha on-time/late sonini yig'ish.
  const groups = new Map<string, Group>();
  for (const e of events) {
    const role = (e.meta as { role?: string } | null)?.role ?? "";
    const key = `${e.employeeId}|${e.companyId}|${role}`;
    const g =
      groups.get(key) ??
      { employeeId: e.employeeId, companyId: e.companyId!, role, onTime: 0, late: 0 };
    if (Number(e.points) >= 0) g.onTime++;
    else g.late++;
    groups.set(key, g);
  }

  // Kerakli response qoidalarini bir marta yuklab olish.
  const ruleNames = [...new Set(Object.values(RESPONSE_RULE_BY_ROLE))];
  const rules = await prisma.kpiRule.findMany({
    where: { name: { in: ruleNames } },
  });
  const ruleByName = new Map(rules.map((r) => [r.name, r]));

  let written = 0;
  let skippedApproved = 0;
  let skippedNeutral = 0;

  for (const g of groups.values()) {
    const ruleName = RESPONSE_RULE_BY_ROLE[g.role];
    const rule = ruleName ? ruleByName.get(ruleName) : undefined;
    if (!rule) continue;

    const color: KpiColor | null = responseColorFromCounts(g.onTime, g.late);
    if (!color) {
      skippedNeutral++;
      continue;
    }

    // Nazoratchi tasdiqlagan qatorni bezovta qilmaymiz.
    const existing = await prisma.monthlyPerformance.findUnique({
      where: {
        month_companyId_employeeId_ruleId: {
          month,
          companyId: g.companyId,
          employeeId: g.employeeId,
          ruleId: rule.id,
        },
      },
      select: { status: true },
    });
    if (existing?.status === "approved") {
      skippedApproved++;
      continue;
    }

    const score = computeRuleScore(rule as never, { selectedOption: color });
    const value = color === "green" ? 1 : color === "red" ? -1 : 0;

    const payload = {
      selectedOption: color,
      earlyDays: 0,
      lateMinutes: 0,
      absentDays: 0,
      penaltyAmount: new Prisma.Decimal(0),
      value: new Prisma.Decimal(value),
      calculatedScore: new Prisma.Decimal(score.percent),
      source: "bot",
      status: "submitted",
      submittedBy: session.user.id as string,
      submittedAt: new Date(),
      notes: `Bot: ${g.onTime} o'z vaqtida, ${g.late} kechikish (KPI ledger)`,
    };

    await prisma.monthlyPerformance.upsert({
      where: {
        month_companyId_employeeId_ruleId: {
          month,
          companyId: g.companyId,
          employeeId: g.employeeId,
          ruleId: rule.id,
        },
      },
      create: {
        month,
        companyId: g.companyId,
        employeeId: g.employeeId,
        ruleId: rule.id,
        ...payload,
      },
      update: payload,
    });
    written++;
  }

  return { groups: groups.size, written, skippedApproved, skippedNeutral };
}
