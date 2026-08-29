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
const { unlockPeriod } = await import("@/server/accounting");
const { createKassaEntry, createExpense } = await import("@/server/kassa");
const { createPayrollAdjustment, approveEmployeeSalary } = await import("@/server/payroll");

const TAG = `vitest-lock-${Date.now()}`;
const YEAR = 2097;
const LOCKED_DATE = new Date(2097, 4, 10); // 2097-05-10
const ids = { user: "", channel: "" };

beforeAll(async () => {
  // Chiqim endi MANBASIZ yozilmaydi (server/kassa.ts) — test uchun bitta
  // naqd kanal yaratamiz, aks holda qulf tekshiruvi kanal xatosiga urilardi.
  const ch = await prisma.disbursementChannel.create({
    data: { type: "cash", label: `${TAG}-cash` },
  });
  ids.channel = ch.id;
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

/**
 * Davrni LOCKED holatiga qo'yish — to'g'ridan-to'g'ri yozuv bilan.
 *
 * Ilgari bu yerda `lockPeriod` chaqirilardi. U olib tashlandi: `closeMonth`
 * `AccountingPeriod` holat mashinasini boshqaradi va oyni checklist ortida
 * yopadi, `lockPeriod` esa o'sha qatorlarga checklist'siz yozardi (ADR-0011).
 *
 * Bu testning ASL mavzusi qulflash amali emas — u `lib/periodLock.ts` dagi
 * YOZUV QO'RIQCHISI: yopilgan oyga moliyaviy yozuv tushmasligi. Shuning uchun
 * holatni qanday o'rnatish muhim emas, qo'riqchi nima qilishi muhim.
 */
async function lockDirectly(year: number, month: number) {
  const existing = await prisma.accountingPeriod.findFirst({ where: { companyId: null, year, month } });
  const data = { status: "LOCKED", lockedBy: ids.user, lockedAt: new Date() };
  return existing
    ? prisma.accountingPeriod.update({ where: { id: existing.id }, data })
    : prisma.accountingPeriod.create({ data: { companyId: null, year, month, ...data } });
}

describe("period lock", () => {
  it("only super_admin can unlock a period", async () => {
    SESSION.user.role = "admin";
    await expect(unlockPeriod(YEAR, 5, "sabab")).rejects.toThrow(/Superadmin/);
    SESSION.user.role = "super_admin";
  });

  it("a locked period blocks every financial mutation into it", async () => {
    const period = await lockDirectly(YEAR, 5);
    expect(period.status).toBe("LOCKED");

    // Xarajat — yopiq oy sanasi bilan
    await expect(
      createExpense({ amount: 500_000, date: LOCKED_DATE, category: "boshqa", channelId: ids.channel })
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

  it("unlocking is audited, with the reason", async () => {
    // Qulflashning auditi bu yerda emas — u `closeMonth` ning ishi va
    // test/month-closing.test.ts da tekshiriladi.
    const audits = await prisma.auditLog.findMany({
      where: { tableName: "AccountingPeriod", userId: ids.user },
    });
    const opened = audits.filter((a) => (a.newData as { status?: string })?.status === "OPEN");
    expect(opened.length).toBeGreaterThanOrEqual(1);
    expect((opened[0].newData as { reason?: string })?.reason).toBeTruthy();
  });
});
