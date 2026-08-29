/**
 * SOFT DELETE — moliyaviy jadvallarda jismoniy o'chirish yo'q:
 *   - o'chirilgan yozuv deletedAt bilan belgilanadi (qator bazada qoladi);
 *   - balans so'rovlari (deletedAt: null) uni ko'rmaydi;
 *   - ledger izi reversal bilan netto nolga tushadi;
 *   - audit oldData'ni saqlaydi.
 * Live Postgres kerak.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "super_admin" as string } };
const CHANNEL = { id: "" };

vi.mock("@/lib/auth", () => ({ auth: async () => SESSION }));
vi.mock("server-only", () => ({}));

const { prisma } = await import("@/lib/prisma");
const { createKassaEntry, deleteKassaEntry, createExpense, deleteExpense, getKassaEntries } =
  await import("@/server/kassa");

const TAG = `vitest-softdel-${Date.now()}`;
const DATE = new Date(2099, 7, 15); // 2099-08 — ochiq davr
const ids = { user: "" };

beforeAll(async () => {
  // Chiqim MANBASIZ yozilmaydi (server/kassa.ts) — test uchun naqd kanal.
  const channel = await prisma.disbursementChannel.create({
    data: { type: "cash", label: `${TAG}-cash` },
  });
  CHANNEL.id = channel.id;
  const user = await prisma.user.create({
    data: { email: `${TAG}@vitest.local`, fullName: `${TAG} admin`, passwordHash: "x", role: "super_admin" },
    select: { id: true },
  });
  ids.user = user.id;
  SESSION.user.id = user.id;
});

afterAll(async () => {
  const kassaIds = (
    await prisma.kassaEntry.findMany({ where: { createdBy: ids.user }, select: { id: true } })
  ).map((k) => k.id);
  const expenseIds = (
    await prisma.kassaEntry.findMany({ where: { createdBy: ids.user }, select: { id: true } })
  ).map((e) => e.id);
  await prisma.ledgerEntry.deleteMany({ where: { sourceId: { in: [...kassaIds, ...expenseIds] } } });
  await prisma.kassaEntry.deleteMany({ where: { createdBy: ids.user } });
  await prisma.kassaEntry.deleteMany({ where: { createdBy: ids.user } });
  await prisma.auditLog.deleteMany({ where: { userId: ids.user } });
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

describe("soft delete", () => {
  it("kassa: row survives, balance queries exclude it, ledger nets to zero", async () => {
    const entry = await createKassaEntry({
      type: "income",
      category: `${TAG}-kassa`,
      amount: 777_000,
      date: DATE,
    });

    await deleteKassaEntry(entry.id, "test sabab");

    // Qator bazada BOR, lekin deletedAt bilan.
    const raw = await prisma.kassaEntry.findUnique({ where: { id: entry.id } });
    expect(raw).not.toBeNull();
    expect(raw!.deletedAt).not.toBeNull();
    expect(raw!.deletedBy).toBe(ids.user);
    expect(raw!.deleteReason).toBe("test sabab");

    // Balans ishlatadigan filtr (deletedAt: null) uni ko'rmaydi.
    const visible = await prisma.kassaEntry.aggregate({
      where: { id: entry.id, deletedAt: null },
      _sum: { amount: true },
    });
    expect(Number(visible._sum.amount ?? 0)).toBe(0);

    // O'qish endpointi ham ko'rsatmaydi.
    const list = await getKassaEntries({ category: `${TAG}-kassa` });
    expect((list as unknown[]).length).toBe(0);

    // Ledger netto nol (post + reversal).
    const legs = await prisma.ledgerEntry.findMany({ where: { sourceId: entry.id } });
    expect(legs.length).toBeGreaterThanOrEqual(4);
    const net = legs.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
    expect(net).toBe(0);
  });

  it("expense: soft delete keeps oldData in the audit trail", async () => {
    const exp = await createExpense({
      amount: 900_000, // <1 mln — avto-tasdiq, ledger yoziladi
      date: DATE,
      category: `${TAG}-expense`,
      channelId: CHANNEL.id,
    });
    expect(exp.status).toBe("approved");

    await deleteExpense(exp.id, "xato kiritilgan");

    const raw = await prisma.kassaEntry.findUnique({ where: { id: exp.id } });
    expect(raw!.deletedAt).not.toBeNull();

    // Audit: oldData'da summa/kategoriya saqlangan.
    const audit = await prisma.auditLog.findFirst({
      where: { tableName: "KassaEntry", recordId: exp.id, action: "delete" },
    });
    expect(audit).not.toBeNull();
    const old = audit!.oldData as { amount?: number; category?: string };
    expect(old.amount).toBe(900_000);
    expect(old.category).toBe(`${TAG}-expense`);

    // Ledger reversal — netto nol.
    const legs = await prisma.ledgerEntry.findMany({ where: { sourceId: exp.id } });
    const net = legs.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
    expect(net).toBe(0);
  });

  it("deleting an already-deleted record is rejected", async () => {
    const entry = await createKassaEntry({
      type: "income",
      category: `${TAG}-double`,
      amount: 10_000,
      date: DATE,
    });
    await deleteKassaEntry(entry.id);
    await expect(deleteKassaEntry(entry.id)).rejects.toThrow(/topilmadi/);
  });
});
