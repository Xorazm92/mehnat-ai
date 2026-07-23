/**
 * PROFITABILITY margin overview + invoice debt. Live Postgres + mocked auth.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "admin" } };
vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { getMarginOverview } = await import("@/server/profitability");
const { createInvoice, recordInvoicePayment } = await import("@/server/invoices");

const TAG = `vitest-profit-${Date.now()}`;
const PERIOD = "2097-07";
const ids = { user: "", company: "", invoice: "" };

beforeAll(async () => {
  const u = await prisma.user.create({ data: { email: `${TAG}@v.local`, fullName: "U", passwordHash: "x", role: "accountant" }, select: { id: true } });
  ids.user = u.id;
  SESSION.user.id = u.id;
  const company = await prisma.company.create({ data: { name: `${TAG} MChJ`, inn: "0", taxRegime: "vat" }, select: { id: true } });
  ids.company = company.id;

  await prisma.employeeCostRate.create({ data: { userId: ids.user, hourlyRate: 60000, effectiveFrom: new Date(Date.UTC(2097, 0, 1)) } });
  await prisma.timeEntry.create({ data: { userId: ids.user, companyId: ids.company, date: new Date(Date.UTC(2097, 6, 15)), minutes: 120 } }); // 2h × 60000 = 120000
  await prisma.payment.create({ data: { companyId: ids.company, period: PERIOD, amount: 1_000_000, status: "paid" } });
});

afterAll(async () => {
  await prisma.invoice.deleteMany({ where: { companyId: ids.company } });
  await prisma.payment.deleteMany({ where: { companyId: ids.company } });
  await prisma.timeEntry.deleteMany({ where: { companyId: ids.company } });
  await prisma.employeeCostRate.deleteMany({ where: { userId: ids.user } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.auditLog.deleteMany({ where: { userId: ids.user } });
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

describe("getMarginOverview", () => {
  it("computes revenue − labor margin per company", async () => {
    const rows = await getMarginOverview(PERIOD);
    const mine = rows.find((r) => r.companyId === ids.company);
    expect(mine).toBeTruthy();
    expect(mine!.revenue).toBe(1_000_000);
    expect(mine!.laborCost).toBe(120_000); // 2h × 60000
    expect(mine!.margin).toBe(880_000);
    expect(mine!.marginPct).toBe(88);
    expect(mine!.debt).toBe(0);
  });
});

describe("invoices → debt", () => {
  it("createInvoice adds debt; partial payment reduces it", async () => {
    const inv = await createInvoice({ companyId: ids.company, period: PERIOD, amount: 500_000 });
    ids.invoice = inv.id;
    let mine = (await getMarginOverview(PERIOD)).find((r) => r.companyId === ids.company)!;
    expect(mine.debt).toBe(500_000);

    await recordInvoicePayment(inv.id, 200_000);
    const row = await prisma.invoice.findUnique({ where: { id: inv.id }, select: { status: true } });
    expect(row!.status).toBe("partial");
    mine = (await getMarginOverview(PERIOD)).find((r) => r.companyId === ids.company)!;
    expect(mine.debt).toBe(300_000); // 500k − 200k
  });
});
