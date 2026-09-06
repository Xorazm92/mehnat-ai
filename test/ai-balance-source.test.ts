/**
 * AI RAQAMI = EKRANDAGI RAQAM (M5.1, PRODUCT.md 4-va'da).
 *
 * Avvalgi tahrirda `getCompanyBalance` balansni O'ZI yig'ardi
 * (`kassa − payout + payment`) va hisob qatlamini bilmasdi: ochilish
 * qoldig'i, moliyaviy yordam va `KASSA_START` chegarasi tushib qolardi,
 * `payment.aggregate` esa offsetni naqd deb sanardi. Ya'ni AI raqami
 * ekrandagidan KAFOLATLI farq qilardi.
 *
 * Bu testlar toolni MANBAGA solishtiradi: tool nima qaytarsa,
 * `lib/debt.ts` ham aynan shuni qaytarishi shart. Ikkinchi hisob paydo
 * bo'lsa — shu yerda quladi.
 *
 * Live Postgres kerak (TEST_DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "" } };
vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, updateTag: () => {}, revalidatePath: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { listDebtors } = await import("@/lib/debt");
const { getCompanyBalance, getCompanyOverdue, getRecentPayments } = await import("@/lib/ai/tools");

const TAG = `vitest-aisrc-${Date.now()}`;
const ids = { admin: "", acc: "", mine: "", theirs: "" };

const actor = (id: string, role: string) => {
  SESSION.user.id = id;
  SESSION.user.role = role;
};

beforeAll(async () => {
  const mk = (n: string, role: string) =>
    prisma.user.create({
      data: { email: `${TAG}-${n}@v.local`, fullName: `${TAG} ${n}`, passwordHash: "x", role: role as never },
      select: { id: true },
    });
  const [admin, acc] = await Promise.all([mk("adm", "super_admin"), mk("acc", "accountant")]);
  ids.admin = admin.id;
  ids.acc = acc.id;

  const mkCo = (n: string, accountantId: string | null) =>
    prisma.company.create({
      data: {
        name: `${TAG} ${n}`,
        inn: String(Date.now()).slice(-9),
        taxRegime: "vat",
        isActive: true,
        companyStatus: "active",
        contractDate: new Date(Date.UTC(2093, 0, 1)),
        contractAmount: 5_000_000,
        accountantId,
      },
      select: { id: true },
    });
  ids.mine = (await mkCo("mine", ids.acc)).id;
  ids.theirs = (await mkCo("theirs", null)).id;
});

afterAll(async () => {
  await prisma.payment.deleteMany({ where: { companyId: { in: [ids.mine, ids.theirs] } } });
  await prisma.company.deleteMany({ where: { id: { in: [ids.mine, ids.theirs] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.admin, ids.acc] } } });
  await prisma.$disconnect();
});

describe("tool raqami manbadan keladi", () => {
  it("getCompanyBalance — `lib/debt.ts` bilan AYNAN bir xil", async () => {
    actor(ids.admin, "super_admin");
    const res = await getCompanyBalance(ids.mine);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const [row] = await listDebtors(prisma, { companyIds: [ids.mine], scope: "all" });
    expect(res.data.outstanding).toBe(row?.outstanding ?? 0);
    expect(res.data.paid).toBe(row?.paid ?? 0);
    expect(res.data.charged).toBe(row?.charged ?? 0);
  });

  it("getCompanyOverdue — `lib/debt.ts` bilan AYNAN bir xil", async () => {
    actor(ids.admin, "super_admin");
    const res = await getCompanyOverdue(ids.mine);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const [row] = await listDebtors(prisma, { companyIds: [ids.mine], scope: "all" });
    expect(res.data.overdueAmount).toBe(row?.overdue ?? 0);
    expect(res.data.overdueDays).toBe(row?.overdueDays ?? 0);
  });

  it("har raqam da'vo bilan keladi — manba nomlangan", async () => {
    actor(ids.admin, "super_admin");
    const res = await getCompanyBalance(ids.mine);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.claims.length).toBeGreaterThanOrEqual(3);
    for (const c of res.claims) {
      expect(c.sourceTool).toBe("getCompanyBalance");
      // Manba qatlami NOMLANGAN — "qayerdan?" savoliga javob da'voning ichida.
      expect(c.sourceQuery).toContain("lib/debt.ts");
      expect(c.unit).toBe("so'm");
      expect(c.confidence).toBe(0.7);
      expect(new Date(c.asOf).toString()).not.toBe("Invalid Date");
    }
    // Qoldiq da'vosi haqiqiy qiymat bilan mos.
    const outstanding = res.claims.find((c) => c.label.includes("qoldiq"));
    expect(outstanding?.value).toBe(res.data.outstanding);
  });

  it("getRecentPayments — naqd ulush `lib/paymentCash.ts` qoidasi bo'yicha", async () => {
    actor(ids.admin, "super_admin");
    const res = await getRecentPayments(ids.mine, 30);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // Offset chiqarib tashlanishi da'voning SHARTIDA yozilgan (Modda 7).
    const c = res.claims[0];
    expect(c.sourceQuery).toContain("cashFromPaymentRows");
    expect(c.conditions?.join(" ")).toMatch(/offset/i);
  });
});
