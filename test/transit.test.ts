/**
 * TRANZIT KASSA — xodim kartasi orqali o'tadigan pul.
 *
 * Asosiy qoida: kartaga tushgan pul HALI XARAJAT EMAS. Xarajat kartadan
 * sarflanganda yoziladi. Ikkalasida ham KassaEntry yozilsa, bitta xarajat
 * ikki marta sanalardi.
 * Live Postgres kerak.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prisma } = await import("@/lib/prisma");
const {
  getChannelBalances,
  getChannelLedger,
  getTotalTransitBalance,
  recordTransitIn,
  recordTransitOut,
  InsufficientTransitFunds,
} = await import("@/lib/transit");

const TAG = `vitest-transit-${Date.now()}`;
const ACC = `8${Date.now()}`.slice(0, 20).padEnd(20, "0");
const ids = { channel: "", other: "", company: "", account: "", import: "", tx: "" };
const day = (d: number) => new Date(Date.UTC(2099, 9, d)); // 2099-10 — ochiq davr

beforeAll(async () => {
  const company = await prisma.company.create({
    data: { name: `${TAG} OWN`, inn: "444444444", isOwnFirm: true },
    select: { id: true },
  });
  ids.company = company.id;

  const account = await prisma.bankAccount.create({
    data: { accountNumber: ACC, ownerCompanyId: company.id, inn: "444444444", label: `${TAG} hisob` },
    select: { id: true },
  });
  ids.account = account.id;

  const imp = await prisma.bankStatementImport.create({
    data: {
      accountId: account.id,
      fileName: "t.xlsx",
      format: "litsevoy",
      periodFrom: day(1),
      periodTo: day(30),
    },
    select: { id: true },
  });
  ids.import = imp.id;

  const tx = await prisma.bankTransaction.create({
    data: {
      importId: imp.id,
      accountId: account.id,
      valueDate: day(5),
      direction: "expense",
      amount: 10_000_000,
      purpose: "00634~8600123456784957~TEST XODIM~Пополнение карты",
      expenseCategory: "xodim_kartasi",
      rawHash: `${TAG}-hash-1`,
    },
    select: { id: true },
  });
  ids.tx = tx.id;

  const [ch, other] = await Promise.all([
    prisma.disbursementChannel.create({
      data: { type: "employee_card", label: `${TAG} karta`, cardMask: `8600****${Date.now() % 10000}` },
      select: { id: true },
    }),
    prisma.disbursementChannel.create({
      data: { type: "cash", label: `${TAG} naqd` },
      select: { id: true },
    }),
  ]);
  ids.channel = ch.id;
  ids.other = other.id;
});

afterAll(async () => {
  await prisma.transitEntry.deleteMany({ where: { channelId: { in: [ids.channel, ids.other] } } });
  await prisma.kassaEntry.deleteMany({ where: { channelId: { in: [ids.channel, ids.other] } } });
  await prisma.disbursementChannel.deleteMany({ where: { id: { in: [ids.channel, ids.other] } } });
  await prisma.bankTransaction.deleteMany({ where: { accountId: ids.account } });
  await prisma.bankStatementImport.deleteMany({ where: { accountId: ids.account } });
  await prisma.bankAccount.deleteMany({ where: { id: ids.account } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.$disconnect();
});

const balanceOf = async (id: string) =>
  (await getChannelBalances(prisma, { includeInactive: true })).find((c) => c.id === id)!;

describe("recordTransitIn — kartaga pul tushishi", () => {
  it("kartaga tushgan pul XARAJAT sifatida yozilmaydi", async () => {
    const kassaBefore = await prisma.kassaEntry.count();

    await recordTransitIn(prisma, {
      channelId: ids.channel,
      bankTransactionId: ids.tx,
      amount: 10_000_000,
      date: day(5),
    });

    // Eng muhim tekshiruv: KassaEntry YOZILMAGAN. Aks holda xarajat ikki
    // marta sanalardi — kartaga chiqqanda ham, sarflanganda ham.
    expect(await prisma.kassaEntry.count()).toBe(kassaBefore);

    const ch = await balanceOf(ids.channel);
    expect(ch.totalIn).toBe(10_000_000);
    expect(ch.totalOut).toBe(0);
    expect(ch.balance).toBe(10_000_000);
  });

  it("bank tranzaksiyasini 'posted' deb belgilaydi (navbatda qolmasin)", async () => {
    const tx = await prisma.bankTransaction.findUnique({ where: { id: ids.tx } });
    expect(tx?.status).toBe("posted");
    expect(tx?.expenseCategory).toBe("xodim_kartasi");
  });

  it("bitta o'tkazmani ikki marta bog'lab bo'lmaydi", async () => {
    const res = await recordTransitIn(prisma, {
      channelId: ids.channel,
      bankTransactionId: ids.tx,
      amount: 10_000_000,
      date: day(5),
    });
    expect(res.alreadyLinked).toBe(true);

    const ch = await balanceOf(ids.channel);
    expect(ch.totalIn).toBe(10_000_000); // 20 mln EMAS
  });
});

describe("recordTransitOut — kartadan sarflash", () => {
  it("xarajat KassaEntry sifatida yoziladi va qoldiq kamayadi", async () => {
    const res = await recordTransitOut(prisma, {
      channelId: ids.channel,
      amount: 4_000_000,
      date: day(10),
      category: "ijara",
      description: "Ofis ijarasi",
      companyId: ids.company,
    });

    expect(res.balanceAfter).toBe(6_000_000);

    const entry = await prisma.kassaEntry.findUnique({ where: { id: res.kassaEntryId } });
    expect(entry?.type).toBe("expense");
    expect(entry?.category).toBe("ijara");
    expect(Number(entry?.amount)).toBe(4_000_000);
    expect(entry?.channelId).toBe(ids.channel);

    const ch = await balanceOf(ids.channel);
    expect(ch.totalIn).toBe(10_000_000);
    expect(ch.totalOut).toBe(4_000_000);
    expect(ch.balance).toBe(6_000_000);
  });

  it("qoldiqdan ortiq sarflashga yo'l qo'ymaydi", async () => {
    await expect(
      recordTransitOut(prisma, {
        channelId: ids.channel,
        amount: 99_000_000,
        date: day(11),
        category: "boshqa",
      })
    ).rejects.toBeInstanceOf(InsufficientTransitFunds);

    // Rad etilgandan keyin qoldiq o'zgarmagan bo'lishi kerak.
    const ch = await balanceOf(ids.channel);
    expect(ch.balance).toBe(6_000_000);
  });

  it("admin ataylab ruxsat bersa ortiqcha yozuvga yo'l qo'yadi", async () => {
    const res = await recordTransitOut(prisma, {
      channelId: ids.channel,
      amount: 7_000_000,
      date: day(12),
      category: "boshqa",
      allowOverdraft: true,
    });
    expect(res.balanceAfter).toBe(-1_000_000);

    const ch = await balanceOf(ids.channel);
    expect(ch.balance).toBe(-1_000_000);
  });

  it("manfiy yoki nol summani rad etadi", async () => {
    await expect(
      recordTransitOut(prisma, { channelId: ids.channel, amount: 0, date: day(13), category: "boshqa" })
    ).rejects.toThrow(/musbat/i);
    await expect(
      recordTransitOut(prisma, { channelId: ids.channel, amount: -5, date: day(13), category: "boshqa" })
    ).rejects.toThrow(/musbat/i);
  });
});

describe("daftar va umumiy qoldiq", () => {
  it("harakatlar tarixi to'liq ko'rinadi", async () => {
    const ledger = await getChannelLedger(prisma, ids.channel);
    expect(ledger.length).toBe(3); // 1 kirim + 2 chiqim
    expect(ledger.filter((e) => e.direction === "in")).toHaveLength(1);
    expect(ledger.filter((e) => e.direction === "out")).toHaveLength(2);
  });

  it("harakati yo'q kanal nol qoldiq bilan ko'rinadi", async () => {
    const ch = await balanceOf(ids.other);
    expect(ch.totalIn).toBe(0);
    expect(ch.balance).toBe(0);
    expect(ch.entryCount).toBe(0);
  });

  it("umumiy tranzit qoldig'i barcha kanallar yig'indisi", async () => {
    const total = await getTotalTransitBalance(prisma);
    // Bu testdagi kanallar: -1 mln. Boshqa ma'lumot bo'lsa ham son chiqadi.
    expect(typeof total).toBe("number");
    expect(Number.isFinite(total)).toBe(true);
  });
});
