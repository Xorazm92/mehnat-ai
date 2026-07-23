/**
 * TIME ENTRY + cost rate. Live Postgres + mocked auth.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "" } };
vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { logTime, getCompanyTimeCost } = await import("@/server/timeEntries");
const { setCostRate } = await import("@/server/costRates");

const TAG = `vitest-time-${Date.now()}`;
const ids = { userA: "", company: "" };
const actor = (id: string, role: string) => { SESSION.user.id = id; SESSION.user.role = role; };

beforeAll(async () => {
  const a = await prisma.user.create({ data: { email: `${TAG}-a@v.local`, fullName: "A", passwordHash: "x", role: "accountant" }, select: { id: true } });
  ids.userA = a.id;
  const company = await prisma.company.create({ data: { name: `${TAG} MChJ`, inn: "0", taxRegime: "vat", accountantId: a.id }, select: { id: true } });
  ids.company = company.id;
});

afterAll(async () => {
  await prisma.timeEntry.deleteMany({ where: { userId: ids.userA } });
  await prisma.employeeCostRate.deleteMany({ where: { userId: ids.userA } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.auditLog.deleteMany({ where: { userId: ids.userA } });
  await prisma.user.deleteMany({ where: { id: ids.userA } });
  await prisma.$disconnect();
});

describe("cost rate versioning (setCostRate)", () => {
  it("closes the previous open rate when a new one starts", async () => {
    actor(ids.userA, "admin");
    await setCostRate(ids.userA, 100, "2026-01-01");
    await setCostRate(ids.userA, 150, "2026-06-01");
    const rates = await prisma.employeeCostRate.findMany({ where: { userId: ids.userA }, orderBy: { effectiveFrom: "asc" } });
    expect(rates).toHaveLength(2);
    expect(rates[0].effectiveTo?.toISOString().slice(0, 10)).toBe("2026-05-31"); // yopilgan
    expect(rates[1].effectiveTo).toBeNull(); // ochiq
  });
});

describe("logTime + getCompanyTimeCost", () => {
  it("computes labor cost from the rate in effect on the entry date", async () => {
    actor(ids.userA, "accountant");
    await logTime({ minutes: 90, date: "2026-07-15", companyId: ids.company }); // 1.5h @ 150 = 225
    await logTime({ minutes: 60, date: "2026-07-16", companyId: ids.company }); // 1h @ 150 = 150

    const res = await getCompanyTimeCost(ids.company, "2026-07-01", "2026-07-31");
    expect(res.entryCount).toBe(2);
    expect(res.totalMinutes).toBe(150);
    expect(res.totalCost).toBe(375); // 225 + 150
  });

  it("uses the older rate for an entry dated in the earlier period", async () => {
    actor(ids.userA, "accountant");
    await logTime({ minutes: 60, date: "2026-03-10", companyId: ids.company }); // 1h @ 100 = 100
    const res = await getCompanyTimeCost(ids.company, "2026-03-01", "2026-03-31");
    expect(res.totalCost).toBe(100);
  });
});
