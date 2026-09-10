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
const { approveEmployeeSalary, createPayrollAdjustment, approvePayrollAdjustment } =
  await import("@/server/payroll");
const { createPayout, createAvansPayout, softDeletePayout, getPayouts } =
  await import("@/server/payouts");

const TAG = `vitest-payout-${Date.now()}`;
const MONTH = "2099-05-01"; // boshqa test fayllari bilan to'qnashmaydigan davr
const MONTH_KEY = "2099-05";
const ids = { employee: "", company: "", channel: "" };

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

  // PUL MANBAI. `createPayout` uni TALAB qiladi: oylik qaysi kassadan
  // chiqqani jurnalga (CASH oyog'i `channelId`) yoziladi va kassalar
  // jadvali shu o'lchovdan o'qiydi.
  const channel = await prisma.disbursementChannel.create({
    data: { type: "cash", label: `${TAG} kassa`, isActive: true },
    select: { id: true },
  });
  ids.channel = channel.id;
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
  await prisma.disbursementChannel.deleteMany({ where: { id: ids.channel } });
  await prisma.user.deleteMany({ where: { id: ids.employee } });
  await prisma.$disconnect();
});

describe("payout lifecycle", () => {
  it("salary approved = obligation only, no money out yet", async () => {
    await approveEmployeeSalary({ employeeId: ids.employee, month: MONTH });

    // Majburiyat KANONIK oy kalitida yotadi — `Payout.month` bilan bir xil
    // (`MONTH_KEY`). Ilgari `approveEmployeeSalary` chaqiruvchi bergan shaklni
    // ("2099-05-01") o'zgarishsiz yozardi va bitta oy bazada ikki xil kalit
    // bilan yashardi; dublikat qo'riqchisi ham shu sababdan ko'r edi.
    const obligation = await prisma.payrollAdjustment.findFirst({
      where: { employeeId: ids.employee, month: MONTH_KEY, adjustmentType: "payment" },
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
      createPayout({ employeeId: ids.employee, month: "2099-06", amount: 100_000, channelId: ids.channel })
    ).rejects.toThrow(/majburiyati yo'q/);
  });

  it("records a partial payout with a balanced ledger transaction", async () => {
    const payout = await createPayout({
      employeeId: ids.employee,
      month: MONTH_KEY,
      amount: 800_000,
      channelId: ids.channel,
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

    // "QAYSI MANBADAN QAYSI XODIMGA" — ikkala o'lchov ham jurnalda.
    // CASH oyog'ida kanal bo'lmasa `getCashDeskReport` to'lovni "Kanali
    // ko'rsatilmagan" qatoriga qo'yardi va qaysi kassa kamaygani noma'lum
    // qolardi; SALARY_EXPENSE oyog'idagi `subjectId` esa xodim kesimini
    // beradi.
    expect(payout.channelId).toBe(ids.channel);
    const cashLeg = legs.find((l) => l.accountId === "CASH")!;
    expect(cashLeg.channelId).toBe(ids.channel);
    const salaryLeg = legs.find((l) => l.accountId === "SALARY_EXPENSE")!;
    expect(salaryLeg.subjectId).toBe(ids.employee);
  });

  it("blocks a payout with no funding source", async () => {
    await expect(
      // @ts-expect-error — manbasiz chaqiruv tipda ham taqiqlangan; bu yerda
      // ATAYIN yuboriladi: forma chetlab o'tilsa ham server rad etishi kerak.
      createPayout({ employeeId: ids.employee, month: MONTH_KEY, amount: 100_000 })
    ).rejects.toThrow(/manba/i);
  });

  it("pays out the remaining obligation in full", async () => {
    await createPayout({ employeeId: ids.employee, month: MONTH_KEY, amount: 1_200_000, channelId: ids.channel });

    const paid = await prisma.payout.aggregate({
      where: { employeeId: ids.employee, month: MONTH_KEY, deletedAt: null },
      _sum: { amount: true },
    });
    expect(Number(paid._sum.amount)).toBe(2_000_000);
  });

  it("blocks any payout beyond the obligation (double payout)", async () => {
    await expect(
      createPayout({ employeeId: ids.employee, month: MONTH_KEY, amount: 1, channelId: ids.channel })
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
    const again = await createPayout({ employeeId: ids.employee, month: MONTH_KEY, amount: 800_000, channelId: ids.channel });
    expect(Number(again.amount)).toBe(800_000);
  });

  it("wrote audit rows for every payout mutation", async () => {
    const audits = await prisma.auditLog.count({
      where: { tableName: "Payout", userId: ids.employee },
    });
    expect(audits).toBeGreaterThanOrEqual(3); // 3 create + 1 delete
  });
});

// =====================================================
// AVANS — oylikning oldindan berilgan qismi
// =====================================================
// REGRESSIYA. Ilgari `obligationAndPaid` avansni MAJBURIYAT deb sanardi va
// shu bilan birga avans payoutini "berilgan" deb hisoblardi:
//     remaining = (oylik + avans) − avans = oylik
// ya'ni avans hech qachon ayirilmasdi va xodimga oylik + avans to'lash
// mumkin edi. Endi avans faqat TO'LOV tomonida (lib/payrollObligation.ts).
describe("avans oylikdan ayiriladi", () => {
  const AVANS_MONTH = "2099-07-01";
  const AVANS_KEY = "2099-07";

  const paidTotal = async () => {
    const agg = await prisma.payout.aggregate({
      where: { employeeId: ids.employee, month: AVANS_KEY, deletedAt: null },
      _sum: { amount: true },
    });
    return Number(agg._sum.amount ?? 0);
  };

  it("avans tasdig'i darhol Payout yozadi", async () => {
    // Majburiyat: shartnoma 10 mln × 20% = 2 000 000.
    await approveEmployeeSalary({ employeeId: ids.employee, month: AVANS_MONTH });

    const adj = await createPayrollAdjustment({
      month: AVANS_MONTH,
      employeeId: ids.employee,
      adjustmentType: "avans",
      amount: -500_000, // UI konventsiyasi: avans manfiy yuboriladi
      reason: "vitest avans",
    });
    await approvePayrollAdjustment(adj.id, { channelId: ids.channel });

    expect(await paidTotal()).toBe(500_000);
  });

  it("qolgan majburiyatdan avans ayirilgan (2 000 000 − 500 000)", async () => {
    await expect(
      createPayout({ employeeId: ids.employee, month: AVANS_KEY, amount: 1_500_001, channelId: ids.channel })
    ).rejects.toThrow(/Ortiqcha to'lov bloklandi/);

    await createPayout({ employeeId: ids.employee, month: AVANS_KEY, amount: 1_500_000, channelId: ids.channel });

    // Jami berilgan = majburiyat. Avans ustiga qo'shimcha pul chiqmadi.
    expect(await paidTotal()).toBe(2_000_000);
  });

  it("majburiyat to'lingandan keyin bir tiyin ham o'tmaydi", async () => {
    await expect(
      createPayout({ employeeId: ids.employee, month: AVANS_KEY, amount: 1, channelId: ids.channel })
    ).rejects.toThrow(/Ortiqcha to'lov bloklandi/);
  });
});

// =====================================================
// QO'LDA BONUS VA JARIMA majburiyatga ta'sir qiladi
// =====================================================
// REGRESSIYA. Majburiyat faqat `payment` va `avans` dan yig'ilardi, ya'ni
// qo'lda berilgan bonusni to'lashning ILOJI YO'Q edi (UI uni "Jami maosh"
// ga qo'shar, server esa `Ortiqcha to'lov bloklandi` deb rad etardi), qo'lda
// jarima esa to'lov chegarasini umuman kamaytirmasdi.
describe("qo'lda bonus va jarima majburiyatni o'zgartiradi", () => {
  const MONTH_FULL = "2099-08-01";
  const KEY = "2099-08";

  it("bonus majburiyatga qo'shiladi, jarima ayiriladi", async () => {
    await approveEmployeeSalary({ employeeId: ids.employee, month: MONTH_FULL }); // 2 000 000

    const bonus = await createPayrollAdjustment({
      month: MONTH_FULL,
      employeeId: ids.employee,
      adjustmentType: "bonus",
      amount: 300_000,
      reason: "vitest bonus",
    });
    await approvePayrollAdjustment(bonus.id);

    const jarima = await createPayrollAdjustment({
      month: MONTH_FULL,
      employeeId: ids.employee,
      adjustmentType: "jarima",
      amount: -100_000,
      reason: "vitest jarima",
    });
    await approvePayrollAdjustment(jarima.id);

    // 2 000 000 + 300 000 − 100 000 = 2 200 000
    await expect(
      createPayout({ employeeId: ids.employee, month: KEY, amount: 2_200_001, channelId: ids.channel })
    ).rejects.toThrow(/Ortiqcha to'lov bloklandi/);

    const payout = await createPayout({ employeeId: ids.employee, month: KEY, amount: 2_200_000, channelId: ids.channel });
    expect(Number(payout.amount)).toBe(2_200_000);
  });

  it("tasdiqlanmagan bonus majburiyatni oshirmaydi", async () => {
    await createPayrollAdjustment({
      month: MONTH_FULL,
      employeeId: ids.employee,
      adjustmentType: "bonus",
      amount: 900_000,
      reason: "vitest tasdiqlanmagan bonus",
    });

    await expect(
      createPayout({ employeeId: ids.employee, month: KEY, amount: 1, channelId: ids.channel })
    ).rejects.toThrow(/Ortiqcha to'lov bloklandi/);
  });
});

// =====================================================
// KASSADAN BIR QADAMDA AVANS (`createAvansPayout`)
// =====================================================
// Xarajat formasidagi "Avans" toifasi shu yo'ldan yuradi. Farqi:
// `createPayout` majburiyat tasdiqlanmagan oyga UMUMAN yozmaydi, avans esa
// aynan shu holat uchun — pul oldin beriladi, oy keyin hisoblanadi.
describe("kassadan bir qadamda avans", () => {
  const MONTH_FULL = "2099-10-01";
  const KEY = "2099-10";

  it("majburiyat tasdiqlanmagan oyga ham avans yozadi", async () => {
    // Oddiy to'lov shu oyga o'tmaydi — chegara shu.
    await expect(
      createPayout({ employeeId: ids.employee, month: KEY, amount: 100_000, channelId: ids.channel })
    ).rejects.toThrow(/majburiyati yo'q/);

    const payout = await createAvansPayout({
      employeeId: ids.employee,
      month: KEY,
      amount: 600_000,
      channelId: ids.channel,
      note: "vitest kassa avansi",
    });
    expect(Number(payout.amount)).toBe(600_000);
    expect(payout.channelId).toBe(ids.channel);

    // Tuzatma darhol tasdiqlangan va to'lovga bog'langan.
    const adj = await prisma.payrollAdjustment.findFirst({
      where: { employeeId: ids.employee, month: KEY, adjustmentType: "avans", deletedAt: null },
    });
    expect(adj).not.toBeNull();
    expect(adj!.isApproved).toBe(true);
    expect(payout.adjustmentId).toBe(adj!.id);

    // Jurnal: "qaysi manbadan qaysi xodimga".
    const legs = await prisma.ledgerEntry.findMany({
      where: { sourceTable: "Payout", sourceId: payout.id },
    });
    expect(legs).toHaveLength(2);
    expect(legs.find((l) => l.accountId === "CASH")!.channelId).toBe(ids.channel);
    expect(legs.find((l) => l.accountId === "SALARY_EXPENSE")!.subjectId).toBe(ids.employee);
  });

  it("manbasiz avans rad etiladi", async () => {
    await expect(
      // @ts-expect-error — manbasiz chaqiruv tipda ham taqiqlangan
      createAvansPayout({ employeeId: ids.employee, month: KEY, amount: 100_000 })
    ).rejects.toThrow(/manba/i);
  });

  it("oy hisoblanganda avans qoldiqdan ayiriladi", async () => {
    // Majburiyat: 10 mln × 20% = 2 000 000; avans 600 000 berilgan.
    await approveEmployeeSalary({ employeeId: ids.employee, month: MONTH_FULL });

    await expect(
      createPayout({ employeeId: ids.employee, month: KEY, amount: 1_400_001, channelId: ids.channel })
    ).rejects.toThrow(/Ortiqcha to'lov bloklandi/);

    await createPayout({ employeeId: ids.employee, month: KEY, amount: 1_400_000, channelId: ids.channel });

    const agg = await prisma.payout.aggregate({
      where: { employeeId: ids.employee, month: KEY, deletedAt: null },
      _sum: { amount: true },
    });
    expect(Number(agg._sum.amount)).toBe(2_000_000);
  });

  it("majburiyat to'liq to'langach avans ham o'tmaydi", async () => {
    await expect(
      createAvansPayout({ employeeId: ids.employee, month: KEY, amount: 1, channelId: ids.channel })
    ).rejects.toThrow(/allaqachon tasdiqlangan/);
  });
});
