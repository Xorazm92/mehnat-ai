/**
 * BANK VIPISKA IMPORTI — bazaga yozish, moslashtirish va hisobga olish.
 *
 * Eng muhim tekshiruv — BALANS IKKI MARTA SANALMASLIGI: moslashtirilgan kirim
 * faqat `Payment` ga tushadi, `KassaEntry` ga EMAS (lib/balance.ts ikkalasini
 * ham kirim deb sanaydi).
 * Live Postgres kerak.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prisma } = await import("@/lib/prisma");
const { commitStatement, autoMatchTransactions, postIncomeTransaction, periodOf } = await import(
  "@/lib/bank/importStatement"
);
const { getAvailableBalance } = await import("@/lib/balance");
import type { ParsedStatement } from "@/lib/bank/types";

const TAG = `vitest-bank-${Date.now()}`;
const ACC = `9${Date.now()}`.slice(0, 20).padEnd(20, "0");
const ids = { ownFirm: "", client: "", otherOwn: "", account: "", contract: "" };

const day = (d: number) => new Date(Date.UTC(2099, 8, d)); // 2099-09 — ochiq davr

function statement(txs: Partial<ParsedStatement["transactions"][number]>[]): ParsedStatement {
  return {
    format: "litsevoy",
    accountNumber: ACC,
    accountInn: "111111111",
    holderName: `${TAG} own`,
    periodFrom: day(1),
    periodTo: day(30),
    openingBalance: 0,
    closingBalance: null,
    transactions: txs.map((t, i) => ({
      valueDate: day(5),
      docNumber: String(100 + i),
      opCode: "21",
      direction: "income",
      amount: 1_000_000,
      counterpartyInn: null,
      counterpartyName: "Kontragent",
      counterpartyAccount: null,
      purpose: "to'lov",
      ...t,
    })) as ParsedStatement["transactions"],
  };
}

beforeAll(async () => {
  const own = await prisma.company.create({
    data: { name: `${TAG} OWN`, inn: "111111111", isOwnFirm: true },
    select: { id: true },
  });
  const otherOwn = await prisma.company.create({
    data: { name: `${TAG} OWN-2`, inn: "222222222", isOwnFirm: true },
    select: { id: true },
  });
  const client = await prisma.company.create({
    data: { name: `${TAG} MIJOZ`, inn: "333333333", contractAmount: 5_000_000 },
    select: { id: true },
  });
  ids.ownFirm = own.id;
  ids.otherOwn = otherOwn.id;
  ids.client = client.id;

  const contract = await prisma.contract.create({
    data: { companyId: client.id, number: "07/26БК", amount: 5_000_000 },
    select: { id: true },
  });
  ids.contract = contract.id;

  const account = await prisma.bankAccount.create({
    data: { accountNumber: ACC, ownerCompanyId: own.id, inn: "111111111", label: `${TAG} hisob` },
    select: { id: true },
  });
  ids.account = account.id;
});

afterAll(async () => {
  const companyIds = [ids.ownFirm, ids.otherOwn, ids.client];
  await prisma.paymentAllocation.deleteMany({
    where: { bankTransaction: { accountId: ids.account } },
  });
  await prisma.bankTransaction.deleteMany({ where: { accountId: ids.account } });
  await prisma.bankStatementImport.deleteMany({ where: { accountId: ids.account } });
  await prisma.bankAccount.deleteMany({ where: { id: ids.account } });
  await prisma.payment.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.contract.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.kassaEntry.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  await prisma.$disconnect();
});

const ownInns = new Set(["111111111", "222222222"]);

describe("commitStatement", () => {
  it("tranzaksiyalarni yozadi va shartnoma raqamini ajratadi", async () => {
    const res = await commitStatement(prisma, {
      parsed: statement([
        {
          counterpartyInn: "333333333",
          counterpartyName: "MIJOZ",
          purpose: "оплата за бух услуги сог дог №07/26БК от 05.01.2026г",
          amount: 2_000_000,
        },
        { direction: "expense", amount: 500_000, purpose: "комиссия банка", counterpartyName: "BANK" },
      ]),
      accountId: ids.account,
      accountNumber: ACC,
      fileName: "test.xlsx",
      ownFirmInns: ownInns,
    });

    expect(res.rowsParsed).toBe(2);
    expect(res.rowsInserted).toBe(2);
    expect(res.rowsDuplicate).toBe(0);

    const income = await prisma.bankTransaction.findFirst({
      where: { accountId: ids.account, direction: "income" },
    });
    expect(income?.contractHint).toBe("07/26БК");
    expect(income?.status).toBe("unmatched");

    const expense = await prisma.bankTransaction.findFirst({
      where: { accountId: ids.account, direction: "expense" },
    });
    expect(expense?.expenseCategory).toBe("bank_komissiya");
  });

  it("XUDDI SHU faylni qayta yuklash dublikat yaratmaydi", async () => {
    const before = await prisma.bankTransaction.count({ where: { accountId: ids.account } });
    const res = await commitStatement(prisma, {
      parsed: statement([
        {
          counterpartyInn: "333333333",
          counterpartyName: "MIJOZ",
          purpose: "оплата за бух услуги сог дог №07/26БК от 05.01.2026г",
          amount: 2_000_000,
        },
        { direction: "expense", amount: 500_000, purpose: "комиссия банка", counterpartyName: "BANK" },
      ]),
      accountId: ids.account,
      accountNumber: ACC,
      fileName: "test.xlsx",
      ownFirmInns: ownInns,
    });

    expect(res.rowsInserted).toBe(0);
    expect(res.rowsDuplicate).toBe(2);
    expect(await prisma.bankTransaction.count({ where: { accountId: ids.account } })).toBe(before);
  });
});

describe("autoMatchTransactions", () => {
  it("STIR bo'yicha mijozni va shartnomani topadi", async () => {
    const res = await autoMatchTransactions(prisma, { accountId: ids.account });
    expect(res.matchedByInn).toBe(1);
    expect(res.matchedContract).toBe(1);

    const tx = await prisma.bankTransaction.findFirst({
      where: { accountId: ids.account, direction: "income" },
    });
    expect(tx?.status).toBe("matched");
    expect(tx?.matchedCompanyId).toBe(ids.client);
    expect(tx?.matchedContractId).toBe(ids.contract);
  });

  it("o'z firmamizdan kelgan pulni MIJOZ TO'LOVI deb yozmaydi", async () => {
    // Firmalararo o'tkazma qarzdorlikni soxta yopmasligi kerak, va Ruslanning
    // qo'lda hal qilinadigan navbatini ham to'ldirmasligi kerak.
    await commitStatement(prisma, {
      parsed: statement([
        {
          counterpartyInn: "222222222",
          counterpartyName: `${TAG} OWN-2`,
          purpose: "возврат фин помощь",
          amount: 9_000_000,
          docNumber: "internal-1",
        },
      ]),
      accountId: ids.account,
      accountNumber: ACC,
      fileName: "internal.xlsx",
      ownFirmInns: ownInns,
    });

    const res = await autoMatchTransactions(prisma, { accountId: ids.account });
    expect(res.internalTransfers).toBe(1);

    const tx = await prisma.bankTransaction.findFirst({
      where: { accountId: ids.account, docNumber: "internal-1" },
    });
    expect(tx?.status).toBe("ignored");
    expect(tx?.matchedCompanyId).toBeNull();
  });
});

describe("postIncomeTransaction — balans ikki marta sanalmaydi", () => {
  it("kirim faqat Payment'ga tushadi, KassaEntry'ga emas", async () => {
    const balanceBefore = await getAvailableBalance();
    const kassaBefore = await prisma.kassaEntry.count();

    const tx = await prisma.bankTransaction.findFirst({
      where: { accountId: ids.account, direction: "income", status: "matched" },
      select: { id: true, amount: true },
    });
    expect(tx).toBeTruthy();

    const res = await postIncomeTransaction(prisma, {
      transactionId: tx!.id,
      companyId: ids.client,
      contractId: ids.contract,
    });

    expect(res.paymentTotal).toBe(2_000_000);
    expect(res.status).toBe("partial"); // 2 mln < 5 mln shartnoma

    // KassaEntry YOZILMAGAN bo'lishi shart.
    expect(await prisma.kassaEntry.count()).toBe(kassaBefore);

    // Balans AYNAN bir marta o'zgargan.
    const balanceAfter = await getAvailableBalance();
    expect(balanceAfter.income - balanceBefore.income).toBe(2_000_000);
    expect(balanceAfter.balance - balanceBefore.balance).toBe(2_000_000);
  });

  it("bir oyda bir necha to'lov bitta Payment qatoriga yig'iladi", async () => {
    // Foydalanuvchi aytgan holat: "bitta kliyent bilan har xil shartnomalar
    // tuzilishi mumkin" — oyda bir necha marta to'laydi.
    await commitStatement(prisma, {
      parsed: statement([
        {
          counterpartyInn: "333333333",
          counterpartyName: "MIJOZ",
          purpose: "сог дог №07/26БК ikkinchi to'lov",
          amount: 3_000_000,
          docNumber: "second",
          valueDate: day(20),
        },
      ]),
      accountId: ids.account,
      accountNumber: ACC,
      fileName: "second.xlsx",
      ownFirmInns: ownInns,
    });

    const tx = await prisma.bankTransaction.findFirst({
      where: { accountId: ids.account, docNumber: "second" },
      select: { id: true },
    });
    const res = await postIncomeTransaction(prisma, {
      transactionId: tx!.id,
      companyId: ids.client,
      contractId: ids.contract,
    });

    // 2 mln + 3 mln = 5 mln → shartnoma to'liq to'landi.
    expect(res.paymentTotal).toBe(5_000_000);
    expect(res.status).toBe("paid");

    const payments = await prisma.payment.findMany({
      where: { companyId: ids.client },
      select: { id: true, amount: true, allocations: { select: { id: true } } },
    });
    expect(payments).toHaveLength(1); // BITTA qator, ikkita taqsimot
    expect(payments[0].allocations).toHaveLength(2);
    expect(Number(payments[0].amount)).toBe(5_000_000);
  });

  it("bir tranzaksiyani ikki marta hisobga olib bo'lmaydi", async () => {
    const tx = await prisma.bankTransaction.findFirst({
      where: { accountId: ids.account, docNumber: "second" },
      select: { id: true },
    });
    await expect(
      postIncomeTransaction(prisma, { transactionId: tx!.id, companyId: ids.client })
    ).rejects.toThrow(/allaqachon/i);
  });

  it("davr kaliti tranzaksiya sanasidan olinadi", () => {
    expect(periodOf(new Date(Date.UTC(2099, 8, 5)))).toBe("2099-09");
    expect(periodOf(new Date(Date.UTC(2026, 0, 31)))).toBe("2026-01");
  });
});
