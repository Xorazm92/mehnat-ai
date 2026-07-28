// =====================================================
// KPI DALIL QATLAMI — Obligation / Attendance → MonthlyPerformance taklifi
// =====================================================
// Nazoratchi 25 qoidani xotiradan bosmasligi uchun, obyektiv dalil bor
// qoidalarni tizim o'zi TAKLIF qiladi (`status='submitted', source='system'`).
// Maoshga faqat nazoratchi TASDIQLAGANDAN keyin tushadi — ADR-0001 buzilmaydi.
//
// Hukm talab qiladigan qoidalar (acc_critical_error, bank_wrong_transfer,
// bank_personal_resp, sup_unresolved) bu yerda umuman ko'rilmaydi — ADR-0003.

import { prisma } from "@/lib/prisma";
import { toPerformanceMonth, toYearMonthKey, toObligationMonthKey } from "@/lib/periods";
import { computeRuleScore } from "@/lib/kpiScoring";
import { aggregateMonthlyAttendance } from "@/lib/attendance";
import { responseColorFromCounts, RESPONSE_RULE_BY_ROLE } from "@/lib/kpiProjection";
import { Prisma } from "@prisma/client";

/** DeadlineTemplate kodi → KPI qoidasi nomi. */
export const TEMPLATE_CODE_TO_RULE_NAME: Record<string, string> = {
  CASHFLOW: "acc_cashflow",
  AR_AP: "acc_debitor",
  MATERIALS: "acc_materials",
  ONEC_BASE: "acc_1c_base",
  LETTERS: "acc_letters",
  PAYROLL_CALC: "acc_payroll_report",
  TAX_SCHEDULE: "acc_taxes_report",
  PNL_REPORT: "acc_pnl_report",
  PAYROLL_POSTED: "acc_payroll_posted",
  QQS_DECL: "acc_taxes_report",
  AYLANMA_SOLIQ: "acc_taxes_report",
  INPS_IJTIMOIY: "acc_taxes_report",
  DAROMAD_AGENT: "acc_taxes_report",
};

/**
 * Buxgalterning aybi BO'LMAGAN kechikish sabablari. Ikki bosqichli:
 * belgilangan + menejer tasdiqlagan bo'lsa (`delayApprovedById`), obligation
 * KPI dan CHIQARILADI. server/fairKpi.ts dagi ro'yxat bilan bir xil.
 */
export const EXCUSED_DELAY_REASONS = new Set([
  "client_delay",
  "system_failure",
  "external_authority",
  "management_decision",
]);

/** `UserRole` (bank_manager) → KPI qoidalari lug'ati (bank_client). */
const ATTENDANCE_RULE_BY_USER_ROLE: Record<string, string> = {
  accountant: "acc_attendance",
  bank_manager: "bank_attendance",
  supervisor: "sup_attendance",
};

const ABSENCE_RULE_BY_USER_ROLE: Record<string, string> = {
  accountant: "acc_absence",
  bank_manager: "bank_absence",
  supervisor: "sup_absence",
};

export type EvidenceVerdict = "green" | "yellow" | "red";

/**
 * Bitta obligation → uch holatli baho. SOF funksiya.
 *  - tasdiqlangan kechikish sababi bor → null (baho qo'yilmaydi, jarima yo'q)
 *  - muddatida qabul qilingan → green
 *  - kech qabul qilingan / rad etilgan / muddati o'tgan → red
 *  - hali muddati kelmagan → null (oy tugamagan, hukm erta)
 */
export function verdictForObligation(
  ob: {
    status: string;
    dueAt: Date;
    completedAt: Date | null;
    delayReason: string | null;
    delayApprovedById: string | null;
  },
  now: Date
): EvidenceVerdict | null {
  const excused =
    !!ob.delayApprovedById && !!ob.delayReason && EXCUSED_DELAY_REASONS.has(ob.delayReason);
  if (excused) return null;

  if (ob.status === "cancelled") return null;

  if (ob.status === "accepted") {
    return ob.completedAt && ob.completedAt <= ob.dueAt ? "green" : "red";
  }
  if (ob.status === "rejected") return "red";

  // Hali bajarilmagan: muddat o'tgan bo'lsa qizil, aks holda hukm erta.
  return now > ob.dueAt ? "red" : null;
}

interface ProjectionResult {
  processed: number;
  updated: number;
  skippedApproved: number;
  skippedNeutral: number;
}

type PerformanceNaturalKey = {
  month: string;
  companyId: string;
  employeeId: string;
  ruleId: string;
};

/** Tabiiy kalitdan tashqari har bir yozuv maydonи — `value`/`calculatedScore` shart. */
type SystemProposalPayload = Omit<
  Prisma.MonthlyPerformanceUncheckedCreateInput,
  keyof PerformanceNaturalKey
>;

/** `approved` yoki nazoratchi qo'li tekkan qatorni hech qachon bosmaymiz. */
async function upsertSystemProposal(
  naturalKey: PerformanceNaturalKey,
  payload: SystemProposalPayload,
  counters: { skippedApproved: number; updated: number }
) {
  const existing = await prisma.monthlyPerformance.findUnique({
    where: { month_companyId_employeeId_ruleId: naturalKey },
    select: { status: true, source: true },
  });
  if (existing?.status === "approved" || existing?.source === "supervisor") {
    counters.skippedApproved++;
    return;
  }
  await prisma.monthlyPerformance.upsert({
    where: { month_companyId_employeeId_ruleId: naturalKey },
    create: { ...naturalKey, ...payload },
    update: payload,
  });
  counters.updated++;
}

/**
 * Obligation dalilidan hisobot/soliq qoidalarini to'ldiradi.
 */
export async function evaluateObligationEvidence(
  periodInput: string,
  now: Date = new Date()
): Promise<ProjectionResult> {
  const perfMonth = toPerformanceMonth(periodInput);
  const monthKey = toObligationMonthKey(periodInput);
  if (!perfMonth || !monthKey) {
    return { processed: 0, updated: 0, skippedApproved: 0, skippedNeutral: 0 };
  }

  const obligations = await prisma.obligation.findMany({
    // periodKey "2026-M07" — `contains: "2026-07"` hech qachon mos kelmasdi.
    where: { periodKey: monthKey, responsibleUserId: { not: null } },
    select: {
      companyId: true,
      responsibleUserId: true,
      status: true,
      dueAt: true,
      completedAt: true,
      delayReason: true,
      delayApprovedById: true,
      template: { select: { code: true } },
    },
  });

  // Qoidalarni BIR marta yuklaymiz — sikl ichida findUnique N+1 berardi.
  const ruleNames = [...new Set(Object.values(TEMPLATE_CODE_TO_RULE_NAME))];
  const rules = await prisma.kpiRule.findMany({ where: { name: { in: ruleNames } } });
  const ruleByName = new Map(rules.map((r) => [r.name, r]));

  const counters = { updated: 0, skippedApproved: 0 };
  let skippedNeutral = 0;

  for (const ob of obligations) {
    const ruleName = TEMPLATE_CODE_TO_RULE_NAME[ob.template.code];
    const rule = ruleName ? ruleByName.get(ruleName) : undefined;
    if (!rule) continue;

    const verdict = verdictForObligation(ob, now);
    if (!verdict) {
      skippedNeutral++;
      continue;
    }

    const score = computeRuleScore(rule as never, { selectedOption: verdict });
    await upsertSystemProposal(
      {
        month: perfMonth,
        companyId: ob.companyId,
        employeeId: ob.responsibleUserId!,
        ruleId: rule.id,
      },
      {
        selectedOption: verdict,
        value: new Prisma.Decimal(verdict === "green" ? 1 : verdict === "red" ? -1 : 0),
        calculatedScore: new Prisma.Decimal(score.percent),
        source: "system",
        status: "submitted",
        submittedAt: now,
        notes: `Muddat dalili — ${ob.template.code}: ${ob.status}, muddat ${ob.dueAt
          .toISOString()
          .slice(0, 10)}`,
      },
      counters
    );
  }

  return {
    processed: obligations.length,
    updated: counters.updated,
    skippedApproved: counters.skippedApproved,
    skippedNeutral,
  };
}

/**
 * Davomatdan kelish/kechikish/yo'qlik qoidalarini to'ldiradi.
 *
 * Hisoblash `lib/attendance.ts` `aggregateMonthlyAttendance` orqali — 08:30/09:00
 * chegaralari, `excused` ni jarimadan chiqarish va checkIn'siz kunlar mantiqi
 * o'sha yerda test qilingan. Bu yerda qayta yozilsa, ikki xil javob chiqardi.
 */
export async function evaluateAttendanceEvidence(
  periodInput: string,
  now: Date = new Date()
): Promise<ProjectionResult> {
  const perfMonth = toPerformanceMonth(periodInput);
  const ym = toYearMonthKey(periodInput);
  if (!perfMonth || !ym) {
    return { processed: 0, updated: 0, skippedApproved: 0, skippedNeutral: 0 };
  }

  const [year, month] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const records = await prisma.attendance.findMany({
    where: { date: { gte: start, lt: end } },
    select: {
      userId: true,
      status: true,
      checkIn: true,
      lateMinutes: true,
      user: { select: { role: true } },
    },
    orderBy: { date: "asc" },
  });

  const byUser = new Map<string, { role: string; rows: typeof records }>();
  for (const rec of records) {
    const entry = byUser.get(rec.userId) ?? { role: rec.user.role as string, rows: [] };
    entry.rows.push(rec);
    byUser.set(rec.userId, entry);
  }

  const wantedRules = [
    ...Object.values(ATTENDANCE_RULE_BY_USER_ROLE),
    ...Object.values(ABSENCE_RULE_BY_USER_ROLE),
  ];
  const rules = await prisma.kpiRule.findMany({ where: { name: { in: wantedRules } } });
  const ruleByName = new Map(rules.map((r) => [r.name, r]));

  const companies = await prisma.company.findMany({
    where: { isActive: true },
    select: { id: true, accountantId: true, bankClientId: true, supervisorId: true },
  });

  const counters = { updated: 0, skippedApproved: 0 };
  let skippedNeutral = 0;

  for (const [userId, entry] of byUser.entries()) {
    const summary = aggregateMonthlyAttendance(entry.rows);

    const userCompanies = companies.filter(
      (c) => c.accountantId === userId || c.bankClientId === userId || c.supervisorId === userId
    );
    if (userCompanies.length === 0) {
      skippedNeutral++;
      continue;
    }

    const jobs: { ruleName?: string; input: Parameters<typeof computeRuleScore>[1] }[] = [
      {
        ruleName: ATTENDANCE_RULE_BY_USER_ROLE[entry.role],
        // KpiEntryInput counters kalitlari qoidaning options kalitlari bilan bir
        // xil bo'lishi SHART — aks holda computeRuleScore jimgina 0 qaytaradi.
        input: {
          counters: {
            early_days: summary.earlyDays,
            late_5min: Math.floor(summary.lateMinutes / 5),
          },
        },
      },
      {
        ruleName: ABSENCE_RULE_BY_USER_ROLE[entry.role],
        input: { counters: { absent_days: summary.absentDays } },
      },
    ];

    for (const job of jobs) {
      const rule = job.ruleName ? ruleByName.get(job.ruleName) : undefined;
      if (!rule) continue;

      const score = computeRuleScore(rule as never, job.input);
      for (const comp of userCompanies) {
        await upsertSystemProposal(
          { month: perfMonth, companyId: comp.id, employeeId: userId, ruleId: rule.id },
          {
            earlyDays: summary.earlyDays,
            lateMinutes: summary.lateMinutes,
            absentDays: summary.absentDays,
            value: new Prisma.Decimal(score.percent > 0 ? 1 : score.percent < 0 ? -1 : 0),
            calculatedScore: new Prisma.Decimal(score.percent),
            source: "system",
            status: "submitted",
            submittedAt: now,
            notes: `Davomat dalili — ${summary.earlyDays} erta kun, ${summary.lateMinutes} daq kechikish, ${summary.absentDays} kelmagan kun`,
          },
          counters
        );
      }
    }
  }

  return {
    processed: byUser.size,
    updated: counters.updated,
    skippedApproved: counters.skippedApproved,
    skippedNeutral,
  };
}

/**
 * Bot javob-vaqti ledgeridan (`KpiEvent` type='response') guruh-reglament
 * qoidalarini to'ldiradi.
 *
 * Mantiq server/botKpiProjection.ts dan KO'CHIRILDI, chunki oylik BullMQ job'da
 * `auth()` yo'q — server action'ni worker chaqira olmaydi. Server action endi
 * shu funksiyaning ustidagi ruxsat qobig'i.
 */
export async function evaluateResponseEvidence(
  periodInput: string,
  opts: { submittedBy?: string; now?: Date } = {}
) {
  const now = opts.now ?? new Date();
  const perfMonth = toPerformanceMonth(periodInput);
  const periodMonth = toYearMonthKey(periodInput);
  if (!perfMonth || !periodMonth) {
    return { groups: 0, written: 0, skippedApproved: 0, skippedNeutral: 0 };
  }

  const events = await prisma.kpiEvent.findMany({
    where: { type: "response", periodMonth, companyId: { not: null } },
    select: { employeeId: true, companyId: true, points: true, meta: true },
  });

  interface Group {
    employeeId: string;
    companyId: string;
    role: string;
    onTime: number;
    late: number;
  }
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

  const ruleNames = [...new Set(Object.values(RESPONSE_RULE_BY_ROLE))];
  const rules = await prisma.kpiRule.findMany({ where: { name: { in: ruleNames } } });
  const ruleByName = new Map(rules.map((r) => [r.name, r]));

  const counters = { updated: 0, skippedApproved: 0 };
  let skippedNeutral = 0;

  for (const g of groups.values()) {
    const ruleName = RESPONSE_RULE_BY_ROLE[g.role];
    const rule = ruleName ? ruleByName.get(ruleName) : undefined;
    if (!rule) continue;

    const color = responseColorFromCounts(g.onTime, g.late);
    if (!color) {
      skippedNeutral++;
      continue;
    }

    const score = computeRuleScore(rule as never, { selectedOption: color });
    await upsertSystemProposal(
      { month: perfMonth, companyId: g.companyId, employeeId: g.employeeId, ruleId: rule.id },
      {
        selectedOption: color,
        earlyDays: 0,
        lateMinutes: 0,
        absentDays: 0,
        penaltyAmount: new Prisma.Decimal(0),
        value: new Prisma.Decimal(color === "green" ? 1 : color === "red" ? -1 : 0),
        calculatedScore: new Prisma.Decimal(score.percent),
        source: "bot",
        status: "submitted",
        ...(opts.submittedBy ? { submittedBy: opts.submittedBy } : {}),
        submittedAt: now,
        notes: `Bot: ${g.onTime} o'z vaqtida, ${g.late} kechikish (KPI ledger)`,
      },
      counters
    );
  }

  return {
    groups: groups.size,
    written: counters.updated,
    skippedApproved: counters.skippedApproved,
    skippedNeutral,
  };
}
