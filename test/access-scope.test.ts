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
