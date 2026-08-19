/**
 * QO'LDA KIRITILGAN TUSHUM — mijozning qarzini kamaytirishi shart.
 *
 * NIMA UCHUN BU TEST BOR: kirim kassasidagi naqd/plastik forma
 * `createKassaEntry` ni chaqirardi, ya'ni mijozga BOG'LANMAGAN
 * `KassaEntry(income)` yozardi. Qarz esa `Payment` dan hisoblanadi
 * (`lib/debt.ts`) — natijada naqd to'lagan mijoz qarzdorlar ro'yxatida
 * QOLAVERARDI. Bank va 1C plastik importi to'g'ri yo'ldan yurar edi, faqat
 * qo'lda kiritish chetda qolgan edi.
 *
 * Live Postgres kerak (TEST_DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prisma } = await import("@/lib/prisma");
const { applyAllocation } = await import("@/lib/bank/importStatement");
const { computeCompanyDebt, billingStartFor } = await import("@/lib/debt");

const TAG = `vitest-manual-${Date.now()}`;
const ids = { client: "", channel: "" };

// Shartnoma 2099-08 dan — hisob shu oydan boshlanadi, "1 oy oldin" qarzi yo'q.
const CONTRACT_DATE = new Date(Date.UTC(2099, 7, 1));
const RECEIVED = new Date(Date.UTC(2099, 8, 10)); // 2099-09-10, ochiq davr

beforeAll(async () => {
  const client = await prisma.company.create({
    data: {
      name: `${TAG} MIJOZ`,
      inn: `9${Date.now()}`.slice(0, 9),
      contractAmount: 3_000_000,
      contractDate: CONTRACT_DATE,
    },
    select: { id: true },
  });
  ids.client = client.id;

  const channel = await prisma.disbursementChannel.create({
    data: { label: `${TAG} seyf`, type: "cash", isActive: true },
    select: { id: true },
  });
  ids.channel = channel.id;
});

afterAll(async () => {
  await prisma.paymentAllocation.deleteMany({ where: { payment: { companyId: ids.client } } });
  await prisma.payment.deleteMany({ where: { companyId: ids.client } });
  await prisma.kassaEntry.deleteMany({ where: { companyId: ids.client } });
  await prisma.disbursementChannel.deleteMany({ where: { id: ids.channel } });
  await prisma.company.deleteMany({ where: { id: ids.client } });
  await prisma.$disconnect();
});

/** Firmaning joriy qarzi — `/kassa/qarzdorlik` bilan AYNAN bir formuladan. */
async function debtOf(companyId: string, currentPeriod: string) {
  const c = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: {
      contractAmount: true,
      contractDate: true,
      payments: { where: { deletedAt: null }, select: { period: true, amount: true, status: true } },
    },
  });
  return computeCompanyDebt({
    contractAmount: c.contractAmount,
    billingStart: billingStartFor(c.contractDate),
    currentPeriod,
    payments: c.payments,
    openingDebt: 0,
  });
}

describe("qo'lda kiritilgan naqd tushum", () => {
  it("Payment yozadi va mijozning qarzini kamaytiradi", async () => {
    const before = await debtOf(ids.client, "2099-09");
    expect(before.paid).toBe(0);
    expect(before.outstanding).toBeGreaterThan(0);

    await applyAllocation(prisma, {
      companyId: ids.client,
      amount: 1_000_000,
      receivedAt: RECEIVED,
      source: "naqd",
      paymentMethod: "naqd",
      dedupKey: `manual:naqd:${ids.client}:2099-09-10:1000000.00`,
      channelId: ids.channel,
    });

    const after = await debtOf(ids.client, "2099-09");
    expect(after.paid).toBe(1_000_000);
    expect(after.outstanding).toBe(before.outstanding - 1_000_000);
  });

  it("kanal saqlanadi — 'qaysi kassaga tushdi' savoli javobsiz qolmaydi", async () => {
    const alloc = await prisma.paymentAllocation.findFirst({
      where: { payment: { companyId: ids.client }, source: "naqd" },
      select: { channelId: true },
    });
    expect(alloc?.channelId).toBe(ids.channel);
  });

  it("BALANS IKKI MARTA SANALMAYDI — KassaEntry yozilmaydi", async () => {
    // `lib/balance.ts` kirimni Payment'dan ham, KassaEntry'dan ham sanaydi.
    const kassaRows = await prisma.kassaEntry.count({
      where: { companyId: ids.client, type: "income" },
    });
    expect(kassaRows).toBe(0);
  });

  it("aynan bir xil tushum ikkinchi marta kiritilsa summa SHISHMAYDI", async () => {
    const key = `manual:naqd:${ids.client}:2099-09-10:1000000.00`;
    await applyAllocation(prisma, {
      companyId: ids.client,
      amount: 1_000_000,
      receivedAt: RECEIVED,
      source: "naqd",
      paymentMethod: "naqd",
      dedupKey: key,
      channelId: ids.channel,
    });

    const allocations = await prisma.paymentAllocation.count({
      where: { payment: { companyId: ids.client } },
    });
    expect(allocations).toBe(1);

    const after = await debtOf(ids.client, "2099-09");
    expect(after.paid).toBe(1_000_000);
  });

  it("boshqa kunlik ikkinchi to'lov QO'SHILADI (dedup uni to'smaydi)", async () => {
    await applyAllocation(prisma, {
      companyId: ids.client,
      amount: 500_000,
      receivedAt: new Date(Date.UTC(2099, 8, 20)),
      source: "plastik",
      paymentMethod: "plastik",
      dedupKey: `manual:plastik:${ids.client}:2099-09-20:500000.00`,
      channelId: ids.channel,
    });

    const after = await debtOf(ids.client, "2099-09");
    // Payment.amount taqsimotlar YIG'INDISI — naqd + plastik bir oyda.
    expect(after.paid).toBe(1_500_000);
  });
});
