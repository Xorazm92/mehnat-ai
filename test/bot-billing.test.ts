/**
 * Integration tests for billing debt detection + reminder recording (Phase F).
 * Reuses the real Payment/Company model; needs a live Postgres. Fixtures are
 * TAG-isolated. Does not send any Telegram message — recording only.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { detectPeriodDebts } from "@/bot/contexts/billing/application/detect-debts";
import { recordPaymentReminder } from "@/bot/contexts/billing/application/record-reminder";

const TAG = `vitest-bill-${Date.now()}`;
const PERIOD = "2099-06";
const NOW = new Date(2099, 5, 15); // 15 June 2099 (day 15)
const ids = { company: "" };

beforeAll(async () => {
  const company = await prisma.company.create({
    data: {
      name: `${TAG} co`,
      inn: `93${Date.now() % 100000000}`,
      contractAmount: 5_000_000,
      paymentDay: 5,
      isActive: true,
    },
    select: { id: true },
  });
  ids.company = company.id;
});

afterAll(async () => {
  await prisma.paymentReminder.deleteMany({ where: { companyId: ids.company } });
  await prisma.payment.deleteMany({ where: { companyId: ids.company } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.$disconnect();
});

describe("detectPeriodDebts", () => {
  it("flags an unpaid company at the right escalation level", async () => {
    const debts = await detectPeriodDebts(prisma, PERIOD, NOW);
    const mine = debts.find((d) => d.companyId === ids.company);
    expect(mine).toBeDefined();
    expect(mine!.level).toBe("red"); // day 15, due day 5 → 10 days past ≥ 7
    expect(mine!.amountDue).toBe(5_000_000);
  });

  it("drops the company once it has paid", async () => {
    await prisma.payment.create({
      data: { companyId: ids.company, period: PERIOD, amount: 5_000_000, status: "paid" },
    });
    const debts = await detectPeriodDebts(prisma, PERIOD, NOW);
    expect(debts.find((d) => d.companyId === ids.company)).toBeUndefined();
    await prisma.payment.deleteMany({ where: { companyId: ids.company } });
  });

  it("does not let a pending plan amount hide the debt", async () => {
    // 'pending' qatordagi summa hali kelmagan pul — qarz to'liq ko'rinishi kerak.
    await prisma.payment.create({
      data: { companyId: ids.company, period: PERIOD, amount: 5_000_000, status: "pending" },
    });
    const debts = await detectPeriodDebts(prisma, PERIOD, NOW);
    const mine = debts.find((d) => d.companyId === ids.company);
    expect(mine).toBeDefined();
    expect(mine!.amountDue).toBe(5_000_000);
    await prisma.payment.deleteMany({ where: { companyId: ids.company } });
  });

  it("counts a partial payment against the debt", async () => {
    await prisma.payment.create({
      data: { companyId: ids.company, period: PERIOD, amount: 2_000_000, status: "partial" },
    });
    const debts = await detectPeriodDebts(prisma, PERIOD, NOW);
    const mine = debts.find((d) => d.companyId === ids.company);
    expect(mine).toBeDefined();
    expect(mine!.amountDue).toBe(3_000_000);
    await prisma.payment.deleteMany({ where: { companyId: ids.company } });
  });
});

describe("recordPaymentReminder", () => {
  it("records once per company+period+level (no spam)", async () => {
    const first = await recordPaymentReminder(prisma, {
      companyId: ids.company, period: PERIOD, level: "red", amountDue: 5_000_000,
    });
    const second = await recordPaymentReminder(prisma, {
      companyId: ids.company, period: PERIOD, level: "red", amountDue: 5_000_000,
    });
    expect(first.recorded).toBe(true);
    expect(second.recorded).toBe(false);
    expect(await prisma.paymentReminder.count({ where: { companyId: ids.company, period: PERIOD, level: "red" } })).toBe(1);
  });
});
