/**
 * PAYOUT hayot sikli — majburiyat (PayrollAdjustment) va real to'lov (Payout)
 * ajratuvining regressiya testlari:
 *   - oylik hisoblandi lekin berilmadi (majburiyat bor, payout yo'q);
 *   - qisman berildi; to'liq berildi;
 *   - ortiqcha/ikkinchi marta payout bloklandi;
 *   - payout double-entry ledger bilan atomar; soft delete → reversal.
 * Live Postgres kerak (DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "super_admin" as string } };

vi.mock("@/lib/auth", () => ({ auth: async () => SESSION }));
vi.mock("server-only", () => ({}));

const { prisma } = await import("@/lib/prisma");
const { approveEmployeeSalary } = await import("@/server/payroll");
const { createPayout, softDeletePayout, getPayouts } = await import("@/server/payouts");

const TAG = `vitest-payout-${Date.now()}`;
const MONTH = "2099-05-01"; // boshqa test fayllari bilan to'qnashmaydigan davr
const MONTH_KEY = "2099-05";
const ids = { employee: "", company: "" };

beforeAll(async () => {
  const employee = await prisma.user.create({
    data: {
      email: `${TAG}@vitest.local`,
      fullName: `${TAG} accountant`,
      passwordHash: "x",
      role: "accountant",
    },
    select: { id: true },
  });
  ids.employee = employee.id;
  SESSION.user.id = employee.id;

  // contract 10,000,000 × accountantPerc 20% → majburiyat (baza) 2,000,000
  const company = await prisma.company.create({
    data: {
      name: `${TAG} company`,
      inn: "000000001",
      contractAmount: 10_000_000,
      accountantId: employee.id,
      accountantPerc: 20,
    },
    select: { id: true },
  });
  ids.company = company.id;
});

afterAll(async () => {
  const payouts = await prisma.payout.findMany({
    where: { employeeId: ids.employee },
    select: { id: true },
  });
  await prisma.ledgerEntry.deleteMany({
    where: { sourceId: { in: payouts.map((p) => p.id) } },
  });
  await prisma.payout.deleteMany({ where: { employeeId: ids.employee } });
  await prisma.payrollAdjustment.deleteMany({ where: { employeeId: ids.employee } });
  await prisma.auditLog.deleteMany({ where: { userId: ids.employee } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.user.deleteMany({ where: { id: ids.employee } });
  await prisma.$disconnect();
});

describe("payout lifecycle", () => {
  it("salary approved = obligation only, no money out yet", async () => {
    await approveEmployeeSalary({ employeeId: ids.employee, month: MONTH });

    const obligation = await prisma.payrollAdjustment.findFirst({
      where: { employeeId: ids.employee, month: MONTH, adjustmentType: "payment" },
    });
    expect(obligation).not.toBeNull();
    expect(obligation!.isApproved).toBe(true);
    expect(Number(obligation!.amount)).toBe(2_000_000);

    // Hech qanday payout yo'q — pul hali berilmagan.
    const payouts = await prisma.payout.count({
      where: { employeeId: ids.employee, month: MONTH_KEY, deletedAt: null },
    });
    expect(payouts).toBe(0);
  });

  it("blocks a payout with no approved obligation for that month", async () => {
    await expect(
      createPayout({ employeeId: ids.employee, month: "2099-06", amount: 100_000 })
    ).rejects.toThrow(/majburiyati yo'q/);
  });

  it("records a partial payout with a balanced ledger transaction", async () => {
    const payout = await createPayout({
      employeeId: ids.employee,
      month: MONTH_KEY,
      amount: 800_000,
      note: "qisman to'lov",
    });
    expect(Number(payout.amount)).toBe(800_000);

    const legs = await prisma.ledgerEntry.findMany({
      where: { sourceTable: "Payout", sourceId: payout.id },
    });
    expect(legs).toHaveLength(2);
    const debit = legs.reduce((s, l) => s + Number(l.debit), 0);
    const credit = legs.reduce((s, l) => s + Number(l.credit), 0);
    expect(debit).toBe(800_000);
    expect(credit).toBe(800_000);
    expect(legs.some((l) => l.accountId === "SALARY_EXPENSE" && Number(l.debit) === 800_000)).toBe(true);
    expect(legs.some((l) => l.accountId === "CASH" && Number(l.credit) === 800_000)).toBe(true);
  });

  it("pays out the remaining obligation in full", async () => {
    await createPayout({ employeeId: ids.employee, month: MONTH_KEY, amount: 1_200_000 });

    const paid = await prisma.payout.aggregate({
      where: { employeeId: ids.employee, month: MONTH_KEY, deletedAt: null },
      _sum: { amount: true },
    });
    expect(Number(paid._sum.amount)).toBe(2_000_000);
  });

  it("blocks any payout beyond the obligation (double payout)", async () => {
    await expect(
      createPayout({ employeeId: ids.employee, month: MONTH_KEY, amount: 1 })
    ).rejects.toThrow(/Ortiqcha to'lov bloklandi/);
  });

  it("soft-deleting a payout reverses its ledger and frees the obligation", async () => {
    const mine = await getPayouts({ month: MONTH_KEY, employeeId: ids.employee });
    const target = (mine as unknown as { id: string; amount: number }[]).find(
      (p) => Number(p.amount) === 800_000
    )!;
    expect(target).toBeDefined();

    await softDeletePayout(target.id, "test reversal");

    const row = await prisma.payout.findUnique({ where: { id: target.id } });
    expect(row!.deletedAt).not.toBeNull();
    expect(row!.deleteReason).toBe("test reversal");

    // Reversal: manba bo'yicha netto nol.
    const legs = await prisma.ledgerEntry.findMany({ where: { sourceId: target.id } });
    const net = legs.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
    expect(net).toBe(0);

    // Endi 800k qayta to'lash mumkin (majburiyat bo'shadi).
    const again = await createPayout({ employeeId: ids.employee, month: MONTH_KEY, amount: 800_000 });
    expect(Number(again.amount)).toBe(800_000);
  });

  it("wrote audit rows for every payout mutation", async () => {
    const audits = await prisma.auditLog.count({
      where: { tableName: "Payout", userId: ids.employee },
    });
    expect(audits).toBeGreaterThanOrEqual(3); // 3 create + 1 delete
  });
});
