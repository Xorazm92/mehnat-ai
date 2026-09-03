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
import { computeRuleScore, applyRuleOverride, type KpiRuleLike } from "@/lib/kpiScoring";
import { aggregateMonthlyAttendance, countWorkdays } from "@/lib/attendance";
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
 * KPI dan CHIQARILADI.
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

/**
 * Oydagi HAR ish kuni 08:30 gacha kelinganda beriladigan to'liq bonusga yetadigan
 * kun soni.
 *
 * Reglament: "+0.04% (бир ой давомида узлуксиз 08.30 дан олдин келиш махимал 1%)".
 * Kunbay qadam uzilish bo'lganda ham saqlanadi — bir kun kechikkan odam butun
 * bonusdan mahrum bo'lmaydi. Lekin oyda 25 ish kuni bo'lmagani uchun (20-22)
 * sof arifmetika 0.04 × 20 = 0.80% da to'xtardi va va'da qilingan 1% ga hech
 * kim, hech qachon yeta olmasdi. Shuning uchun uzilishsiz oyda counter shiftga
 * yetkaziladi; clampCounter uni max_coeff da to'xtatadi, ya'ni 1% dan oshmaydi.
 *
 * Kun soni qoidaning O'ZIDAN olinadi (max_coeff / coeff_per_unit) — koeffitsiyent
 * o'zgarsa bu yer ham o'zi ergashadi.
 */
export function earlyDaysForFullBonus(rule?: { options: unknown }): number {
  const opts = Array.isArray(rule?.options)
    ? (rule!.options as { key?: string; coeff_per_unit?: number; max_coeff?: number | null }[])
    : [];
  const early = opts.find((o) => o.key === "early_days");
  const per = Number(early?.coeff_per_unit ?? 0);
  const cap = Number(early?.max_coeff ?? 0);
  if (!per || !cap) return 0;
  return Math.ceil(cap / per);
}

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

interface Proposal {
  key: PerformanceNaturalKey;
  payload: SystemProposalPayload;
}

const keyOf = (companyId: string, employeeId: string, ruleId: string) =>
  `${companyId}|${employeeId}|${ruleId}`;

/** Har bir yozuv uchun bittadan so'rov 2 000+ qatorli oyda daqiqalarga cho'zilardi. */
const WRITE_CHUNK = 250;

/**
 * Takliflarni bir marta o'qib, bir necha paketda yozadi.
 *
 * Avval har qator uchun alohida `findUnique` + `upsert` qilinardi — 2 359 ta
 * majburiyatda 4 700 dan ortiq ketma-ket so'rov, ~4 sekund; 53 ustunli to'liq
 * oyda bu server action time-out'iga olib borardi. Endi: mavjud qatorlar BIR
 * so'rovda o'qiladi, himoyalanganlari xotirada ajratiladi, qolgani
 * `$transaction` paketlarida yoziladi.
 *
 * Himoya qoidasi o'zgarmaydi: `approved` yoki `source='supervisor'` qatorga
 * tegilmaydi (ADR-0001).
 */
async function flushProposals(
  month: string,
  proposals: Proposal[]
): Promise<{ updated: number; skippedApproved: number }> {
  if (proposals.length === 0) return { updated: 0, skippedApproved: 0 };

  const existing = await prisma.monthlyPerformance.findMany({
    where: { month },
    select: { companyId: true, employeeId: true, ruleId: true, status: true, source: true },
  });

  const locked = new Set<string>();
  for (const e of existing) {
    if (e.status === "approved" || e.source === "supervisor") {
      locked.add(keyOf(e.companyId, e.employeeId, e.ruleId));
    }
  }

  const writable = proposals.filter(
    (p) => !locked.has(keyOf(p.key.companyId, p.key.employeeId, p.key.ruleId))
  );
  const skippedApproved = proposals.length - writable.length;

  for (let i = 0; i < writable.length; i += WRITE_CHUNK) {
    const chunk = writable.slice(i, i + WRITE_CHUNK);
    await prisma.$transaction(
      chunk.map((p) =>
        prisma.monthlyPerformance.upsert({
          where: { month_companyId_employeeId_ruleId: p.key },
          create: { ...p.key, ...p.payload },
          update: p.payload,
        })
      )
    );
  }

  return { updated: writable.length, skippedApproved };
}

/**
 * Firma bo'yicha override'larni bir so'rovda o'qib, `companyId|ruleId` xaritasini beradi.
 *
 * Sikl ichida `findUnique` qilinsa 2 000+ majburiyatli oyda N+1 bo'lardi.
 * Davomat qoidalari (`scope: 'global'`) ataylab bu yerdan o'tmaydi — ular
 * firmaga emas, odamning oyiga tegishli.
 */
async function loadOverrides(ruleIds: string[]) {
  if (ruleIds.length === 0) return new Map<string, KpiRuleOverrideRow>();
  const rows = await prisma.companyKpiRule.findMany({
    where: { ruleId: { in: ruleIds } },
    select: { companyId: true, ruleId: true, isActive: true, rewardPercent: true, penaltyPercent: true },
  });
  return new Map(
    rows.map((r) => [
      `${r.companyId}|${r.ruleId}`,
      {
        isActive: r.isActive,
        rewardPercent: r.rewardPercent === null ? null : Number(r.rewardPercent),
        penaltyPercent: r.penaltyPercent === null ? null : Number(r.penaltyPercent),
      },
    ])
  );
}

type KpiRuleOverrideRow = {
  isActive: boolean;
  rewardPercent: number | null;
  penaltyPercent: number | null;
};

/** Qoida + firma override'i → hisobga tayyor qoida. */
const ruleFor = (
  rule: unknown,
  overrides: Map<string, KpiRuleOverrideRow>,
  companyId: string,
  ruleId: string
): KpiRuleLike =>
  applyRuleOverride(rule as KpiRuleLike, overrides.get(`${companyId}|${ruleId}`) ?? null);

/**
 * Bir nechta majburiyat BITTA qoidaga tushganda yakuniy baho.
 *
 * Masalan QQS, INPS, daromad-agent va soliq-jadvali — to'rttasi ham
 * `acc_taxes_report` ga tegishli, ya'ni bir xil (oy, firma, xodim, qoida)
 * kalitiga yozadi. Avval oxirgi ishlangani g'olib bo'lardi va natija sikl
 * tartibiga bog'liq — INPS kechikkan bo'lsa ham QQS o'z vaqtida bo'lgani uchun
 * yashil chiqib ketishi mumkin edi.
 *
 * Reglament: "hisobotlar vaqtida topshirilmaganligi uchun jarima" — bittasi
 * kechiksa ham kechikkan hisoblanadi, shuning uchun ENG YOMONI g'olib.
 */
export function combineVerdicts(verdicts: EvidenceVerdict[]): EvidenceVerdict | null {
  if (verdicts.length === 0) return null;
  if (verdicts.includes("red")) return "red";
  if (verdicts.includes("yellow")) return "yellow";
  return "green";
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

  let skippedNeutral = 0;

  // Bir kalitga bir nechta majburiyat tushadi (4 ta soliq shabloni →
  // acc_taxes_report), shuning uchun avval YIG'AMIZ, keyin bitta baho chiqaramiz.
  interface Bucket {
    key: PerformanceNaturalKey;
    ruleId: string;
    verdicts: EvidenceVerdict[];
    evidence: string[];
  }
  const buckets = new Map<string, Bucket>();

  for (const ob of obligations) {
    const ruleName = TEMPLATE_CODE_TO_RULE_NAME[ob.template.code];
    const rule = ruleName ? ruleByName.get(ruleName) : undefined;
    if (!rule) continue;

    const verdict = verdictForObligation(ob, now);
    if (!verdict) {
      skippedNeutral++;
      continue;
    }

    const k = keyOf(ob.companyId, ob.responsibleUserId!, rule.id);
    const bucket =
      buckets.get(k) ??
      {
        key: {
          month: perfMonth,
          companyId: ob.companyId,
          employeeId: ob.responsibleUserId!,
          ruleId: rule.id,
        },
        ruleId: rule.id,
        verdicts: [],
        evidence: [],
      };
    bucket.verdicts.push(verdict);
    bucket.evidence.push(
      `${ob.template.code}: ${verdict === "green" ? "o'z vaqtida" : "kechikdi"} (muddat ${ob.dueAt
        .toISOString()
        .slice(0, 10)})`
    );
    buckets.set(k, bucket);
  }

  const overrides = await loadOverrides(rules.map((r) => r.id));

  const proposals: Proposal[] = [];
  for (const bucket of buckets.values()) {
    const verdict = combineVerdicts(bucket.verdicts);
    if (!verdict) continue;
    const rule = rules.find((r) => r.id === bucket.ruleId);
    if (!rule) continue;

    const score = computeRuleScore(
      ruleFor(rule, overrides, bucket.key.companyId, rule.id),
      { selectedOption: verdict }
    );
    proposals.push({
      key: bucket.key,
      payload: {
        selectedOption: verdict,
        value: new Prisma.Decimal(verdict === "green" ? 1 : verdict === "red" ? -1 : 0),
        calculatedScore: new Prisma.Decimal(score.percent),
        source: "system",
        status: "submitted",
        submittedAt: now,
        // Nazoratchi nega qizil ekanini ko'rsin — qaysi hisobot kechikkani.
        notes: `Muddat dalili — ${bucket.evidence.join("; ")}`,
      },
    });
  }

  const res = await flushProposals(perfMonth, proposals);
  return {
    processed: obligations.length,
    updated: res.updated,
    skippedApproved: res.skippedApproved,
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
      lateExcused: true,
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

  const proposals: Proposal[] = [];
  let skippedNeutral = 0;

  for (const [userId, entry] of byUser.entries()) {
    const summary = aggregateMonthlyAttendance(
      entry.rows,
      undefined,
      countWorkdays(year, month),
    );

    const userCompanies = companies.filter(
      (c) => c.accountantId === userId || c.bankClientId === userId || c.supervisorId === userId
    );
    if (userCompanies.length === 0) {
      skippedNeutral++;
      continue;
    }

    const attendanceRule = ruleByName.get(ATTENDANCE_RULE_BY_USER_ROLE[entry.role] ?? "");

    const jobs: { ruleName?: string; input: Parameters<typeof computeRuleScore>[1] }[] = [
      {
        ruleName: ATTENDANCE_RULE_BY_USER_ROLE[entry.role],
        // KpiEntryInput counters kalitlari qoidaning options kalitlari bilan bir
        // xil bo'lishi SHART — aks holda computeRuleScore jimgina 0 qaytaradi.
        input: {
          counters: {
            early_days: summary.allEarly
              ? earlyDaysForFullBonus(attendanceRule)
              : summary.earlyDays,
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
        proposals.push({
          key: { month: perfMonth, companyId: comp.id, employeeId: userId, ruleId: rule.id },
          payload: {
            earlyDays: summary.earlyDays,
            lateMinutes: summary.lateMinutes,
            absentDays: summary.absentDays,
            value: new Prisma.Decimal(score.percent > 0 ? 1 : score.percent < 0 ? -1 : 0),
            calculatedScore: new Prisma.Decimal(score.percent),
            source: "system",
            status: "submitted",
            submittedAt: now,
            notes:
              `Davomat dalili — ${summary.earlyDays} erta kun` +
              (summary.allEarly ? " (uzilishsiz oy — to'liq bonus)" : "") +
              `, ${summary.lateMinutes} daq kechikish` +
              (summary.excusedLateDays ? ` (${summary.excusedLateDays} kun uzrli)` : "") +
              `, ${summary.absentDays} kelmagan kun`,
          },
        });
      }
    }
  }

  // Dalili YO'Q bo'lib qolgan taklifni o'chirish. Davomat yozuvlari qayta
  // import qilinganda (masalan soxta 'kelmagan' qatorlari tozalanganda) xodim
  // umuman yozuvsiz qolishi mumkin — u holda sikl uni ko'rmaydi va eski
  // taklifi (masalan -20%) MonthlyPerformance da jimgina qolib ketardi.
  // Tasdiqlangani tegilmaydi.
  await prisma.monthlyPerformance.deleteMany({
    where: {
      month: perfMonth,
      source: "system",
      status: { not: "approved" },
      rule: { category: "attendance" },
      employeeId: { notIn: [...byUser.keys()] },
    },
  });

  const res = await flushProposals(perfMonth, proposals);
  return {
    processed: byUser.size,
    updated: res.updated,
    skippedApproved: res.skippedApproved,
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

  const overrides = await loadOverrides(rules.map((r) => r.id));

  const proposals: Proposal[] = [];
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

    // Reglament buxgalter va bank klient uchun "хар сафар -0.5%" deydi — har
    // bir kechikkan javob alohida sanaladi. Shu ikki qoida `counter` ga
    // o'tkazilgan; nazoratchida esa matn "хар сафар" demaydi, shuning uchun u
    // uch holatli `select` bo'lib qoladi.
    const isCounter = rule.inputTypeV2 === "counter";
    const input = isCounter
      ? {
          counters: {
            // Uzilishsiz oy — to'liq bonus; bitta kechikish ham bo'lsa bonus yo'q.
            ontime_month: g.late === 0 && g.onTime > 0 ? 1 : 0,
            late_responses: g.late,
          },
        }
      : { selectedOption: color };

    const score = computeRuleScore(ruleFor(rule, overrides, g.companyId, rule.id), input);
    proposals.push({
      key: { month: perfMonth, companyId: g.companyId, employeeId: g.employeeId, ruleId: rule.id },
      payload: {
        selectedOption: isCounter ? null : color,
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
        notes:
          `Bot: ${g.onTime} o'z vaqtida, ${g.late} kechikish (KPI ledger)` +
          (isCounter && g.late > 0 ? ` — har safar uchun ${g.late} × -0.5%` : ""),
      },
    });
  }

  const res = await flushProposals(perfMonth, proposals);
  return {
    groups: groups.size,
    written: res.updated,
    skippedApproved: res.skippedApproved,
    skippedNeutral,
  };
}
