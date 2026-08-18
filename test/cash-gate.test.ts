/**
 * CASH GATE — pul yozuvining yagona eshigi.
 *
 * Qulflanadigan invariantlar:
 *   - har kassa harakati JURNALGA ham tushadi (avval import yo'llari tushmasdi);
 *   - `dedupKey` bilan qayta yurgizish dublikat yozmaydi;
 *   - aktyor turi balans darvozasini belgilaydi (import bloklanmaydi);
 *   - kanal CASH oyog'ida o'lchov sifatida saqlanadi;
 *   - bekor qilish soft-delete + reversal (netto nol).
 * Live Postgres kerak.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prisma } = await import("@/lib/prisma");
const { recordKassaMovement, reverseKassaMovement, runCashTx } = await import("@/lib/cashGate");
const { ACCOUNTS } = await import("@/lib/ledger");

const TAG = `vitest-gate-${Date.now()}`;
// 2099-11 — boshqa test fayllari bilan to'qnashmaydigan, ochiq davr.
const day = (d: number) => new Date(Date.UTC(2099, 10, d));
const SCRIPT = { kind: "script", name: TAG } as const;

const ids = { channel: "", created: [] as string[] };

beforeAll(async () => {
  const channel = await prisma.disbursementChannel.create({
    data: { type: "employee_card", label: `${TAG} karta`, cardMask: `9860****${Date.now() % 10000}` },
    select: { id: true },
  });
  ids.channel = channel.id;
});

afterAll(async () => {
  const entries = await prisma.kassaEntry.findMany({
    where: { description: { contains: TAG } },
    select: { id: true },
  });
  const entryIds = entries.map((e) => e.id);
  await prisma.ledgerEntry.deleteMany({ where: { sourceId: { in: entryIds } } });
  await prisma.kassaEntry.deleteMany({ where: { id: { in: entryIds } } });
  await prisma.disbursementChannel.deleteMany({ where: { id: ids.channel } });
  await prisma.$disconnect();
});

const legsOf = (sourceId: string) =>
  prisma.ledgerEntry.findMany({ where: { sourceId }, orderBy: { createdAt: "asc" } });

describe("recordKassaMovement — jurnal majburiy", () => {
  it("chiqim ikki tomonlama yozuv bilan birga yoziladi", async () => {
    const res = await runCashTx((db) =>
      recordKassaMovement(db, SCRIPT, {
        type: "expense",
        category: "ijara",
        amount: 4_000_000,
        date: day(3),
        description: `${TAG} ijara`,
        channelId: ids.channel,
      })
    );

    const legs = await legsOf(res.id);
    expect(legs).toHaveLength(2);

    const debit = legs.reduce((s, l) => s + Number(l.debit), 0);
    const credit = legs.reduce((s, l) => s + Number(l.credit), 0);
    expect(debit).toBe(4_000_000);
    expect(credit).toBe(4_000_000);

    const cash = legs.find((l) => l.accountId === ACCOUNTS.CASH)!;
    expect(Number(cash.credit)).toBe(4_000_000);
    // Kanal CASH oyog'ida O'LCHOV sifatida — "pul qayerdan chiqdi" savoliga javob.
    expect(cash.channelId).toBe(ids.channel);

    const expense = legs.find((l) => l.accountId === ACCOUNTS.OPERATING_EXPENSE)!;
    expect(Number(expense.debit)).toBe(4_000_000);
    // Xarajat hisobida kanal BO'LMAYDI (ACCOUNT_SPEC).
    expect(expense.channelId).toBeNull();
  });

  it("kirim CASH ni debitlaydi", async () => {
    const res = await runCashTx((db) =>
      recordKassaMovement(db, SCRIPT, {
        type: "income",
        category: "Firma to'lovi",
        amount: 2_500_000,
        date: day(4),
        description: `${TAG} kirim`,
      })
    );

    const legs = await legsOf(res.id);
    const cash = legs.find((l) => l.accountId === ACCOUNTS.CASH)!;
    expect(Number(cash.debit)).toBe(2_500_000);
    expect(legs.find((l) => l.accountId === ACCOUNTS.KASSA_INCOME)).toBeTruthy();
  });

  // Bu aynan prodda 847 qator (1.45 mlrd so'm) jurnaldan tashqarida qolishiga
  // sabab bo'lgan holat: importni qayta yurgizish.
  it("dedupKey bilan qayta yozish dublikat yaratmaydi", async () => {
    const key = `${TAG}:takror`;
    const first = await runCashTx((db) =>
      recordKassaMovement(db, SCRIPT, {
        type: "expense",
        category: "aloqa",
        amount: 300_000,
        date: day(5),
        description: `${TAG} aloqa`,
        dedupKey: key,
      })
    );
    expect(first.alreadyRecorded).toBe(false);

    const second = await runCashTx((db) =>
      recordKassaMovement(db, SCRIPT, {
        type: "expense",
        category: "aloqa",
        amount: 300_000,
        date: day(5),
        description: `${TAG} aloqa`,
        dedupKey: key,
      })
    );
    expect(second.alreadyRecorded).toBe(true);
    expect(second.id).toBe(first.id);

    // Ikkinchi urinish jurnalga ham hech narsa qo'shmagan bo'lishi kerak.
    expect(await legsOf(first.id)).toHaveLength(2);
  });

  it("nol yoki manfiy summani rad etadi", async () => {
    await expect(
      runCashTx((db) =>
        recordKassaMovement(db, SCRIPT, {
          type: "expense", category: "boshqa", amount: 0, date: day(6), description: TAG,
        })
      )
    ).rejects.toThrow(/musbat/i);
  });

  it("noto'g'ri turni rad etadi", async () => {
    await expect(
      runCashTx((db) =>
        recordKassaMovement(db, SCRIPT, {
          type: "transfer" as never, category: "boshqa", amount: 1, date: day(6), description: TAG,
        })
      )
    ).rejects.toThrow(/Kassa turi/);
  });
});

describe("reverseKassaMovement — bekor qilish", () => {
  it("soft-delete qiladi va jurnal izini nolga tushiradi", async () => {
    const res = await runCashTx((db) =>
      recordKassaMovement(db, SCRIPT, {
        type: "expense",
        category: "ovqat",
        amount: 900_000,
        date: day(7),
        description: `${TAG} ovqat`,
        channelId: ids.channel,
      })
    );

    const out = await runCashTx((db) =>
      reverseKassaMovement(db, SCRIPT, { kassaEntryId: res.id, reason: "test bekor" })
    );
    expect(out.reversed).toBe(true);

    const row = await prisma.kassaEntry.findUnique({ where: { id: res.id } });
    expect(row!.deletedAt).not.toBeNull();
    expect(row!.deleteReason).toBe("test bekor");

    // Append-only: asl qatorlar joyida, netto esa nol.
    const legs = await legsOf(res.id);
    expect(legs.length).toBe(4);
    const net = legs.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
    expect(net).toBe(0);

    // Teskari yozuvda ham kanal saqlanadi — aks holda pul kanal kesimida
    // abadiy "sarflangan" bo'lib qolardi.
    const reversal = legs.filter((l) => l.sourceTable === "KassaEntry-reversal");
    expect(reversal.some((l) => l.accountId === ACCOUNTS.CASH && l.channelId === ids.channel)).toBe(true);
  });

  it("ikkinchi marta bekor qilish hech narsa qilmaydi", async () => {
    const res = await runCashTx((db) =>
      recordKassaMovement(db, SCRIPT, {
        type: "expense", category: "boshqa", amount: 100_000, date: day(8), description: `${TAG} ikki`,
      })
    );
    await runCashTx((db) =>
      reverseKassaMovement(db, SCRIPT, { kassaEntryId: res.id, reason: "birinchi" })
    );
    const again = await runCashTx((db) =>
      reverseKassaMovement(db, SCRIPT, { kassaEntryId: res.id, reason: "ikkinchi" })
    );
    expect(again.reversed).toBe(false);
  });

  // Bekor qilingan yozuv qayta importni TO'SIB QO'YMASLIGI kerak: aks holda
  // xato bilan kiritilgan vipiska qatorini tuzatib qayta yuklab bo'lmasdi.
  it("bekor qilingandan keyin dedupKey bo'shaydi", async () => {
    const key = `${TAG}:qayta`;
    const first = await runCashTx((db) =>
      recordKassaMovement(db, SCRIPT, {
        type: "expense", category: "boshqa", amount: 50_000, date: day(9),
        description: `${TAG} qayta`, dedupKey: key,
      })
    );
    await runCashTx((db) =>
      reverseKassaMovement(db, SCRIPT, { kassaEntryId: first.id, reason: "tuzatish" })
    );

    const second = await runCashTx((db) =>
      recordKassaMovement(db, SCRIPT, {
        type: "expense", category: "boshqa", amount: 60_000, date: day(9),
        description: `${TAG} qayta`, dedupKey: key,
      })
    );
    expect(second.alreadyRecorded).toBe(false);
    expect(second.id).not.toBe(first.id);
  });
});
