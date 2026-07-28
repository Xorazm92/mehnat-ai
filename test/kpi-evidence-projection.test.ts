/**
 * Integration test: Obligation → MonthlyPerformance taklifi (yozuv yo'li).
 *
 * Bu KPI ni subyektiv bosishdan dalilga o'tkazadigan qatlam, ya'ni pulga eng
 * yaqin joy. Tekshiriladi: muddatida bajarilgan → yashil, kechikkan → qizil,
 * MENEJER TASDIQLAGAN uzrli sabab → umuman baho yo'q, va nazoratchi
 * tasdiqlagan qator hech qachon ustiga yozilmaydi (ADR-0001 / ADR-0004).
 *
 * Live Postgres va seed qilingan KPI qoidalari kerak.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prisma } = await import("@/lib/prisma");
const { evaluateObligationEvidence } = await import("@/lib/kpiEvidence");

const TAG = `vitest-eve-${Date.now()}`;
const PERIOD = "2098-04";
const PERIOD_KEY = "2098-M04";
const PERF_MONTH = "2098-04-01";
const DUE = new Date("2098-04-25T00:00:00Z");
const NOW = new Date("2098-05-10T00:00:00Z"); // muddatdan keyin

const ids = {
  accountant: "",
  onTime: "",
  late: "",
  excused: "",
  templates: [] as string[],
  companies: [] as string[],
  // Promise.all tugash tartibi kafolatlanmagan — indeks bo'yicha emas, ATAB olamiz.
  coOnTime: "",
  coLate: "",
  coExcused: "",
  ruleCashflow: "",
  ruleDebitor: "",
  rulePnl: "",
};

/**
 * `code` REAL bo'lishi shart — TEMPLATE_CODE_TO_RULE_NAME aynan shu kalit
 * bo'yicha qoidani topadi. Prod shabloni bilan to'qnashmasligi uchun
 * @@unique([code, version]) dagi `version` ni ajratamiz.
 */
async function mkTemplate(code: string) {
  const t = await prisma.deadlineTemplate.create({
    data: {
      code,
      version: 9099,
      name: `${TAG} ${code}`,
      obligationType: "internal_task",
      periodicity: "monthly",
      anchorType: "fixed_day_of_month",
      dueDay: 25,
      effectiveFrom: new Date("2098-01-01T00:00:00Z"),
      lifecycle: "active",
      active: true,
    },
    select: { id: true },
  });
  ids.templates.push(t.id);
  return t.id;
}

async function mkCompany(n: number) {
  const c = await prisma.company.create({
    data: {
      name: `${TAG} co${n}`,
      inn: `96${(Date.now() % 10000000) + n}`,
      accountantId: ids.accountant,
      contractAmount: 1_000_000,
      accountantPerc: 20,
    },
    select: { id: true },
  });
  ids.companies.push(c.id);
  return c.id;
}

async function mkObligation(opts: {
  companyId: string;
  templateId: string;
  status: string;
  completedAt?: Date | null;
  delayReason?: string | null;
  delayApprovedById?: string | null;
}) {
  const o = await prisma.obligation.create({
    data: {
      companyId: opts.companyId,
      templateId: opts.templateId,
      templateVersion: 1,
      periodStart: new Date("2098-04-01T00:00:00Z"),
      periodEnd: new Date("2098-05-01T00:00:00Z"),
      periodKey: PERIOD_KEY,
      dueAt: DUE,
      status: opts.status as never,
      responsibleUserId: ids.accountant,
      completedAt: opts.completedAt ?? null,
      delayReason: (opts.delayReason ?? null) as never,
      delayApprovedById: opts.delayApprovedById ?? null,
    },
    select: { id: true },
  });
  return o.id;
}

beforeAll(async () => {
  const [cf, db, pnl] = await Promise.all([
    prisma.kpiRule.findUnique({ where: { name: "acc_cashflow" }, select: { id: true } }),
    prisma.kpiRule.findUnique({ where: { name: "acc_debitor" }, select: { id: true } }),
    prisma.kpiRule.findUnique({ where: { name: "acc_pnl_report" }, select: { id: true } }),
  ]);
  if (!cf || !db || !pnl) throw new Error("KPI qoidalari seed qilinmagan — seed-kpi-rules-v2 ni ishga tushiring.");
  ids.ruleCashflow = cf.id;
  ids.ruleDebitor = db.id;
  ids.rulePnl = pnl.id;

  const acc = await prisma.user.create({
    data: { email: `${TAG}@vitest.local`, fullName: `${TAG} Acc`, passwordHash: "x", role: "accountant" },
    select: { id: true },
  });
  ids.accountant = acc.id;

  // Uchta shablon uchta alohida qoidaga tegishli bo'lishi kerak, aks holda
  // uchala obligation bitta MonthlyPerformance qatoriga yozilib bir-birini bosardi.
  const [tCf, tDb, tPnl] = await Promise.all([mkTemplate("CASHFLOW"), mkTemplate("AR_AP"), mkTemplate("PNL_REPORT")]);
  const [c1, c2, c3] = await Promise.all([mkCompany(1), mkCompany(2), mkCompany(3)]);
  ids.coOnTime = c1;
  ids.coLate = c2;
  ids.coExcused = c3;

  ids.onTime = await mkObligation({
    companyId: c1,
    templateId: tCf,
    status: "accepted",
    completedAt: new Date("2098-04-20T00:00:00Z"),
  });
  ids.late = await mkObligation({ companyId: c2, templateId: tDb, status: "planned" });
  ids.excused = await mkObligation({
    companyId: c3,
    templateId: tPnl,
    status: "planned",
    delayReason: "client_delay",
    delayApprovedById: "manager-x",
  });
});

afterAll(async () => {
  await prisma.monthlyPerformance.deleteMany({ where: { employeeId: ids.accountant } });
  await prisma.obligation.deleteMany({ where: { id: { in: [ids.onTime, ids.late, ids.excused] } } });
  await prisma.company.deleteMany({ where: { id: { in: ids.companies } } });
  await prisma.deadlineTemplate.deleteMany({ where: { id: { in: ids.templates } } });
  await prisma.user.deleteMany({ where: { id: ids.accountant } });
  await prisma.$disconnect();
});

const rowFor = (companyId: string, ruleId: string) =>
  prisma.monthlyPerformance.findUnique({
    where: {
      month_companyId_employeeId_ruleId: {
        month: PERF_MONTH,
        companyId,
        employeeId: ids.accountant,
        ruleId,
      },
    },
  });

describe("evaluateObligationEvidence", () => {
  it("scores on-time green, overdue red, and stays silent on an approved delay", async () => {
    const res = await evaluateObligationEvidence(PERIOD, NOW);
    expect(res.processed).toBe(3);

    const onTime = await rowFor(ids.coOnTime, ids.ruleCashflow);
    expect(onTime?.selectedOption).toBe("green");
    expect(onTime?.status).toBe("submitted");
    expect(onTime?.source).toBe("system");
    expect(Number(onTime?.calculatedScore)).toBeGreaterThan(0);

    const late = await rowFor(ids.coLate, ids.ruleDebitor);
    expect(late?.selectedOption).toBe("red");
    expect(Number(late?.calculatedScore)).toBeLessThan(0);

    // Menejer tasdiqlagan mijoz kechikishi — jarima YO'Q, qator ham yozilmaydi.
    expect(await rowFor(ids.coExcused, ids.rulePnl)).toBeNull();
    expect(res.skippedNeutral).toBe(1);
  });

  it("is idempotent — a second run rewrites the same rows, never duplicates", async () => {
    const before = await prisma.monthlyPerformance.count({ where: { employeeId: ids.accountant } });
    await evaluateObligationEvidence(PERIOD, NOW);
    const after = await prisma.monthlyPerformance.count({ where: { employeeId: ids.accountant } });
    expect(after).toBe(before);
  });

  it("never overwrites what the supervisor already approved", async () => {
    const row = await rowFor(ids.coLate, ids.ruleDebitor);
    await prisma.monthlyPerformance.update({
      where: { id: row!.id },
      data: { status: "approved", selectedOption: "green" },
    });

    const res = await evaluateObligationEvidence(PERIOD, NOW);
    expect(res.skippedApproved).toBeGreaterThanOrEqual(1);

    const after = await rowFor(ids.coLate, ids.ruleDebitor);
    expect(after!.status).toBe("approved");
    expect(after!.selectedOption).toBe("green"); // tegilmagan
  });
});
