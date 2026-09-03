/**
 * KPI PRODUCTION READINESS — haqiqiy yozuv yo'li orqali (server action + Postgres).
 *
 * `lib/kpiReference.spec.ts` formulani DB'siz isbotlaydi. Bu yerda esa
 * ULANGANLIGI tekshiriladi: qoida override'i haqiqatan hisobga kiradimi, tasdiq
 * zanjiri qulflanganmi, va klient yuborgan ball rad etiladimi.
 *
 * Live Postgres kerak (TEST_DATABASE_URL) + seed qilingan KPI qoidalari.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "supervisor" as string, kind: "staff", companyId: null } };
vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, revalidatePath: () => {} }));

const { prisma } = await import("@/lib/prisma");
const kpi = await import("@/server/kpi");

const TAG = `vitest-ready-${Date.now()}`;
const ids = { company: "", accountant: "", supervisor: "", rule: "", ruleBonus: 0 };

const asUser = (id: string, role: string) => {
  SESSION.user = { id, role, kind: "staff", companyId: null };
};

beforeAll(async () => {
  // `acc_didox` — uch holatli ±0.25 (scripts/seed-kpi-rules-v2.ts).
  const rule = await prisma.kpiRule.findUnique({
    where: { name: "acc_didox" },
    select: { id: true, maxBonus: true },
  });
  if (!rule) throw new Error("acc_didox seed qilinmagan — npm run test:db:setup");
  ids.rule = rule.id;
  ids.ruleBonus = Number(rule.maxBonus);

  const [accountant, supervisor] = await Promise.all([
    prisma.user.create({
      data: { email: `${TAG}-acc@v.local`, fullName: `${TAG} Buxgalter`, passwordHash: "x", role: "accountant" },
      select: { id: true },
    }),
    prisma.user.create({
      data: { email: `${TAG}-sup@v.local`, fullName: `${TAG} Nazoratchi`, passwordHash: "x", role: "supervisor" },
      select: { id: true },
    }),
  ]);
  const company = await prisma.company.create({
    data: {
      name: `${TAG} co`,
      inn: `97${Date.now() % 100000000}`,
      contractAmount: 10_000_000,
      accountantId: accountant.id,
      supervisorId: supervisor.id,
    },
    select: { id: true },
  });
  ids.accountant = accountant.id;
  ids.supervisor = supervisor.id;
  ids.company = company.id;
});

afterAll(async () => {
  await prisma.monthlyPerformance.deleteMany({ where: { companyId: ids.company } });
  await prisma.companyKpiRule.deleteMany({ where: { companyId: ids.company } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: [ids.supervisor, ids.accountant] } } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.accountant, ids.supervisor] } } });
  await prisma.$disconnect();
});

const write = (month: string, extra: Record<string, unknown> = {}) =>
  kpi.upsertPerformance({
    month,
    companyId: ids.company,
    employeeId: ids.accountant,
    ruleId: ids.rule,
    selectedOption: "green",
    source: "supervisor",
    status: "approved",
    ...extra,
  } as Parameters<typeof kpi.upsertPerformance>[0]);

const rowOf = (month: string) =>
  prisma.monthlyPerformance.findUnique({
    where: {
      month_companyId_employeeId_ruleId: {
        month, companyId: ids.company, employeeId: ids.accountant, ruleId: ids.rule,
      },
    },
  });

// ─────────────────────────────────────────────────────────────
describe("Scenario F — CompanyKpiRule override HISOBGA KIRADI", () => {
  it("override yo'q — qoidaning o'z koeffitsiyenti", async () => {
    asUser(ids.supervisor, "supervisor");
    await write("2098-01");
    const row = await rowOf("2098-01-01");
    expect(Number(row!.calculatedScore)).toBe(ids.ruleBonus); // 0.25
  });

  it("override BOR — firma foizi qo'llanadi", async () => {
    await prisma.companyKpiRule.create({
      data: { companyId: ids.company, ruleId: ids.rule, isActive: true, rewardPercent: 0.5, penaltyPercent: 0.75 },
    });
    asUser(ids.supervisor, "supervisor");
    await write("2098-02");
    const row = await rowOf("2098-02-01");
    expect(Number(row!.calculatedScore)).toBe(0.5);
  });

  it("override jarima tomonini ham almashtiradi", async () => {
    asUser(ids.supervisor, "supervisor");
    await write("2098-03", { selectedOption: "red" });
    const row = await rowOf("2098-03-01");
    expect(Number(row!.calculatedScore)).toBe(-0.75);
  });

  it("isActive=false — qoida bu firmaga tegishli emas, ball 0", async () => {
    await prisma.companyKpiRule.updateMany({
      where: { companyId: ids.company, ruleId: ids.rule },
      data: { isActive: false },
    });
    asUser(ids.supervisor, "supervisor");
    await write("2098-04");
    const row = await rowOf("2098-04-01");
    expect(Number(row!.calculatedScore)).toBe(0);

    await prisma.companyKpiRule.deleteMany({ where: { companyId: ids.company, ruleId: ids.rule } });
  });
});

// ─────────────────────────────────────────────────────────────
describe("Scenario G — tasdiq zanjiri", () => {
  it("xodimning O'ZI yozgani hech qachon 'approved' bo'lmaydi", async () => {
    asUser(ids.accountant, "accountant");
    // Xodim `status:'approved'` so'raydi — server rad etib 'submitted' qiladi.
    await write("2098-05");
    const row = await rowOf("2098-05-01");
    expect(row!.status).toBe("submitted");
    expect(row!.source).toBe("employee");
  });

  it("nazoratchi tasdiqlaydi — endi maoshga kiradi", async () => {
    asUser(ids.supervisor, "supervisor");
    const row = await rowOf("2098-05-01");
    await kpi.approvePerformance(row!.id);
    const after = await rowOf("2098-05-01");
    expect(after!.status).toBe("approved");
    expect(after!.approvedBy).toBe(ids.supervisor);
  });

  it("oddiy xodim TASDIQLANGAN natijani o'zgartira olmaydi", async () => {
    asUser(ids.accountant, "accountant");
    await expect(write("2098-05", { selectedOption: "red" })).rejects.toThrow(/Tasdiqlangan/i);
    const row = await rowOf("2098-05-01");
    expect(row!.selectedOption).toBe("green"); // o'zgarmadi
  });

  it("oddiy xodim BOSHQA xodimga baho qo'ya olmaydi", async () => {
    asUser(ids.accountant, "accountant");
    await expect(
      kpi.upsertPerformance({
        month: "2098-06",
        companyId: ids.company,
        employeeId: ids.supervisor,
        ruleId: ids.rule,
        selectedOption: "green",
      })
    ).rejects.toThrow(/Forbidden/i);
  });

  it("tasdiq AUDIT izida qoladi", async () => {
    const row = await rowOf("2098-01-01");
    const log = await prisma.auditLog.findFirst({
      where: { tableName: "MonthlyPerformance", recordId: row!.id, userId: ids.supervisor },
    });
    expect(log).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
describe("Scenario H — klient ball yubora olmaydi", () => {
  it("calculatedScore=100 e'tiborga OLINMAYDI, server o'zi hisoblaydi", async () => {
    asUser(ids.supervisor, "supervisor");
    // Xom klient chaqirig'ini taqlid qilamiz: TS maydonni bilmaydi, runtime esa
    // ortiqcha kalitni qabul qilishi mumkin edi.
    await kpi.upsertPerformance({
      month: "2098-07",
      companyId: ids.company,
      employeeId: ids.accountant,
      ruleId: ids.rule,
      selectedOption: "green",
      source: "supervisor",
      status: "approved",
      calculatedScore: 100,
      value: 99,
    } as unknown as Parameters<typeof kpi.upsertPerformance>[0]);

    const row = await rowOf("2098-07-01");
    expect(Number(row!.calculatedScore)).toBe(ids.ruleBonus); // 0.25, 100 EMAS
    expect(Number(row!.value)).toBe(1); // rang bo'yicha, 99 EMAS
  });

  it("qizil variantda ham klient soni emas, qoidaning jarimasi yoziladi", async () => {
    asUser(ids.supervisor, "supervisor");
    await kpi.upsertPerformance({
      month: "2098-08",
      companyId: ids.company,
      employeeId: ids.accountant,
      ruleId: ids.rule,
      selectedOption: "red",
      source: "supervisor",
      status: "approved",
      calculatedScore: 0,
    } as unknown as Parameters<typeof kpi.upsertPerformance>[0]);

    const row = await rowOf("2098-08-01");
    expect(Number(row!.calculatedScore)).toBe(-ids.ruleBonus); // −0.25
  });
});
