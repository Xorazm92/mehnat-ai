/**
 * KIRISH NAZORATI — P0 tuzatishlarini QULFLAYDI.
 *
 * Auditda uchta joyda `isSeniorRole` tekshiruvi FIRMA/XODIM SCOPE'siz
 * ishlatilgani aniqlandi. Bosh buxgalter va nazoratchi ataylab o'z
 * portfeliga cheklangan (`ROLE_PERMISSIONS` da ularga "view_all_companies"
 * berilmagan), lekin bu uch amal ularga butun tizimni ochib qo'yardi:
 *
 *   1) qarzdorlik sahifasi — 197 firmaning hammasi ko'rinardi;
 *   2) oylik tuzatmasi — portfeldan tashqaridagi xodimga jarima yozish;
 *   3) firma credential'i — ikkinchi, tor scope qoidasi ishlatilardi
 *      (nazoratchi O'Z firmasining parolini ko'ra olmasdi).
 *
 * Live Postgres kerak.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "", kind: "staff", companyId: null as string | null } };
vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, revalidatePath: () => {} }));

const { prisma } = await import("@/lib/prisma");
const debt = await import("@/server/debt");
const payroll = await import("@/server/payroll");
const credentials = await import("@/server/credentials");
const kpi = await import("@/server/kpi");

const TAG = `vitest-scope-${Date.now()}`;
const ids = {
  admin: "",
  supervisor: "",
  outsider: "",
  staffInside: "",
  staffOutside: "",
  mine: "",
  theirs: "",
};

const asUser = (id: string, role: string) => {
  SESSION.user = { id, role, kind: "staff", companyId: null };
};

beforeAll(async () => {
  const mk = (suffix: string, role: string) =>
    prisma.user.create({
      data: { email: `${TAG}-${suffix}@v.local`, fullName: `${TAG} ${suffix}`, passwordHash: "x", role: role as never },
      select: { id: true },
    });

  const [admin, supervisor, outsider, staffInside, staffOutside] = await Promise.all([
    mk("admin", "admin"),
    mk("sup", "supervisor"),
    mk("out", "supervisor"),
    mk("in-staff", "accountant"),
    mk("out-staff", "accountant"),
  ]);
  Object.assign(ids, {
    admin: admin.id,
    supervisor: supervisor.id,
    outsider: outsider.id,
    staffInside: staffInside.id,
    staffOutside: staffOutside.id,
  });

  // "mine" — nazoratchining portfelida. "theirs" — begona firma.
  const [mine, theirs] = await Promise.all([
    prisma.company.create({
      data: {
        name: `${TAG} MINE`,
        inn: "900000001",
        contractAmount: 1_000_000,
        supervisorId: supervisor.id,
        accountantId: staffInside.id,
      },
      select: { id: true },
    }),
    prisma.company.create({
      data: {
        name: `${TAG} THEIRS`,
        inn: "900000002",
        contractAmount: 5_000_000,
        accountantId: staffOutside.id,
      },
      select: { id: true },
    }),
  ]);
  ids.mine = mine.id;
  ids.theirs = theirs.id;

  const asOf = new Date(Date.UTC(2099, 0, 31));
  await prisma.debtSnapshot.createMany({
    data: [
      { asOf, companyId: mine.id, rawCustomer: `${TAG} MINE`, rawContract: "M-1", debt: 111_000 },
      { asOf, companyId: theirs.id, rawCustomer: `${TAG} THEIRS`, rawContract: "T-1", debt: 999_000 },
      { asOf, companyId: null, rawCustomer: `${TAG} NOBODY`, rawContract: "N-1", debt: 777_000 },
    ],
  });
});

afterAll(async () => {
  const userIds = [ids.admin, ids.supervisor, ids.outsider, ids.staffInside, ids.staffOutside];
  const companyIds = [ids.mine, ids.theirs];
  await prisma.monthlyPerformance.deleteMany({ where: { employeeId: { in: userIds } } });
  await prisma.companyKpiRule.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.debtSnapshot.deleteMany({ where: { rawCustomer: { startsWith: TAG } } });
  await prisma.payrollAdjustment.deleteMany({ where: { employeeId: { in: userIds } } });
  await prisma.clientCredential.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.contractAssignment.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("P0-1 · qarzdorlik firma scope", () => {
  it("nazoratchi FAQAT o'z portfelidagi firmani ko'radi", async () => {
    asUser(ids.supervisor, "supervisor");
    const res = (await debt.getDebtComparison()) as { rows: { customer: string }[] };
    const names = res.rows.map((r) => r.customer);

    expect(names.some((n) => n.includes("MINE"))).toBe(true);
    // Eng muhimi — begona firma KO'RINMAYDI.
    expect(names.some((n) => n.includes("THEIRS"))).toBe(false);
    // Hech kimga biriktirilmagan qator ham ko'rinmaydi.
    expect(names.some((n) => n.includes("NOBODY"))).toBe(false);
  });

  it("portfeli bo'sh nazoratchi hech nima ko'rmaydi", async () => {
    asUser(ids.outsider, "supervisor");
    const res = (await debt.getDebtComparison()) as { rows: unknown[] };
    expect(res.rows).toHaveLength(0);
  });

  it("admin hammasini, jumladan bog'lanmaganini ham ko'radi", async () => {
    asUser(ids.admin, "admin");
    const res = (await debt.getDebtComparison()) as { rows: { customer: string }[] };
    const mine = res.rows.filter((r) => r.customer.includes(TAG));
    expect(mine.length).toBe(3);
  });

  it("buxgalter (senior emas) umuman kira olmaydi", async () => {
    asUser(ids.staffInside, "accountant");
    await expect(debt.getDebtComparison()).rejects.toThrow(/Forbidden/);
  });

  it("reja/fakt faqat direktorga — u firma kesimi bo'lmagan ko'rsatkich", async () => {
    asUser(ids.supervisor, "supervisor");
    expect(await debt.getPlanFact()).toEqual([]);
    asUser(ids.admin, "admin");
    expect(Array.isArray(await debt.getPlanFact())).toBe(true);
  });
});

describe("P0-2 · oylik tuzatmasi xodim scope", () => {
  const draft = (employeeId: string) => ({
    month: "2099-01",
    employeeId,
    adjustmentType: "bonus",
    amount: 50_000,
    reason: `${TAG} test`,
  });

  it("nazoratchi PORTFELIDAGI xodimga tuzatma yozadi", async () => {
    asUser(ids.supervisor, "supervisor");
    await expect(payroll.createPayrollAdjustment(draft(ids.staffInside))).resolves.toBeTruthy();
  });

  it("nazoratchi BEGONA xodimga tuzatma YOZA OLMAYDI", async () => {
    asUser(ids.supervisor, "supervisor");
    await expect(payroll.createPayrollAdjustment(draft(ids.staffOutside))).rejects.toThrow(
      /ruxsatingiz yo'q/i
    );
  });

  it("admin istalgan xodimga yoza oladi", async () => {
    asUser(ids.admin, "admin");
    await expect(payroll.createPayrollAdjustment(draft(ids.staffOutside))).resolves.toBeTruthy();
  });
});

describe("P0-3 · credential scope yagona manbadan", () => {
  it("NAZORATCHI o'z firmasining credential'iga kira oladi", async () => {
    // Ilgari bu YIQILARDI: eski qoida faqat accountantId/bankClientId ni
    // tekshirardi, nazoratchi esa o'z firmasidan chetlatilgan edi.
    asUser(ids.supervisor, "supervisor");
    await expect(credentials.getClientCredentials(ids.mine)).resolves.toBeDefined();
  });

  it("nazoratchi BEGONA firma credential'iga kira olmaydi", async () => {
    asUser(ids.supervisor, "supervisor");
    await expect(credentials.getClientCredentials(ids.theirs)).rejects.toThrow(/ruxsat/i);
  });

  it("biriktirilmagan xodim kira olmaydi", async () => {
    asUser(ids.staffOutside, "accountant");
    await expect(credentials.getClientCredentials(ids.mine)).rejects.toThrow(/ruxsat/i);
  });

  it("admin har qanday firmaga kira oladi", async () => {
    asUser(ids.admin, "admin");
    await expect(credentials.getClientCredentials(ids.theirs)).resolves.toBeDefined();
  });
});

describe("P1-2 · rol konteksti", () => {
  // Prodda real holat: Go'zaloy 8 firmada buxgalter, 132 tasida nazoratchi;
  // Ruslan 65 tasida bank klient, 10 tasida buxgalter. Bungacha ular
  // hammasini ARALASH ko'rardi va qaysi sifatda javob berishini
  // ajratolmasdi.
  it("kontekstsiz — barcha biriktiruvlar birga (eski xatti-harakat)", async () => {
    const { companyScopeWhere } = await import("@/lib/platform/access");
    const where = companyScopeWhere({ id: ids.supervisor, role: "supervisor" });
    const found = await prisma.company.findMany({
      where: { ...where, name: { startsWith: TAG } },
      select: { name: true },
    });
    expect(found.length).toBeGreaterThanOrEqual(1);
  });

  it("kontekst tanlanganda faqat SHU vazifadagi firma qoladi", async () => {
    const { companyScopeWhere } = await import("@/lib/platform/access");

    const asSupervisor = await prisma.company.findMany({
      where: {
        ...companyScopeWhere({ id: ids.supervisor, role: "supervisor", context: "supervisor" }),
        name: { startsWith: TAG },
      },
      select: { name: true },
    });
    // "MINE" da u nazoratchi — ko'rinadi.
    expect(asSupervisor.map((c) => c.name)).toContain(`${TAG} MINE`);

    const asAccountant = await prisma.company.findMany({
      where: {
        ...companyScopeWhere({ id: ids.supervisor, role: "supervisor", context: "accountant" }),
        name: { startsWith: TAG },
      },
      select: { name: true },
    });
    // Buxgalter sifatida hech qayerda biriktirilmagan — bo'sh.
    expect(asAccountant).toHaveLength(0);
  });

  it("kontekst ko'rinishni KENGAYTIRMAYDI — begona firma baribir yopiq", async () => {
    const { companyScopeWhere } = await import("@/lib/platform/access");
    for (const ctx of ["all", "accountant", "supervisor", "chief_accountant", "bank_manager"] as const) {
      const found = await prisma.company.findMany({
        where: {
          ...companyScopeWhere({ id: ids.supervisor, role: "supervisor", context: ctx }),
          name: { startsWith: TAG },
        },
        select: { name: true },
      });
      expect(found.map((c) => c.name)).not.toContain(`${TAG} THEIRS`);
    }
  });

  it("buzuq cookie qiymati 'all' ga tushadi", async () => {
    const { parseRoleContext } = await import("@/lib/roleContext");
    expect(parseRoleContext("supervisor")).toBe("supervisor");
    expect(parseRoleContext("admin")).toBe("all");
    expect(parseRoleContext("'; DROP TABLE")).toBe("all");
    expect(parseRoleContext(undefined)).toBe("all");
  });

  it("bitta vazifali odamga almashtirgich ko'rsatilmaydi", async () => {
    const { resolveContexts } = await import("@/lib/roleContext");
    // staffInside faqat bitta firmada buxgalter.
    expect(await resolveContexts(prisma, ids.staffInside, false)).toHaveLength(0);
    // admin uchun kontekst tushunchasi yo'q.
    expect(await resolveContexts(prisma, ids.admin, true)).toHaveLength(0);
  });
});

describe("P0-4 · KPI tasdiqlash xodim/firma scope", () => {
  // Auditning oxirgi supurgisida topilgan: kpi.ts dagi beshta amal ROL
  // tekshirar, lekin SCOPE tekshirmasdi. Ruxsat berilgan rollar esa aynan
  // portfelga cheklangan bosh buxgalter va nazoratchi edi. Tasdiqlangan KPI
  // to'g'ridan-to'g'ri maoshga kiradi — ya'ni bu pulga tegadigan teshik.
  // MonthlyPerformance companyId va ruleId ni majburiy talab qiladi, va
  // (month, companyId, employeeId, ruleId) unikal — shuning uchun har bir
  // test o'z oyida ishlaydi, aks holda ikkinchi test birinchisining qatoriga
  // urilib qolardi.
  // DIQQAT: MonthlyPerformance.month "YYYY-MM-01" ko'rinishida saqlanadi
  // (lib/periods.ts toPerformanceMonth). "2099-04" deb yozilsa amal uni
  // topolmaydi va test jimgina noto'g'ri narsani tasdiqlaydi.
  const perf = async (employeeId: string, companyId: string, month: string) => {
    const rule = await prisma.kpiRule.findFirst({ select: { id: true } });
    if (!rule) throw new Error("kpiRule seed qilinmagan");
    return prisma.monthlyPerformance.create({
      data: {
        month,
        employeeId,
        companyId,
        ruleId: rule.id,
        value: 1,
        status: "submitted",
        source: "system",
        calculatedScore: 90,
        penaltyAmount: 0,
      },
      select: { id: true },
    });
  };

  it("bosh buxgalter BEGONA xodimning KPI'sini tasdiqlay olmaydi", async () => {
    const row = await perf(ids.staffOutside, ids.theirs, "2099-01-01");
    asUser(ids.supervisor, "chief_accountant");
    await expect(kpi.approvePerformance(row.id)).rejects.toThrow(/ruxsatingiz yo'q/i);
  });

  it("o'z portfelidagi xodimni tasdiqlay oladi", async () => {
    const row = await perf(ids.staffInside, ids.mine, "2099-02-01");
    asUser(ids.supervisor, "chief_accountant");
    await expect(kpi.approvePerformance(row.id)).resolves.toBeTruthy();
  });

  it("rad etish ham begona xodimga ishlamaydi", async () => {
    const row = await perf(ids.staffOutside, ids.theirs, "2099-03-01");
    asUser(ids.supervisor, "supervisor");
    await expect(kpi.rejectPerformance(row.id, "sabab")).rejects.toThrow(/ruxsatingiz yo'q/i);
  });

  it("ommaviy tasdiq FAQAT portfeldagi xodimlarni oladi", async () => {
    const [mineRow, theirsRow] = await Promise.all([
      perf(ids.staffInside, ids.mine, "2099-04-01"),
      perf(ids.staffOutside, ids.theirs, "2099-04-01"),
    ]);
    asUser(ids.supervisor, "chief_accountant");
    await kpi.approveAutoPerformance("2099-04");

    const [m, t] = await Promise.all([
      prisma.monthlyPerformance.findUnique({ where: { id: mineRow.id }, select: { status: true } }),
      prisma.monthlyPerformance.findUnique({ where: { id: theirsRow.id }, select: { status: true } }),
    ]);
    expect(m?.status).toBe("approved");
    // Eng muhimi — begona xodim TEGILMAGAN qoldi.
    expect(t?.status).toBe("submitted");
  });

  it("begona firmaning KPI qoidalari o'qilmaydi", async () => {
    asUser(ids.supervisor, "supervisor");
    await expect(kpi.getCompanyKpiRules(ids.theirs)).rejects.toThrow(/ruxsat/i);
    await expect(kpi.getCompanyKpiRules(ids.mine)).resolves.toBeDefined();
  });

  it("KPI qoidasini O'QISH senior bo'lishni talab qilmaydi (buxgalter o'z firmasini ko'radi)", async () => {
    // Bu qoida muhim: mukofot/jarima foizi — buxgalterning O'Z maoshi.
    asUser(ids.staffInside, "accountant");
    await expect(kpi.getCompanyKpiRules(ids.mine)).resolves.toBeDefined();
    await expect(kpi.getCompanyKpiRules(ids.theirs)).rejects.toThrow(/ruxsat/i);
  });

  it("lekin YOZISH senior talab qiladi va portfelga cheklanadi", async () => {
    const rule = await prisma.kpiRule.findFirst({ select: { id: true } });
    if (!rule) return; // qoidalar seed qilinmagan muhitda o'tkazib yuboriladi
    asUser(ids.supervisor, "supervisor");
    await expect(
      kpi.upsertCompanyKpiRule({ companyId: ids.theirs, ruleId: rule.id, isActive: true })
    ).rejects.toThrow(/ruxsat/i);
    await expect(
      kpi.upsertCompanyKpiRule({ companyId: ids.mine, ruleId: rule.id, isActive: true })
    ).resolves.toBeTruthy();
  });
});
