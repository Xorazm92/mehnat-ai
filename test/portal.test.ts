/**
 * CLIENT PORTAL — company isolation (critical), ticket flow, client account.
 * Live Postgres + mocked auth.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import bcrypt from "bcryptjs";

const SESSION = { user: { id: "", role: "", kind: "", companyId: null as string | null } };
vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {} }));

const { prisma } = await import("@/lib/prisma");
const portal = await import("@/server/portal");
const admin = await import("@/server/clientUsers");

const TAG = `vitest-portal-${Date.now()}`;
const ids = { staff: "", companyA: "", companyB: "", clientA: "", template: "" };
const asClient = (id: string, companyId: string) => { SESSION.user = { id, role: "client", kind: "client", companyId }; };
const asStaff = (id: string, role: string) => { SESSION.user = { id, role, kind: "staff", companyId: null }; };

beforeAll(async () => {
  const s = await prisma.user.create({ data: { email: `${TAG}-staff@v.local`, fullName: "S", passwordHash: "x", role: "admin" }, select: { id: true } });
  ids.staff = s.id;
  const [a, b] = await Promise.all([
    prisma.company.create({ data: { name: `${TAG} A`, inn: "0", taxRegime: "vat" }, select: { id: true } }),
    prisma.company.create({ data: { name: `${TAG} B`, inn: "0", taxRegime: "vat" }, select: { id: true } }),
  ]);
  ids.companyA = a.id;
  ids.companyB = b.id;
  const t = await prisma.deadlineTemplate.create({ data: { code: `${TAG}-T`, name: "QQS", obligationType: "x", periodicity: "monthly", anchorType: "fixed_day_of_month", dueDay: 20, effectiveFrom: new Date(Date.UTC(2097, 0, 1)), lifecycle: "active" }, select: { id: true } });
  ids.template = t.id;

  const oblBase = (companyId: string, ps: number) => ({ companyId, templateId: ids.template, templateVersion: 1, periodStart: new Date(Date.UTC(2097, 6, ps)), periodEnd: new Date(Date.UTC(2097, 7, 1)), periodKey: "2097-M07", dueAt: new Date(Date.UTC(2097, 7, 20)), status: "planned" as const });
  await prisma.obligation.create({ data: oblBase(ids.companyA, 1) });
  await prisma.obligation.create({ data: oblBase(ids.companyB, 2) }); // boshqa firma
  await prisma.invoice.create({ data: { companyId: ids.companyA, period: "2097-07", amount: 500000, status: "sent" } });
  await prisma.invoice.create({ data: { companyId: ids.companyB, period: "2097-07", amount: 999999, status: "sent" } });
});

afterAll(async () => {
  await prisma.clientRequest.deleteMany({ where: { companyId: { in: [ids.companyA, ids.companyB] } } });
  await prisma.clientUser.deleteMany({ where: { companyId: { in: [ids.companyA, ids.companyB] } } });
  await prisma.invoice.deleteMany({ where: { companyId: { in: [ids.companyA, ids.companyB] } } });
  await prisma.obligation.deleteMany({ where: { templateId: ids.template } });
  await prisma.deadlineTemplate.deleteMany({ where: { id: ids.template } });
  await prisma.company.deleteMany({ where: { id: { in: [ids.companyA, ids.companyB] } } });
  await prisma.auditLog.deleteMany({ where: { userId: ids.staff } });
  await prisma.user.deleteMany({ where: { id: ids.staff } });
  await prisma.$disconnect();
});

describe("admin creates client account", () => {
  it("returns a one-time password whose hash verifies", async () => {
    asStaff(ids.staff, "admin");
    const res = await admin.createClientUser(ids.companyA, `${TAG}-client@v.local`, "Client A");
    ids.clientA = res.id;
    const row = await prisma.clientUser.findUnique({ where: { id: res.id }, select: { passwordHash: true, companyId: true } });
    expect(row!.companyId).toBe(ids.companyA);
    expect(await bcrypt.compare(res.password, row!.passwordHash)).toBe(true);
  });
});

describe("company isolation (CRITICAL)", () => {
  it("client sees ONLY its own company's obligations + invoices", async () => {
    asClient(ids.clientA, ids.companyA);
    const obls = await portal.getPortalObligations();
    expect(obls.length).toBe(1);
    expect(obls[0].periodKey).toBe("2097-M07");

    const invs = await portal.getPortalInvoices();
    expect(invs.length).toBe(1);
    expect(invs[0].amount).toBe(500000); // A's, NOT B's 999999
    expect(invs.some((i) => i.amount === 999999)).toBe(false);

    const ov = await portal.getPortalOverview();
    expect(ov.companyName).toBe(`${TAG} A`);
    expect(ov.openObligations).toBe(1);
  });

  it("a staff (non-client) session is rejected from portal actions", async () => {
    asStaff(ids.staff, "admin");
    await expect(portal.getPortalObligations()).rejects.toThrow(/Unauthorized/);
  });
});

describe("ticket flow", () => {
  it("client opens a request; staff sees and answers it", async () => {
    asClient(ids.clientA, ids.companyA);
    const req = await portal.createClientRequest("Savol", "Hisobot qachon tayyor?");
    let mine = await portal.getPortalRequests();
    expect(mine.find((r) => r.id === req.id)?.status).toBe("open");

    asStaff(ids.staff, "admin");
    const staffView = await admin.getStaffClientRequests();
    expect(staffView.some((r) => r.id === req.id)).toBe(true);
    await admin.respondClientRequest(req.id, "Ertaga tayyor bo'ladi");

    asClient(ids.clientA, ids.companyA);
    mine = await portal.getPortalRequests();
    const answered = mine.find((r) => r.id === req.id);
    expect(answered?.status).toBe("answered");
    expect(answered?.responseText).toBe("Ertaga tayyor bo'ladi");
  });
});
