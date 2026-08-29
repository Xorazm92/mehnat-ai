/**
 * FINANCIAL SNAPSHOT + YEAR CLOSING:
 *   - yil harakati (income/outflow) to'g'ri hisoblanadi;
 *   - closing = opening + income − outflow;
 *   - keyingi yil openingBalance = shu yil closingBalance;
 *   - yopilgan yilning 12 oyi LOCKED bo'ladi;
 *   - takror yopish bloklanadi.
 * 2096 yil ishlatiladi — boshqa testlar 2097+ da ishlaydi, real ma'lumot 2025-26.
 * Live Postgres kerak.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "super_admin" as string } };

vi.mock("@/lib/auth", () => ({ auth: async () => SESSION }));
vi.mock("server-only", () => ({}));

const { prisma } = await import("@/lib/prisma");
const { closeYear, getOpeningBalance, unlockPeriod, getYearClosingState } = await import("@/server/accounting");
const { createExpense } = await import("@/server/kassa");

const TAG = `vitest-close-${Date.now()}`;
const YEAR = 2096;
const ids = { user: "", company: "", payment: "", kassa: "", expense: "", payout: "", channel: "" };

beforeAll(async () => {
  // Chiqim MANBASIZ yozilmaydi (server/kassa.ts) — test uchun naqd kanal.
  const ch = await prisma.disbursementChannel.create({
    data: { type: "cash", label: `${TAG}-cash` },
  });
  ids.channel = ch.id;
  await prisma.financialSnapshot.deleteMany({ where: { period: String(YEAR) } });
  await prisma.accountingPeriod.deleteMany({ where: { year: YEAR } });

  const user = await prisma.user.create({
    data: { email: `${TAG}@vitest.local`, fullName: `${TAG} admin`, passwordHash: "x", role: "super_admin" },
    select: { id: true },
  });
  ids.user = user.id;
  SESSION.user.id = user.id;

  const company = await prisma.company.create({
    data: { name: `${TAG} co`, inn: "000000002" },
    select: { id: true },
  });
  ids.company = company.id;

  // 2096 harakati: kirim 5M (payment) + 2M (kassa) = 7M; chiqim 1M (expense) + 0.5M (payout) = 1.5M
  ids.payment = (
    await prisma.payment.create({
      data: { companyId: company.id, period: `${YEAR}-03`, amount: 5_000_000, status: "paid" },
      select: { id: true },
    })
  ).id;
  ids.kassa = (
    await prisma.kassaEntry.create({
      data: { type: "income", category: `${TAG}`, amount: 2_000_000, date: new Date(YEAR, 3, 15) },
      select: { id: true },
    })
  ).id;
  ids.expense = (
    await prisma.kassaEntry.create({
    data: {
      type: "expense",
      amount: 1_000_000, date: new Date(YEAR, 4, 10), category: `${TAG}`, status: "approved" },
      select: { id: true },
    })
  ).id;
  ids.payout = (
    await prisma.payout.create({
      data: { employeeId: user.id, month: `${YEAR}-06`, amount: 500_000, paidAt: new Date(YEAR, 5, 20) },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  await prisma.financialSnapshot.deleteMany({ where: { period: String(YEAR) } });
  await prisma.accountingPeriod.deleteMany({ where: { year: YEAR } });
  await prisma.payment.deleteMany({ where: { id: ids.payment } });
  await prisma.kassaEntry.deleteMany({ where: { id: ids.kassa } });
  await prisma.kassaEntry.deleteMany({ where: { id: ids.expense } });
  await prisma.payout.deleteMany({ where: { id: ids.payout } });
  await prisma.auditLog.deleteMany({ where: { userId: ids.user } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

describe("year closing", () => {
  it("computes the year movement and closing balance correctly", async () => {
    const snapshot = await closeYear(YEAR);

    expect(Number(snapshot.income)).toBe(7_000_000);
    expect(Number(snapshot.outflow)).toBe(1_500_000);
    expect(Number(snapshot.closingBalance)).toBe(Number(snapshot.openingBalance) + 5_500_000);
  });

  it("locks all 12 months of the closed year", async () => {
    const locked = await prisma.accountingPeriod.count({
      where: { year: YEAR, status: "LOCKED", companyId: null },
    });
    expect(locked).toBe(12);

    // Yopilgan yilga xarajat kiritib bo'lmaydi.
    await expect(
      createExpense({ amount: 100_000, date: new Date(YEAR, 8, 5), category: "boshqa", channelId: ids.channel })
    ).rejects.toThrow(/yopilgan/);
  });

  it("provides next year's opening balance from the snapshot", async () => {
    const snapshot = await prisma.financialSnapshot.findFirst({
      where: { companyId: null, period: String(YEAR) },
    });
    const opening = await getOpeningBalance(YEAR + 1);
    expect(opening).toBe(Number(snapshot!.closingBalance));
  });

  it("refuses to close the same year twice", async () => {
    await expect(closeYear(YEAR)).rejects.toThrow(/allaqachon yopilgan/);
  });

  it("only super_admin may close a year", async () => {
    SESSION.user.role = "chief_accountant";
    await expect(closeYear(2095)).rejects.toThrow(/Superadmin/);
    SESSION.user.role = "super_admin";
  });

  it("unlocking one month of a closed year is possible for corrections", async () => {
    const period = await unlockPeriod(YEAR, 9, "sentabr xarajati kech kelib tushdi");
    expect(period.status).toBe("OPEN");

    const exp = await createExpense({
      amount: 100_000,
      date: new Date(YEAR, 8, 5),
      category: `${TAG}-correction`,
      channelId: ids.channel,
    });
    expect(exp.id).toBeTruthy();
    // tozalash
    const row = await prisma.kassaEntry.findUnique({ where: { id: exp.id }, select: { id: true } });
    await prisma.ledgerEntry.deleteMany({ where: { sourceId: row!.id } });
    await prisma.kassaEntry.deleteMany({ where: { id: row!.id } });
  });
});

// UI paneli uchun holat — tugma bosilmasidan OLDIN nima yetishmayotgani
// ko'rinishi kerak, aks holda foydalanuvchi xato matnini kutadi.
describe("getYearClosingState", () => {
  it("yopilmagan yilda 12 oyning hammasi ochiq deb sanaladi", async () => {
    const st = (await getYearClosingState(YEAR + 5)) as unknown as {
      closed: boolean;
      openMonths: number[];
      snapshot: unknown;
    };
    expect(st.closed).toBe(false);
    expect(st.snapshot).toBeNull();
    // Qator umuman yo'q → "OPEN" deb qaraladi, ya'ni yopishga ruxsat berilmaydi.
    expect(st.openMonths).toHaveLength(12);
  });

  it("yopilgan yilda snapshot qaytaradi", async () => {
    const st = (await getYearClosingState(YEAR)) as unknown as {
      closed: boolean;
      openMonths: number[];
      snapshot: { closingBalance: number; income: number } | null;
    };
    expect(st.closed).toBe(true);
    expect(st.snapshot).not.toBeNull();
    // Yuqoridagi test tuzatish uchun bitta oyni ochgan — panel buni ko'rsatadi.
    expect(st.openMonths).toEqual([9]);
  });

  it("super_admin bo'lmagan ham KO'RA oladi (bu o'qish amali)", async () => {
    SESSION.user.role = "chief_accountant";
    const st = (await getYearClosingState(YEAR)) as unknown as { closed: boolean };
    expect(st.closed).toBe(true);
    SESSION.user.role = "super_admin";
  });
});
