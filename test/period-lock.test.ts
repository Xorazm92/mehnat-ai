/**
 * ACCOUNTING PERIOD LOCK — yopilgan davrga moliyaviy mutation kirmasligi:
 *   - yopilgan oyga xarajat/kassa/oylik tuzatmasi bloklanadi;
 *   - faqat super_admin qulflaydi/ochadi;
 *   - unlock'dan keyin yozish yana ishlaydi.
 * Live Postgres kerak. 2097 yil ishlatiladi (boshqa testlar bilan to'qnashmaydi).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "super_admin" as string } };

vi.mock("@/lib/auth", () => ({ auth: async () => SESSION }));
vi.mock("server-only", () => ({}));

const { prisma } = await import("@/lib/prisma");
const { lockPeriod, unlockPeriod } = await import("@/server/accounting");
const { createKassaEntry, createExpense } = await import("@/server/kassa");
const { createPayrollAdjustment, approveEmployeeSalary } = await import("@/server/payroll");

const TAG = `vitest-lock-${Date.now()}`;
const YEAR = 2097;
const LOCKED_DATE = new Date(2097, 4, 10); // 2097-05-10
const ids = { user: "" };

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `${TAG}@vitest.local`, fullName: `${TAG} admin`, passwordHash: "x", role: "super_admin" },
    select: { id: true },
  });
  ids.user = user.id;
  SESSION.user.id = user.id;
  SESSION.user.role = "super_admin";
  await prisma.accountingPeriod.deleteMany({ where: { year: YEAR } });
});

afterAll(async () => {
  await prisma.kassaEntry.deleteMany({ where: { createdBy: ids.user } });
  await prisma.ledgerEntry.deleteMany({ where: { createdBy: ids.user } });
  await prisma.accountingPeriod.deleteMany({ where: { year: YEAR } });
  await prisma.auditLog.deleteMany({ where: { userId: ids.user } });
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

describe("period lock", () => {
  it("only super_admin can lock or unlock a period", async () => {
    SESSION.user.role = "admin";
    await expect(lockPeriod(YEAR, 5)).rejects.toThrow(/Superadmin/);
    SESSION.user.role = "super_admin";
  });

  it("locks a period and blocks every financial mutation into it", async () => {
    const period = await lockPeriod(YEAR, 5);
    expect(period.status).toBe("LOCKED");

    // Xarajat — yopiq oy sanasi bilan
    await expect(
      createExpense({ amount: 500_000, date: LOCKED_DATE, category: "boshqa" })
    ).rejects.toThrow(/yopilgan/);

    // Kassa yozuvi
    await expect(
      createKassaEntry({ type: "income", category: "boshqa", amount: 100_000, date: LOCKED_DATE })
    ).rejects.toThrow(/yopilgan/);

    // Oylik tuzatmasi
    await expect(
      createPayrollAdjustment({
        month: "2097-05",
        employeeId: ids.user,
        adjustmentType: "bonus",
        amount: 100_000,
        reason: "test",
      })
    ).rejects.toThrow(/yopilgan/);

    // Oylik tasdig'i ham
    await expect(
      approveEmployeeSalary({ employeeId: ids.user, month: "2097-05-01" })
    ).rejects.toThrow(/yopilgan/);
  });

  it("does not block a neighbouring open month", async () => {
    const entry = await createKassaEntry({
      type: "income",
      category: `${TAG}-open`,
      amount: 100_000,
      date: new Date(2097, 5, 10), // 2097-06 — ochiq
    });
    expect(entry.id).toBeTruthy();
  });

  it("unlock re-opens the period for writes", async () => {
    const period = await unlockPeriod(YEAR, 5, "tuzatish uchun ochildi");
    expect(period.status).toBe("OPEN");

    const entry = await createKassaEntry({
      type: "income",
      category: `${TAG}-unlocked`,
      amount: 100_000,
      date: LOCKED_DATE,
    });
    expect(entry.id).toBeTruthy();
  });

  it("audited who locked and unlocked, and when", async () => {
    const audits = await prisma.auditLog.findMany({
      where: { tableName: "AccountingPeriod", userId: ids.user },
    });
    expect(audits.length).toBeGreaterThanOrEqual(2); // lock + unlock
    const statuses = audits.map((a) => (a.newData as { status?: string })?.status);
    expect(statuses).toContain("LOCKED");
    expect(statuses).toContain("OPEN");
  });
});
