"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isSeniorRole, isAdminRole } from "@/lib/platform/permissions";
import { companyScopeWhere, staffScopeFilter, assertCompanyPermission } from "@/lib/platform/access";
import { recordAuditLog } from "@/lib/platform/auditTrail";
import { serialize } from "@/lib/serialize";
import { computeRuleScore, type KpiEntryInput } from "@/lib/kpiScoring";
import { toPerformanceMonth } from "@/lib/periods";
import { Prisma } from "@prisma/client";

// =====================================================
// KPI RULES
// =====================================================

export async function getKpiRules() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  return serialize(
    await prisma.kpiRule.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    })
  );
}

// Percent columns are Decimal(5,2): value must fit -999.99..999.99, otherwise
// Prisma throws P2020 (ValueOutOfRange) -> unhandled 500. Validate up front so
// bad input surfaces as a clear, catchable error instead.
function assertPercent(label: string, v: number | undefined) {
  if (v === undefined || v === null) return;
  if (typeof v !== "number" || Number.isNaN(v)) {
    throw new Error(`${label} raqam bo'lishi kerak`);
  }
  if (v < 0 || v > 999.99) {
    throw new Error(`${label} 0 va 999.99 oralig'ida bo'lishi kerak`);
  }
}

// KPI v2 rule fields (three-state options-based)
export interface KpiRuleV2Input {
  descriptionUz?: string;
  inputTypeV2?: string; // 'select' | 'counter' | 'checkbox_bonus' | 'checkbox_penalty' | 'amount_penalty'
  scope?: string; // 'global' | 'per_company' | 'per_group'
  maxBonus?: number | null;
  maxPenalty?: number | null;
  options?: unknown; // KpiOption[]
}

export async function createKpiRule(data: {
  name: string;
  nameUz: string;
  role: string;
  rewardPercent: number;
  penaltyPercent: number;
  inputType: string;
  category: string;
  description?: string;
  sortOrder?: number;
} & KpiRuleV2Input) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isAdminRole(role)) throw new Error("KPI qoidalarini faqat administrator tahrirlashi mumkin");

  assertPercent("Mukofot foizi", data.rewardPercent);
  assertPercent("Jarima foizi", data.penaltyPercent);

  const { options, maxBonus, maxPenalty, ...rest } = data;
  const created = await prisma.kpiRule.create({
    data: {
      ...rest,
      ...(options !== undefined ? { options: options as Prisma.InputJsonValue } : {}),
      ...(maxBonus !== undefined ? { maxBonus: maxBonus === null ? null : new Prisma.Decimal(maxBonus) } : {}),
      ...(maxPenalty !== undefined ? { maxPenalty: maxPenalty === null ? null : new Prisma.Decimal(maxPenalty) } : {}),
    },
  });

  await recordAuditLog({
    userId: session.user.id,
    action: "create",
    tableName: "KpiRule",
    recordId: created.id,
    newData: { name: data.name, role: data.role, rewardPercent: data.rewardPercent, penaltyPercent: data.penaltyPercent },
  });

  return serialize(created);
}

export async function updateKpiRule(id: string, data: Partial<{
  nameUz: string;
  rewardPercent: number;
  penaltyPercent: number;
  isActive: boolean;
  sortOrder: number;
  description: string;
  category: string;
}> & KpiRuleV2Input) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isAdminRole(role)) throw new Error("KPI qoidalarini faqat administrator tahrirlashi mumkin");

  assertPercent("Mukofot foizi", data.rewardPercent);
  assertPercent("Jarima foizi", data.penaltyPercent);

  const { options, maxBonus, maxPenalty, ...rest } = data;
  const before = await prisma.kpiRule.findUnique({
    where: { id },
    select: { name: true, rewardPercent: true, penaltyPercent: true, isActive: true },
  });
  const updated = await prisma.kpiRule.update({
    where: { id },
    data: {
      ...rest,
      ...(options !== undefined ? { options: options as Prisma.InputJsonValue } : {}),
      ...(maxBonus !== undefined ? { maxBonus: maxBonus === null ? null : new Prisma.Decimal(maxBonus) } : {}),
      ...(maxPenalty !== undefined ? { maxPenalty: maxPenalty === null ? null : new Prisma.Decimal(maxPenalty) } : {}),
    },
  });

  await recordAuditLog({
    userId: session.user.id,
    action: "update",
    tableName: "KpiRule",
    recordId: id,
    oldData: before
      ? { name: before.name, rewardPercent: Number(before.rewardPercent), penaltyPercent: Number(before.penaltyPercent), isActive: before.isActive }
      : undefined,
    newData: { rewardPercent: data.rewardPercent, penaltyPercent: data.penaltyPercent, isActive: data.isActive },
  });

  return serialize(updated);
}

export async function deleteKpiRule(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!isAdminRole(role)) throw new Error("KPI qoidalarini faqat administrator tahrirlashi mumkin");

  const existing = await prisma.kpiRule.findUnique({ where: { id }, select: { name: true, nameUz: true } });
  const deleted = await prisma.kpiRule.delete({ where: { id } });

  await recordAuditLog({
    userId: session.user.id,
    action: "delete",
    tableName: "KpiRule",
    recordId: id,
    oldData: { name: existing?.name, nameUz: existing?.nameUz },
  });

  return serialize(deleted);
}

// =====================================================
// MONTHLY PERFORMANCE (KPI entries)
// =====================================================

async function findPerformance(opts: {
  month: string;
  /** Bitta id, yoki portfeldagi xodimlar ro'yxati (lib/access.ts staffScopeFilter). */
  employeeId?: string | { in: string[] };
  approvedOnly: boolean;
}) {
  const monthKey = toPerformanceMonth(opts.month) || opts.month;
  return serialize(
    await prisma.monthlyPerformance.findMany({
      where: {
        month: monthKey,
        ...(opts.employeeId ? { employeeId: opts.employeeId } : {}),
        ...(opts.approvedOnly ? { status: "approved" } : {}),
      },
      include: {
        rule: true,
        employee: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { recordedAt: "desc" },
    })
  );
}

/**
 * Monthly Performance as CONTEXT.md defines it — "the record that payroll reads".
 * Approved only. Drafts and self-assessments are proposals, not performance, and
 * ADR-0001 is explicit that nothing pays on them.
 *
 * Reviewing proposals is a different question: use getPerformanceForReview.
 */
export async function getMonthlyPerformance(month: string, employeeId?: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const role = session.user.role as string;

  // Non-senior users can only see their own; senior — portfelidagi xodimlar.
  const targetEmployeeId = await staffScopeFilter(prisma, { id: userId, role }, employeeId);

  return findPerformance({ month, employeeId: targetEmployeeId, approvedOnly: true });
}

/**
 * Every Monthly Performance row for the month whatever its status — the Supervisor's
 * checklist needs to see a proposal in order to act on it. Never feed this to payroll.
 */
export async function getPerformanceForReview(month: string, employeeId?: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;
  const role = session.user.role as string;
  const targetEmployeeId = await staffScopeFilter(prisma, { id: userId, role }, employeeId);
  const monthKey = toPerformanceMonth(month) || month;

  // Ataylab SLIM: bu ekran oyning HAMMA qatorini oladi (2026-07 da 5 644 ta).
  // `include: { rule: true }` har qator bilan qoidaning `options` JSON'ini
  // takrorlab, javobni ~4.8 MB ga shishirardi — nazoratchi oyni almashtirgan
  // har safar. Checklist qoidalarni getKpiRules() orqali alohida yuklaydi va
  // `perf.rule` ga umuman tegmaydi.
  return serialize(
    await prisma.monthlyPerformance.findMany({
      where: {
        month: monthKey,
        ...(targetEmployeeId ? { employeeId: targetEmployeeId } : {}),
      },
      select: {
        id: true,
        month: true,
        companyId: true,
        employeeId: true,
        ruleId: true,
        value: true,
        calculatedScore: true,
        selectedOption: true,
        earlyDays: true,
        lateMinutes: true,
        absentDays: true,
        penaltyAmount: true,
        source: true,
        status: true,
        notes: true,
      },
      orderBy: { recordedAt: "desc" },
    })
  );
}

export async function upsertPerformance(data: {
  month: string;
  companyId: string;
  employeeId: string;
  ruleId: string;
  // KPI v2 inputs (score is computed server-side from these)
  selectedOption?: string | null;
  earlyDays?: number;
  lateMinutes?: number;
  absentDays?: number;
  penaltyAmount?: number;
  source?: string;
  notes?: string;
  status?: string; // 'submitted' (default) | 'approved' — supervisor entries are authoritative
  // Legacy fallbacks (used only if the rule has no v2 options)
  value?: number;
  calculatedScore?: number;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const submittedBy = session.user.id;
  const callerRole = session.user.role as string;

  // Senior bo'lmagan xodim faqat O'ZI uchun, faqat 'submitted' holatda yozadi —
  // boshqa xodimga baho qo'yish yoki o'z bahosini 'approved' qilish mumkin emas.
  //
  // Senior o'ZIGA baho qo'yayotgan bo'lsa ham xuddi shu chegara: nazoratchi
  // o'zi buxgalteri bo'lgan firmada o'z KPI'sini "approved" qilib qo'ya olardi.
  if (!isSeniorRole(callerRole) || (data.employeeId === submittedBy && !isAdminRole(callerRole))) {
    if (data.employeeId !== submittedBy) throw new Error("Forbidden");
    data.status = "submitted";
    data.source = "employee";
  } else {
    // Senior kiritishida ham holat mashinasidan tashqari qiymat bazaga kirmasin.
    if (data.status !== undefined && !["draft", "submitted", "approved"].includes(data.status)) {
      throw new Error("KPI holati noto'g'ri");
    }
    if (data.source !== undefined && !["employee", "supervisor", "chief", "system"].includes(data.source)) {
      throw new Error("KPI manbasi noto'g'ri");
    }
  }

  const rule = await prisma.kpiRule.findUnique({ where: { id: data.ruleId } });
  if (!rule) throw new Error("KPI qoidasi topilmadi");

  // Compute the score from the v2 rule options when available.
  const opts = Array.isArray(rule.options) ? rule.options : [];
  const useV2 = opts.length > 0;

  const input: KpiEntryInput = {
    selectedOption: data.selectedOption ?? null,
    counters: {
      early_days: data.earlyDays ?? 0,
      late_5min: Math.floor((data.lateMinutes ?? 0) / 5),
      absent_days: data.absentDays ?? 0,
    },
    penaltyAmount: data.penaltyAmount ?? 0,
  };
  const score = useV2 ? computeRuleScore(rule as never, input) : null;

  const calculatedScore = score ? score.percent : data.calculatedScore ?? 0;
  const value =
    data.value ??
    (score ? (score.color === "green" ? 1 : score.color === "red" ? -1 : 0) : 0);

  const monthKey = toPerformanceMonth(data.month) || data.month;

  const payload = {
    month: monthKey,
    companyId: data.companyId,
    employeeId: data.employeeId,
    ruleId: data.ruleId,
    selectedOption: data.selectedOption ?? null,
    earlyDays: data.earlyDays ?? 0,
    lateMinutes: data.lateMinutes ?? 0,
    absentDays: data.absentDays ?? 0,
    penaltyAmount: new Prisma.Decimal(data.penaltyAmount ?? 0),
    value: new Prisma.Decimal(value),
    calculatedScore: new Prisma.Decimal(calculatedScore),
    source: data.source ?? "supervisor",
    notes: data.notes,
    submittedBy,
    submittedAt: new Date(),
    status: data.status ?? "submitted",
    ...(data.status === "approved"
      ? { approvedBy: session.user.id, approvedAt: new Date() }
      : {}),
  };

  // One row per (month, company, employee, rule) — enforced by @@unique. Who may
  // mutate an existing row depends on the WRITER, not on the row's status (ADR-0001:
  // the rollup "may only ever touch rows that are still draft-and-system", while
  // "a Supervisor's edit mutates that same row"). Keying this guard on status instead
  // of source is what produced 281 duplicate rows and paid an accountant zero — ADR-0004.
  // month is normalised above so "2026-07" and "2026-07-01" collide on the constraint
  // instead of silently becoming two rows that both charge the same penalty.
  const naturalKey = {
    month: monthKey,
    companyId: data.companyId,
    employeeId: data.employeeId,
    ruleId: data.ruleId,
  };

  const existing = await prisma.monthlyPerformance.findUnique({
    where: { month_companyId_employeeId_ruleId: naturalKey },
    select: { id: true, status: true, source: true },
  });

  if (existing) {
    const writerIsSystem = payload.source === "system";
    // The bot proposes; it never overrides a human. It may only revise a draft it owns.
    if (writerIsSystem && !(existing.status === "draft" && existing.source === "system")) {
      return serialize(await prisma.monthlyPerformance.findUniqueOrThrow({ where: { id: existing.id } }));
    }
    // A self-assessment must not overwrite the Supervisor's approved judgment. The old
    // status-keyed guard enforced this by accident (it inserted a duplicate instead);
    // now that writes update in place, it has to be explicit.
    if (!isSeniorRole(callerRole) && existing.status === "approved") {
      throw new Error("Tasdiqlangan KPI yozuvini o'zgartirib bo'lmaydi");
    }
    return serialize(
      await prisma.monthlyPerformance.update({ where: { id: existing.id }, data: payload })
    );
  }

  try {
    return serialize(await prisma.monthlyPerformance.create({ data: payload }));
  } catch (e) {
    // Two concurrent clicks can both miss the findUnique above and race to insert;
    // the constraint rejects the loser, which then behaves as the update it meant to be.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return serialize(
        await prisma.monthlyPerformance.update({
          where: { month_companyId_employeeId_ruleId: naturalKey },
          data: payload,
        })
      );
    }
    throw e;
  }
}

export async function approvePerformance(id: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!["super_admin", "admin", "chief_accountant"].includes(role)) {
    throw new Error("Forbidden");
  }

  // ROL YETARLI EMAS — XODIM SCOPE'i HAM KERAK. Bosh buxgalter ataylab o'z
  // portfeliga cheklangan, lekin bu yerda faqat rol tekshirilgani uchun u
  // BEGONA xodimning KPI'sini tasdiqlay olardi. Tasdiqlangan KPI to'g'ridan-
  // to'g'ri maoshga kiradi, ya'ni bu pulga tegadigan teshik edi.
  const target = await prisma.monthlyPerformance.findUnique({
    where: { id },
    select: { employeeId: true },
  });
  if (!target) throw new Error("KPI yozuvi topilmadi");
  await staffScopeFilter(prisma, { id: session.user.id, role }, target.employeeId);

  const approved = await prisma.monthlyPerformance.update({
    where: { id },
    data: {
      status: "approved",
      approvedBy: session.user.id,
      approvedAt: new Date(),
    },
  });

  // Tasdiqlangan KPI to'g'ridan-to'g'ri maoshga kiradi — kim tasdiqlagani auditda qolsin.
  await recordAuditLog({
    userId: session.user.id,
    action: "update",
    tableName: "MonthlyPerformance",
    recordId: id,
    newData: {
      status: "approved",
      month: approved.month,
      employeeId: approved.employeeId,
      calculatedScore: Number(approved.calculatedScore),
      penaltyAmount: Number(approved.penaltyAmount),
    },
  });

  return serialize(approved);
}

export async function rejectPerformance(id: string, reason: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!["super_admin", "admin", "chief_accountant", "supervisor"].includes(role)) {
    throw new Error("Forbidden");
  }

  // Rad etish ham portfelga cheklanadi — approvePerformance bilan bir xil sabab.
  const target = await prisma.monthlyPerformance.findUnique({
    where: { id },
    select: { employeeId: true },
  });
  if (!target) throw new Error("KPI yozuvi topilmadi");
  await staffScopeFilter(prisma, { id: session.user.id, role }, target.employeeId);

  const rejected = await prisma.monthlyPerformance.update({
    where: { id },
    data: {
      status: "rejected",
      approvedBy: session.user.id,
      approvedAt: new Date(),
      rejectedReason: reason,
    },
  });

  await recordAuditLog({
    userId: session.user.id,
    action: "update",
    tableName: "MonthlyPerformance",
    recordId: id,
    newData: { status: "rejected", rejectedReason: reason, month: rejected.month, employeeId: rejected.employeeId },
  });

  return serialize(rejected);
}
export async function getCompanyKpiRules(companyId: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  // Bungacha bu yerda ATIGI `auth()` bor edi: istalgan tizimga kirgan xodim
  // istalgan firmaning KPI qoidalarini (mukofot/jarima foizlari) o'qiy olardi.
  // O'qish uchun senior bo'lish shart emas — biriktirilgan bo'lish kifoya.
  await assertCompanyPermission(
    prisma,
    { id: session.user.id, role: session.user.role as string },
    companyId,
    "company:kpi-rules:view"
  );

  return serialize(
    await prisma.companyKpiRule.findMany({
      where: { companyId, isActive: true },
      include: { rule: true },
    })
  );
}

export async function upsertCompanyKpiRule(data: {
  id?: string;
  companyId: string;
  ruleId: string;
  rewardPercent?: number | null;
  penaltyPercent?: number | null;
  isActive: boolean;
}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  
  const role = session.user.role as string;
  if (!["super_admin", "admin", "supervisor"].includes(role)) {
    throw new Error("Forbidden");
  }

  // Nazoratchi ham portfelga cheklangan — begona firmaga jarima foizi
  // yozib qo'ya olmaydi.
  await assertCompanyPermission(
    prisma,
    { id: session.user.id, role },
    data.companyId,
    "company:kpi-rules"
  );

  return serialize(
    await prisma.companyKpiRule.upsert({
      where: { companyId_ruleId: { companyId: data.companyId, ruleId: data.ruleId } },
      update: {
        isActive: data.isActive,
        rewardPercent: data.rewardPercent ?? null,
        penaltyPercent: data.penaltyPercent ?? null
      },
      create: {
        companyId: data.companyId,
        ruleId: data.ruleId,
        isActive: data.isActive,
        rewardPercent: data.rewardPercent ?? null,
        penaltyPercent: data.penaltyPercent ?? null
      }
    })
  );
}

// =====================================================
// KPI LEADERBOARD / REYTING (derived 0-100 score)
// =====================================================

export interface KpiLeaderRow {
  employeeId: string;
  name: string;
  role: string;
  ball: number; // 0-100
  daraja: "excellent" | "good" | "fair" | "poor";
  green: number;
  red: number;
  entries: number;
  bonus: number; // so'm
  // Xodimning mezonlar kesimi (javob tezligi, ishga kelish, ...) — har biri 0-100%
  byCategory: { category: string; passPercent: number }[];
}

const darajaOf = (ball: number): KpiLeaderRow["daraja"] =>
  ball >= 85 ? "excellent" : ball >= 70 ? "good" : ball >= 60 ? "fair" : "poor";

export async function getKpiLeaderboard(month: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const userId = session.user.id as string;
  const role = session.user.role as string;
  const isSenior = isSeniorRole(role);
  const scope = companyScopeWhere({ id: userId, role });

  // MonthlyPerformance'da `company` relatsiyasi yo'q (faqat companyId ustuni),
  // shuning uchun avval portfeldagi firma id'lari olinadi.
  const companies = await prisma.company.findMany({
    where: scope,
    select: { id: true, contractAmount: true },
  });
  // Admin uchun scope bo'sh — id ro'yxati bilan cheklamaymiz (213 ta IN o'rniga).
  const companyFilter =
    Object.keys(scope).length === 0
      ? {}
      : { OR: [{ companyId: { in: companies.map((c) => c.id) } }, { employeeId: userId }] };

  const perfs = await prisma.monthlyPerformance.findMany({
    // Approved only. A self-assessed 'submitted' row counting toward the
    // leaderboard's bonusFund would let an employee inflate it unreviewed.
    // Portfeldan tashqaridagi firmalar bo'yicha KPI ko'rinmaydi (o'zinikidan
    // tashqari) — ilgari reyting butun tizim bo'ylab ochiq edi.
    where: {
      month,
      status: "approved",
      ...companyFilter,
    },
    select: {
      employeeId: true,
      companyId: true,
      selectedOption: true,
      calculatedScore: true,
      employee: { select: { fullName: true, role: true } },
      rule: { select: { category: true } },
    },
  });

  const contractOf = new Map(companies.map((c) => [c.id, Number(c.contractAmount) || 0]));

  type Agg = { name: string; role: string; green: number; red: number; entries: number; bonus: number };
  const byEmp = new Map<string, Agg>();
  const catAgg = new Map<string, { green: number; scored: number }>();
  // Har xodim uchun mezon kesimi: employeeId → (category → {green, scored})
  const byEmpCat = new Map<string, Map<string, { green: number; scored: number }>>();

  for (const p of perfs) {
    const a =
      byEmp.get(p.employeeId) ??
      byEmp.set(p.employeeId, { name: p.employee.fullName, role: p.employee.role, green: 0, red: 0, entries: 0, bonus: 0 }).get(p.employeeId)!;
    a.entries++;
    const sc = Number(p.calculatedScore);
    if (sc > 0) {
      a.green++;
      a.bonus += ((contractOf.get(p.companyId) ?? 0) * sc) / 100;
    } else if (sc < 0 || p.selectedOption === "red") a.red++;

    const cat = p.rule.category || "other";
    const c = catAgg.get(cat) ?? catAgg.set(cat, { green: 0, scored: 0 }).get(cat)!;
    if (sc > 0) { c.green++; c.scored++; }
    else if (sc < 0 || p.selectedOption === "red") c.scored++;

    // Per-employee kesim
    const empCat = byEmpCat.get(p.employeeId) ?? byEmpCat.set(p.employeeId, new Map()).get(p.employeeId)!;
    const ec = empCat.get(cat) ?? empCat.set(cat, { green: 0, scored: 0 }).get(cat)!;
    if (sc > 0) { ec.green++; ec.scored++; }
    else if (sc < 0 || p.selectedOption === "red") ec.scored++;
  }

  const leaderboard: KpiLeaderRow[] = [...byEmp.entries()].map(([employeeId, a]) => {
    const scored = a.green + a.red;
    const ball = scored > 0 ? Math.round((a.green / scored) * 100) : a.entries > 0 ? 100 : 0;
    const byCategory = [...(byEmpCat.get(employeeId)?.entries() ?? [])]
      .filter(([, c]) => c.scored > 0)
      .map(([category, c]) => ({ category, passPercent: Math.round((c.green / c.scored) * 100) }))
      .sort((x, y) => y.passPercent - x.passPercent);
    const finalBonus = isSenior ? Math.round(a.bonus) : 0;
    return { employeeId, name: a.name, role: a.role, ball, daraja: darajaOf(ball), green: a.green, red: a.red, entries: a.entries, bonus: finalBonus, byCategory };
  });
  leaderboard.sort((x, y) => y.ball - x.ball || y.bonus - x.bonus);

  const withScores = leaderboard.filter((l) => l.entries > 0);
  const avgBall = withScores.length ? Math.round(withScores.reduce((s, l) => s + l.ball, 0) / withScores.length) : 0;

  const criteria = [...catAgg.entries()]
    .map(([category, c]) => ({ category, passPercent: c.scored > 0 ? Math.round((c.green / c.scored) * 100) : 0, scored: c.scored }))
    .filter((c) => c.scored > 0)
    .sort((a, b) => b.passPercent - a.passPercent);

  // 6-month team-average ball trend (jamoa dinamikasi)
  const months: string[] = [];
  const baseD = new Date(month + "T00:00:00");
  for (let i = 5; i >= 0; i--) {
    const d = new Date(baseD.getFullYear(), baseD.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
  }
  const trendPerfs = await prisma.monthlyPerformance.findMany({
    // Approved only — the 6-month trend must match what was actually paid.
    where: { month: { in: months }, status: "approved" },
    select: { month: true, employeeId: true, calculatedScore: true, selectedOption: true },
  });
  const perMonthEmp = new Map<string, Map<string, { green: number; red: number }>>();
  for (const p of trendPerfs) {
    const em = perMonthEmp.get(p.month) ?? perMonthEmp.set(p.month, new Map()).get(p.month)!;
    const a = em.get(p.employeeId) ?? em.set(p.employeeId, { green: 0, red: 0 }).get(p.employeeId)!;
    const sc = Number(p.calculatedScore);
    if (sc > 0) a.green++;
    else if (sc < 0 || p.selectedOption === "red") a.red++;
  }
  const monthlyTrend = months.map((mo) => {
    const em = perMonthEmp.get(mo);
    if (!em || em.size === 0) return { month: mo, avgBall: 0 };
    let sum = 0;
    for (const a of em.values()) { const sc2 = a.green + a.red; sum += sc2 > 0 ? (a.green / sc2) * 100 : 100; }
    return { month: mo, avgBall: Math.round(sum / em.size) };
  });

  return serialize({
    leaderboard,
    stats: {
      avgBall,
      excellent: leaderboard.filter((l) => l.daraja === "excellent").length,
      poor: leaderboard.filter((l) => l.daraja === "poor").length,
      bonusFund: isSenior ? leaderboard.reduce((s, l) => s + l.bonus, 0) : 0,
      total: withScores.length,
    },
    criteria,
    monthlyTrend,
  });
}

/**
 * Bir oyning avtomatik (`source` = 'system' | 'bot') takliflarini ommaviy
 * tasdiqlaydi — nazoratchi 25 qoidani 200+ firma bo'yicha bittalab bosmasligi
 * uchun.
 *
 * Ataylab TOR: faqat `submitted` va faqat avtomatik manbali qatorlar. Qo'lda
 * kiritilgan (`source='supervisor'`) yoki allaqachon `approved` qatorlarga
 * tegmaydi, ya'ni bu tugma hech qachon inson qaroriniing ustidan yozmaydi.
 * Har bir tasdiq alohida auditga tushadi — approvePerformance bilan bir xil.
 */
export async function approveAutoPerformance(month: string, opts: { employeeId?: string; companyId?: string } = {}) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const role = session.user.role as string;
  if (!["super_admin", "admin", "chief_accountant"].includes(role)) {
    throw new Error("Forbidden");
  }

  const monthKey = toPerformanceMonth(month);
  if (!monthKey) throw new Error("Oy formati noto'g'ri (YYYY-MM kutiladi)");

  // Ommaviy tasdiq eng xavflisi: bitta bosishda yuzlab qator tasdiqlanadi.
  // Shuning uchun u ham portfelga cheklanadi — `staffScopeFilter` admin uchun
  // undefined (cheklovsiz), senior uchun ruxsat etilgan xodimlar ro'yxatini,
  // begona xodim so'ralganda esa xatolik qaytaradi.
  const employeeScope = await staffScopeFilter(
    prisma,
    { id: session.user.id, role },
    opts.employeeId
  );

  const targets = await prisma.monthlyPerformance.findMany({
    where: {
      month: monthKey,
      status: "submitted",
      source: { in: ["system", "bot"] },
      ...(employeeScope ? { employeeId: employeeScope } : {}),
      ...(opts.companyId ? { companyId: opts.companyId } : {}),
    },
    select: { id: true },
  });
  if (targets.length === 0) return { approved: 0 };

  const ids = targets.map((t) => t.id);
  const approvedAt = new Date();
  await prisma.monthlyPerformance.updateMany({
    where: { id: { in: ids } },
    data: { status: "approved", approvedBy: session.user.id, approvedAt },
  });

  await recordAuditLog({
    userId: session.user.id,
    action: "update",
    tableName: "MonthlyPerformance",
    recordId: `bulk:${monthKey}`,
    newData: {
      status: "approved",
      month: monthKey,
      count: ids.length,
      employeeId: opts.employeeId ?? null,
      companyId: opts.companyId ?? null,
    },
  });

  return { approved: ids.length };
}
