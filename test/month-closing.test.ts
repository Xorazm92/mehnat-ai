/**
 * MONTH-END CLOSING ENGINE — to'liq regressiya to'plami.
 *
 * Qamrov: OPEN→LOCKED, opening/closing arifmetikasi, keyingi oy opening'i,
 * pending bloklar (expense/payroll/orphan/ledger mismatch), duplicate close,
 * duplicate snapshot (partial unique), concurrent close (atomik claim),
 * power-failure recovery (stale CLOSING + snapshot-bor CLOSING), reopen
 * (kaskad invalidatsiya, sabab majburiy, rol), re-close, snapshot immutability
 * (DB trigger), READY_TO_CLOSE avtomatik OPEN'ga qaytishi.
 *
 * Davrlar: 2094 (zanjir) va 2095 (bloklar/concurrency) — boshqa test fayllari
 * 2096+ dan foydalanadi, real ma'lumot 2025-26. Live Postgres kerak.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "super_admin" as string } };

vi.mock("@/lib/auth", () => ({ auth: async () => SESSION }));
vi.mock("server-only", () => ({}));

const { prisma } = await import("@/lib/prisma");
const { closeMonth, reopenMonth, validateMonth, getMonthSummaryData } = await import("@/server/monthClosing");
const { createKassaEntry } = await import("@/server/kassa");

const TAG = `vitest-mclose-${Date.now()}`;
const ids = { user: "", company: "" };

async function cleanupYears() {
  await prisma.ledgerEntry.deleteMany({
    where: { OR: [{ period: { startsWith: "2094-" } }, { period: { startsWith: "2095-" } }] },
  });
  await prisma.financialSnapshot.deleteMany({
    where: { OR: [{ period: { startsWith: "2094" } }, { period: { startsWith: "2095" } }] },
  });
  await prisma.accountingPeriod.deleteMany({ where: { year: { in: [2094, 2095] } } });
}

/**
 * Kassa qoldig'i JAMLANUVCHI kattalik: "manfiy emas" tekshiruvi yopilayotgan
 * davrga qadar bo'lgan BUTUN tarixni o'qiydi (lib/ledger.ts#getLedgerCashBalance).
 * Shuning uchun 2094-yilni tanlash bu testni izolyatsiya qilmaydi — undan
 * oldingi har qanday minus qoldiq bu yerga ham o'tadi.
 *
 * Yechim: test o'z moliyaviy dunyosini ochadi — 2094-01 da kassaga shuncha
 * kirim yozadiki, boshlang'ich qoldiq manfiy bo'lmasin. Da'volar nisbiy
 * (closing = opening + harakat), shuning uchun bu ularga tegmaydi, va
 * `cleanupYears()` 2094- ledgerini o'zi tozalaydi.
 */
async function seedNonNegativeOpeningCash(): Promise<void> {
  const agg = await prisma.ledgerEntry.aggregate({
    where: { accountId: "CASH", period: { lt: "2094-01" } },
    _sum: { debit: true, credit: true },
  });
  const balance = Number(agg._sum.debit ?? 0) - Number(agg._sum.credit ?? 0);
  if (balance >= 0) return;

  await createKassaEntry({
    type: "income",
    category: `${TAG}-opening`,
    amount: Math.ceil(-balance) + 1_000_000,
    date: new Date(2094, 0, 5),
    description: "vitest: boshlang'ich kassa qoldig'i",
  });
}

beforeAll(async () => {
  await cleanupYears();

  const user = await prisma.user.create({
    data: { email: `${TAG}@vitest.local`, fullName: `${TAG} admin`, passwordHash: "x", role: "super_admin" },
    select: { id: true },
  });
  ids.user = user.id;
  SESSION.user.id = user.id;

  const company = await prisma.company.create({
    data: { name: `${TAG} co`, inn: "000000003" },
    select: { id: true },
  });
  ids.company = company.id;

  // Sessiya tayyor bo'lgach — kassa qoldig'ini manfiy bo'lmagan holatga keltiramiz.
  await seedNonNegativeOpeningCash();

  // 2094-03 harakati: kirim 4M (payment) + 1M (kassa) = 5M; chiqim 500k (expense) + 300k (payout)
  await prisma.payment.create({
    data: { companyId: company.id, period: "2094-03", amount: 4_000_000, status: "paid" },
  });
  await prisma.kassaEntry.create({
    data: { type: "income", category: TAG, amount: 1_000_000, date: new Date(2094, 2, 10) },
  });
  await prisma.expense.create({
    data: { amount: 500_000, date: new Date(2094, 2, 15), category: TAG, status: "approved" },
  });
  await prisma.payout.create({
    data: { employeeId: user.id, month: "2094-03", amount: 300_000, paidAt: new Date(2094, 2, 20) },
  });

  // 2094-04 harakati: kassa kirim 2M
  await prisma.kassaEntry.create({
    data: { type: "income", category: TAG, amount: 2_000_000, date: new Date(2094, 3, 10) },
  });
});

afterAll(async () => {
  await cleanupYears();
  await prisma.payment.deleteMany({ where: { companyId: ids.company } });
  await prisma.kassaEntry.deleteMany({ where: { category: { startsWith: TAG } } });
  await prisma.expense.deleteMany({ where: { category: { startsWith: TAG } } });
  await prisma.payout.deleteMany({ where: { employeeId: ids.user } });
  await prisma.payrollAdjustment.deleteMany({ where: { employeeId: ids.user } });
  await prisma.auditLog.deleteMany({ where: { userId: ids.user } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

describe("closeMonth — happy path (OPEN → LOCKED)", () => {
  it("validates to READY_TO_CLOSE, closes, and computes correct figures", async () => {
    const v = (await validateMonth(2094, 3)) as unknown as { status: string; checklist: { ready: boolean } };
    expect(v.checklist.ready).toBe(true);
    expect(v.status).toBe("READY_TO_CLOSE");

    const snapshot = await closeMonth({ year: 2094, month: 3 });
    expect(Number(snapshot.income)).toBe(5_000_000);
    expect(Number(snapshot.outflow)).toBe(800_000);
    expect(Number(snapshot.profit)).toBe(4_200_000);
    expect(Number(snapshot.loss)).toBe(0);
    expect(Number(snapshot.payrollTotal)).toBe(300_000);
    expect(Number(snapshot.closingBalance)).toBe(Number(snapshot.openingBalance) + 4_200_000);
    expect(snapshot.checksum).toMatch(/^[a-f0-9]{64}$/);

    const period = await prisma.accountingPeriod.findFirst({
      where: { companyId: null, year: 2094, month: 3 },
    });
    expect(period!.status).toBe("LOCKED");
    expect(period!.closedBy).toBe(ids.user);
    expect(period!.closedAt).not.toBeNull();
  });

  it("auto-creates the next month OPEN with opening = closing (STEP 11)", async () => {
    const snap3 = await prisma.financialSnapshot.findFirst({
      where: { companyId: null, period: "2094-03", isValid: true },
    });
    const next = await prisma.accountingPeriod.findFirst({
      where: { companyId: null, year: 2094, month: 4 },
    });
    expect(next).not.toBeNull();
    expect(next!.status).toBe("OPEN");
    expect(Number(next!.openingBalance)).toBe(Number(snap3!.closingBalance));
  });

  it("wrote the closing audit with figures (STEP 12)", async () => {
    const audit = await prisma.auditLog.findFirst({
      where: { userId: ids.user, tableName: "FinancialSnapshot" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    const d = audit!.newData as { event?: string; period?: string; income?: number };
    expect(d.event).toBe("month_closed");
    expect(d.period).toBe("2094-03");
    expect(d.income).toBe(5_000_000);
  });

  it("chains: next month's snapshot opens with previous closing", async () => {
    const snap4 = await closeMonth({ year: 2094, month: 4 });
    const snap3 = await prisma.financialSnapshot.findFirst({
      where: { companyId: null, period: "2094-03", isValid: true },
    });
    expect(Number(snap4.openingBalance)).toBe(Number(snap3!.closingBalance));
    expect(Number(snap4.income)).toBe(2_000_000);
    expect(Number(snap4.closingBalance)).toBe(Number(snap4.openingBalance) + 2_000_000);
  });

  it("blocks any financial write into the LOCKED month", async () => {
    await expect(
      createKassaEntry({ type: "income", category: TAG, amount: 1_000, date: new Date(2094, 2, 5) })
    ).rejects.toThrow(/yopilgan/);
  });
});

describe("closeMonth — pending blockers → FAILED", () => {
  it("rejects when a pending expense exists and marks the period FAILED", async () => {
    const exp = await prisma.expense.create({
      data: { amount: 5_000_000, date: new Date(2095, 1, 10), category: `${TAG}-pend`, status: "pending" },
    });

    await expect(closeMonth({ year: 2095, month: 2 })).rejects.toThrow(/Tasdiqlanmagan xarajatlar/);

    const period = await prisma.accountingPeriod.findFirst({
      where: { companyId: null, year: 2095, month: 2 },
    });
    expect(period!.status).toBe("FAILED");
    expect(period!.statusNote).toMatch(/xarajat/i);

    await prisma.expense.delete({ where: { id: exp.id } });
  });

  it("rejects when an unapproved payroll adjustment exists", async () => {
    const adj = await prisma.payrollAdjustment.create({
      data: { month: "2095-02", employeeId: ids.user, adjustmentType: "bonus", amount: 100_000, reason: "t" },
    });

    await expect(closeMonth({ year: 2095, month: 2 })).rejects.toThrow(/oylik tuzatmalari/);

    await prisma.payrollAdjustment.delete({ where: { id: adj.id } });
  });

  it("rejects on a period ledger imbalance (debit != credit)", async () => {
    const bad = await prisma.ledgerEntry.create({
      data: {
        transactionId: `${TAG}-bad`,
        accountId: "CASH",
        debit: 100,
        credit: 0,
        period: "2095-02",
        sourceTable: "VitestClose",
        sourceId: `${TAG}-bad`,
      },
    });

    await expect(closeMonth({ year: 2095, month: 2 })).rejects.toThrow(/debit .* != credit/);

    await prisma.ledgerEntry.delete({ where: { id: bad.id } });
  });

  it("rejects on an orphan ledger entry (source row missing)", async () => {
    await prisma.ledgerEntry.createMany({
      data: [
        { transactionId: `${TAG}-orph`, accountId: "CASH", debit: 100, credit: 0, period: "2095-02", sourceTable: "Payment", sourceId: `${TAG}-no-such` },
        { transactionId: `${TAG}-orph`, accountId: "CONTRACT_INCOME", debit: 0, credit: 100, period: "2095-02", sourceTable: "Payment", sourceId: `${TAG}-no-such` },
      ],
    });

    await expect(closeMonth({ year: 2095, month: 2 })).rejects.toThrow(/mosligi|orphan/i);

    await prisma.ledgerEntry.deleteMany({ where: { sourceId: `${TAG}-no-such` } });
  });

  it("closes cleanly after the blockers are resolved (FAILED is writable)", async () => {
    const snap = await closeMonth({ year: 2095, month: 2 });
    expect(Number(snap.income)).toBe(0);
    expect(Number(snap.outflow)).toBe(0);
  });
});

describe("closeMonth — duplicates & concurrency", () => {
  it("refuses to close an already-LOCKED month", async () => {
    await expect(closeMonth({ year: 2095, month: 2 })).rejects.toThrow(/allaqachon yopilgan/);
  });

  it("partial unique index refuses a duplicate valid global snapshot", async () => {
    await expect(
      prisma.financialSnapshot.create({
        data: { companyId: null, period: "2095-02", openingBalance: 0, closingBalance: 0 },
      })
    ).rejects.toThrow();
  });

  it("exactly one of two concurrent closes wins (atomic claim)", async () => {
    const results = await Promise.allSettled([
      closeMonth({ year: 2095, month: 3 }),
      closeMonth({ year: 2095, month: 3 }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const snapshots = await prisma.financialSnapshot.count({
      where: { companyId: null, period: "2095-03" },
    });
    expect(snapshots).toBe(1);
  });

  it("rejects per-company closing explicitly (global-only finances)", async () => {
    await expect(closeMonth({ year: 2095, month: 4, companyId: ids.company })).rejects.toThrow(
      /Per-company/
    );
  });
});

describe("closeMonth — power failure recovery", () => {
  it("recovers a stale CLOSING (crash before snapshot) and completes the close", async () => {
    const period = await prisma.accountingPeriod.create({
      data: { companyId: null, year: 2095, month: 5, status: "CLOSING" },
    });
    const past = new Date(Date.now() - 20 * 60_000);
    await prisma.$executeRaw`UPDATE "AccountingPeriod" SET "updatedAt" = ${past} WHERE id = ${period.id}`;

    const snap = await closeMonth({ year: 2095, month: 5 });
    expect(snap.period).toBe("2095-05");

    const after = await prisma.accountingPeriod.findFirst({ where: { id: period.id } });
    expect(after!.status).toBe("LOCKED");
  });

  it("finalizes a CLOSING period whose snapshot already committed (idempotent)", async () => {
    const existing = await prisma.financialSnapshot.create({
      data: {
        companyId: null,
        period: "2095-06",
        openingBalance: 111,
        closingBalance: 222,
        createdBy: ids.user,
      },
    });
    // 2095-06 qatori 2095-05 yopilishida avto-yaratilgan (STEP 11) — CLOSING'ga o'tkazamiz.
    await prisma.accountingPeriod.updateMany({
      where: { companyId: null, year: 2095, month: 6 },
      data: { status: "CLOSING" },
    });

    const snap = await closeMonth({ year: 2095, month: 6 });
    expect(snap.id).toBe(existing.id); // yangi snapshot YARATILMADI

    const count = await prisma.financialSnapshot.count({ where: { companyId: null, period: "2095-06" } });
    expect(count).toBe(1);
    const period = await prisma.accountingPeriod.findFirst({
      where: { companyId: null, year: 2095, month: 6 },
    });
    expect(period!.status).toBe("LOCKED");
  });

  it("refuses to interfere with a fresh (live) CLOSING", async () => {
    // 2095-07 avto-yaratilgan bo'lishi mumkin (STEP 11) — toza holatdan boshlaymiz.
    await prisma.accountingPeriod.deleteMany({ where: { companyId: null, year: 2095, month: 7 } });
    await prisma.accountingPeriod.create({
      data: { companyId: null, year: 2095, month: 7, status: "CLOSING" },
    });
    await expect(closeMonth({ year: 2095, month: 7 })).rejects.toThrow(/CLOSING/);
    await prisma.accountingPeriod.deleteMany({ where: { year: 2095, month: 7 } });
  });
});

describe("reopenMonth — LOCKED → REOPENED", () => {
  it("requires a reason and the LOCKED status", async () => {
    await expect(reopenMonth(2094, 3, "")).rejects.toThrow(/sabab/i);
    await expect(reopenMonth(2095, 9, "x")).rejects.toThrow(/LOCKED emas/);
  });

  it("only super_admin may reopen", async () => {
    SESSION.user.role = "admin";
    await expect(reopenMonth(2094, 3, "test")).rejects.toThrow(/Superadmin/);
    SESSION.user.role = "super_admin";
  });

  it("reopens and cascade-invalidates this and all later snapshots", async () => {
    const res = await reopenMonth(2094, 3, "mart oyida xato topildi");
    expect(res.status).toBe("REOPENED");
    // 2094-03 va undan keyingi 2094-04 ham invalid bo'lishi shart.
    expect(res.invalidatedSnapshots).toContain("2094-03");
    expect(res.invalidatedSnapshots).toContain("2094-04");

    const snaps = await prisma.financialSnapshot.findMany({
      where: { companyId: null, period: { in: ["2094-03", "2094-04"] } },
    });
    for (const s of snaps) {
      expect(s.isValid).toBe(false);
      expect(s.invalidReason).toMatch(/mart oyida xato topildi/);
      expect(s.invalidatedBy).toBe(ids.user);
    }
    // 2095-* snapshotlari ham keyingi davr — invalid.
    const s952 = await prisma.financialSnapshot.findFirst({ where: { companyId: null, period: "2095-02" } });
    expect(s952!.isValid).toBe(false);
  });

  it("REOPENED month accepts writes again, then re-closes with a fresh valid snapshot", async () => {
    // Qayta ochilgan oyga yangi hujjat kiritamiz (action orqali — ledger bilan).
    await createKassaEntry({
      type: "income",
      category: `${TAG}-reopen`,
      amount: 700_000,
      date: new Date(2094, 2, 25),
    });

    const snap = await closeMonth({ year: 2094, month: 3 });
    expect(snap.isValid).toBe(true);
    expect(Number(snap.income)).toBe(5_700_000); // 5M + yangi 700k

    // Eski invalid snapshot tarix sifatida qoladi — endi davrda 2 ta yozuv.
    const all = await prisma.financialSnapshot.findMany({
      where: { companyId: null, period: "2094-03" },
    });
    expect(all).toHaveLength(2);
    expect(all.filter((s) => s.isValid)).toHaveLength(1);
  });

  it("audited the reopen with reason and invalidated list", async () => {
    const audit = await prisma.auditLog.findFirst({
      where: { userId: ids.user, tableName: "AccountingPeriod" },
      orderBy: { createdAt: "desc" },
    });
    const events = await prisma.auditLog.findMany({
      where: { userId: ids.user, tableName: "AccountingPeriod" },
    });
    const reopenAudit = events.find(
      (a) => (a.newData as { event?: string })?.event === "month_reopened"
    );
    expect(reopenAudit).toBeDefined();
    const d = reopenAudit!.newData as { reason?: string; invalidatedSnapshots?: string[] };
    expect(d.reason).toBe("mart oyida xato topildi");
    expect(d.invalidatedSnapshots).toContain("2094-04");
    expect(audit).not.toBeNull();
  });
});

describe("snapshot immutability (DB trigger)", () => {
  it("rejects any UPDATE of financial columns at the database level", async () => {
    const snap = await prisma.financialSnapshot.findFirst({
      where: { companyId: null, period: "2095-02" },
    });
    await expect(
      prisma.financialSnapshot.update({
        where: { id: snap!.id },
        data: { closingBalance: 999_999_999 },
      })
    ).rejects.toThrow(/immutable/i);
    await expect(
      prisma.financialSnapshot.update({
        where: { id: snap!.id },
        data: { income: 1 },
      })
    ).rejects.toThrow(/immutable/i);
  });

  it("still allows the invalidation flags (reopen path)", async () => {
    const snap = await prisma.financialSnapshot.findFirst({
      where: { companyId: null, period: "2095-03" },
    });
    const updated = await prisma.financialSnapshot.update({
      where: { id: snap!.id },
      data: { isValid: false, invalidReason: "test" },
    });
    expect(updated.isValid).toBe(false);
    // qaytarib qo'yamiz (partial index: shu davr uchun boshqa valid yo'q)
    await prisma.financialSnapshot.update({
      where: { id: snap!.id },
      data: { isValid: true, invalidReason: null },
    });
  });

  it("stored checksum matches the stored figures (getMonthSummaryData verifies)", async () => {
    const summary = await getMonthSummaryData(2094, 3);
    expect(summary.source).toBe("snapshot");
    expect(summary.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(summary.ledgerStatus).toBe("OK");
    expect(summary.closing).toBe(summary.opening + summary.income - summary.expense);
  });
});

describe("status automation", () => {
  it("a new financial write downgrades READY_TO_CLOSE back to OPEN", async () => {
    // 2095-08: avval READY holatiga keltiramiz
    const v = (await validateMonth(2095, 8)) as unknown as { status: string };
    expect(v.status).toBe("READY_TO_CLOSE");

    await createKassaEntry({
      type: "income",
      category: `${TAG}-ready`,
      amount: 10_000,
      date: new Date(2095, 7, 10),
    });

    const period = await prisma.accountingPeriod.findFirst({
      where: { companyId: null, year: 2095, month: 8 },
    });
    expect(period!.status).toBe("OPEN");
  });
});
