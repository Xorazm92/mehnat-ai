/**
 * Double-entry ledger yadrosi: balanslanganlik invarianti, append-only
 * reversal semantikasi (netto bo'yicha, sikllarga chidamli).
 */
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { ACCOUNTS, assertBalancedLegs, postLedger, reverseLedger } from "@/lib/ledger";

const SOURCE = `vitest-ledger-${Date.now()}`;

afterAll(async () => {
  await prisma.ledgerEntry.deleteMany({ where: { sourceId: { startsWith: SOURCE } } });
  await prisma.$disconnect();
});

describe("assertBalancedLegs", () => {
  it("accepts a balanced transaction", () => {
    expect(() =>
      assertBalancedLegs([
        { accountId: ACCOUNTS.CASH, debit: 1000 },
        { accountId: ACCOUNTS.KASSA_INCOME, credit: 1000 },
      ])
    ).not.toThrow();
  });

  it("rejects an unbalanced transaction", () => {
    expect(() =>
      assertBalancedLegs([
        { accountId: ACCOUNTS.CASH, debit: 1000 },
        { accountId: ACCOUNTS.KASSA_INCOME, credit: 999 },
      ])
    ).toThrow(/balanslashmagan/);
  });

  it("rejects a leg with both debit and credit, or negative amounts", () => {
    expect(() =>
      assertBalancedLegs([
        { accountId: ACCOUNTS.CASH, debit: 500, credit: 500 },
        { accountId: ACCOUNTS.KASSA_INCOME, credit: 0 },
      ])
    ).toThrow();
    expect(() =>
      assertBalancedLegs([
        { accountId: ACCOUNTS.CASH, debit: -100 },
        { accountId: ACCOUNTS.KASSA_INCOME, credit: -100 },
      ])
    ).toThrow(/manfiy/);
  });

  it("rejects a single-leg transaction", () => {
    expect(() => assertBalancedLegs([{ accountId: ACCOUNTS.CASH, debit: 100 }])).toThrow();
  });
});

describe("postLedger + reverseLedger (net semantics)", () => {
  it("refuses to write an unbalanced transaction to the database", async () => {
    await expect(
      postLedger(prisma, {
        legs: [
          { accountId: ACCOUNTS.CASH, debit: 700 },
          { accountId: ACCOUNTS.KASSA_INCOME, credit: 300 },
        ],
        period: "2099-01",
        sourceTable: "VitestSource",
        sourceId: `${SOURCE}-unbalanced`,
      })
    ).rejects.toThrow(/balanslashmagan/);

    const rows = await prisma.ledgerEntry.count({ where: { sourceId: `${SOURCE}-unbalanced` } });
    expect(rows).toBe(0);
  });

  it("reversal nets the source to zero and is idempotent", async () => {
    const sid = `${SOURCE}-rev`;
    await postLedger(prisma, {
      legs: [
        { accountId: ACCOUNTS.OPERATING_EXPENSE, debit: 1500 },
        { accountId: ACCOUNTS.CASH, credit: 1500 },
      ],
      period: "2099-01",
      sourceTable: "VitestSource",
      sourceId: sid,
    });

    const first = await reverseLedger(prisma, { sourceTable: "VitestSource", sourceId: sid });
    expect(first).not.toBeNull();

    // Netto nol — ikkinchi reversal hech narsa yozmaydi.
    const second = await reverseLedger(prisma, { sourceTable: "VitestSource", sourceId: sid });
    expect(second).toBeNull();

    const legs = await prisma.ledgerEntry.findMany({ where: { sourceId: sid } });
    const net = legs.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
    expect(net).toBe(0);
  });

  it("survives post→reverse→post→reverse cycles (payment status flapping)", async () => {
    const sid = `${SOURCE}-cycle`;
    const post = () =>
      postLedger(prisma, {
        legs: [
          { accountId: ACCOUNTS.CASH, debit: 2000 },
          { accountId: ACCOUNTS.CONTRACT_INCOME, credit: 2000 },
        ],
        period: "2099-02",
        sourceTable: "VitestSource",
        sourceId: sid,
      });
    const reverse = () => reverseLedger(prisma, { sourceTable: "VitestSource", sourceId: sid });

    await post(); // paid
    await reverse(); // pending
    await post(); // yana paid
    await reverse(); // yana pending

    const legs = await prisma.ledgerEntry.findMany({ where: { sourceId: sid } });
    const cashNet = legs
      .filter((l) => l.accountId === "CASH")
      .reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
    expect(cashNet).toBe(0);

    // Yana paid bo'lsa — netto yana 2000 ga chiqadi.
    await post();
    const legs2 = await prisma.ledgerEntry.findMany({ where: { sourceId: sid } });
    const cashNet2 = legs2
      .filter((l) => l.accountId === "CASH")
      .reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
    expect(cashNet2).toBe(2000);
  });

  it("never mutates or deletes existing rows (append-only)", async () => {
    const sid = `${SOURCE}-rev`;
    const countBefore = await prisma.ledgerEntry.count({ where: { sourceId: sid } });
    await reverseLedger(prisma, { sourceTable: "VitestSource", sourceId: sid }); // netto nol — yozmaydi
    const countAfter = await prisma.ledgerEntry.count({ where: { sourceId: sid } });
    expect(countAfter).toBe(countBefore);
  });
});
