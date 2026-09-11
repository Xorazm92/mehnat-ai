/**
 * M1 — YAGONA PUL. Uchta buzilish yo'lining qulfi.
 *
 * Har bir `describe` bitta ANIQ nuqsonni qayta ishlab chiqaradi:
 *
 *   1. `getCashByChannel` / `getLedgerCashBalance` ikkala davr chegarasini
 *      birga hurmat qiladimi. Ilgari `period` kaliti ikki marta yozilib
 *      (`{lte}` keyin `{gte}`) yuqori chegara JIMGINA yo'qolardi va
 *      "Kassalar hisoboti" har oy uchun bir xil yig'ma qoldiqni ko'rsatib,
 *      kirim/chiqim ustunlarini doim nol qilib qo'yardi.
 *   2. Oy harakati (`getMonthMovement`) offsetni naqd deb sanaydimi. Ilgari
 *      xom `_sum(amount)` olinardi, jurnal esa offsetsiz yozadi — oy yopish
 *      figurasi jurnaldan aynan offset summasiga farq qilardi.
 *   3. Ekrandan yoziladigan chiqim manba qoldig'i darvozasidan o'tadimi.
 *      Ilgari bu darvoza faqat import yo'lida (`recordKassaMovement`) bor edi.
 *
 * Da'volar DELTA bo'yicha o'lchanadi va har biri O'Z kanalida ishlaydi —
 * umumiy test bazasidagi begona qatorlar natijaga ta'sir qilmasin.
 *
 * Live Postgres kerak (TEST_DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "admin", kind: "staff", companyId: null as string | null } };
vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, revalidatePath: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { ACCOUNTS, postLedger, getCashByChannel, getLedgerCashBalance } = await import("@/lib/ledger");
const { getMonthMovement } = await import("@/lib/balance");
const { applyAllocation } = await import("@/lib/bank/importStatement");
const { createKassaEntry } = await import("@/server/kassa/entries");

const TAG = `vitest-m1-${Date.now()}`;

/** Pul testlari uchun bo'sh yil — obligation testlari 2097 ni faqat majburiyatga ishlatadi. */
const Y = 2095;
const utc = (m: number, d: number) => new Date(Date.UTC(Y, m, d));

const ids = { admin: "", clerk: "", chA: "", chB: "", chEmpty: "", client: "" };

beforeAll(async () => {
  const [admin, clerk] = await Promise.all([
    prisma.user.create({
      data: { email: `${TAG}-a@v.local`, fullName: `${TAG} admin`, passwordHash: "x", role: "admin" },
      select: { id: true },
    }),
    // Bosh buxgalter ATAYIN: admin `assertChannelFunds` ni chetlab o'tadi,
    // ya'ni darvozani admin bilan sinab bo'lmaydi.
    prisma.user.create({
      data: { email: `${TAG}-c@v.local`, fullName: `${TAG} buxgalter`, passwordHash: "x", role: "chief_accountant" },
      select: { id: true },
    }),
  ]);
  ids.admin = admin.id;
  ids.clerk = clerk.id;
  SESSION.user = { id: admin.id, role: "admin", kind: "staff", companyId: null };

  const [a, b, empty] = await Promise.all([
    prisma.disbursementChannel.create({
      data: { type: "cash", label: `${TAG} A`, isActive: true },
      select: { id: true },
    }),
    prisma.disbursementChannel.create({
      data: { type: "own_bank", label: `${TAG} B`, isActive: true },
      select: { id: true },
    }),
    prisma.disbursementChannel.create({
      data: { type: "own_bank", label: `${TAG} bo'sh`, isActive: true },
      select: { id: true },
    }),
  ]);
  ids.chA = a.id;
  ids.chB = b.id;
  ids.chEmpty = empty.id;

  const client = await prisma.company.create({
    data: {
      name: `${TAG} mijoz`,
      inn: String(Date.now()).slice(-9),
      contractAmount: 10_000_000,
      contractDate: utc(0, 1),
    },
    select: { id: true },
  });
  ids.client = client.id;

  // Offset shartnomada AYRIM belgilangan bo'lishi kerak — busiz
  // `applyAllocation` uni to'g'ri rad etadi ("limit 0"). Shartnoma: 7 mln,
  // shundan 4 mln bank, 3 mln vzaimozachyot.
  await prisma.companyServiceTerm.create({
    data: {
      companyId: client.id,
      totalAmount: 7_000_000,
      bankAmount: 4_000_000,
      plastikAmount: 0,
      naqdAmount: 0,
      offsetAmount: 3_000_000,
      effectiveFrom: utc(0, 1),
    },
  });
});

afterAll(async () => {
  await prisma.ledgerEntry.deleteMany({ where: { createdBy: { in: [ids.admin, ids.clerk] } } }).catch(() => {});
  await prisma.ledgerEntry.deleteMany({ where: { channelId: { in: [ids.chA, ids.chB, ids.chEmpty] } } }).catch(() => {});
  await prisma.paymentAllocation.deleteMany({ where: { payment: { companyId: ids.client } } }).catch(() => {});
  await prisma.companyServiceTerm.deleteMany({ where: { companyId: ids.client } }).catch(() => {});
  await prisma.payment.deleteMany({ where: { companyId: ids.client } }).catch(() => {});
  await prisma.kassaEntry.deleteMany({ where: { channelId: { in: [ids.chA, ids.chB, ids.chEmpty] } } }).catch(() => {});
  await prisma.kassaEntry.deleteMany({ where: { description: { contains: TAG } } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { userId: { in: [ids.admin, ids.clerk] } } }).catch(() => {});
  await prisma.company.delete({ where: { id: ids.client } }).catch(() => {});
  await prisma.disbursementChannel.deleteMany({ where: { id: { in: [ids.chA, ids.chB, ids.chEmpty] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [ids.admin, ids.clerk] } } }).catch(() => {});
  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────
// 1. DAVR CHEGARALARI USTMA-UST TUSHMAYDI
// ─────────────────────────────────────────────────────────

describe("jurnal qoldig'i ikkala davr chegarasini ham hurmat qiladi", () => {
  const P1 = `${Y}-01`;
  const P2 = `${Y}-02`;

  beforeAll(async () => {
    // Yanvarda 1 mln kirdi, fevralda yana 5 mln — ikki AYRIM davr.
    await postLedger(prisma, {
      legs: [
        { accountId: ACCOUNTS.CASH, debit: 1_000_000, channelId: ids.chA },
        { accountId: ACCOUNTS.KASSA_INCOME, credit: 1_000_000 },
      ],
      period: P1,
      sourceTable: "KassaEntry",
      sourceId: `${TAG}-jan`,
      createdBy: ids.admin,
    });
    await postLedger(prisma, {
      legs: [
        { accountId: ACCOUNTS.CASH, debit: 5_000_000, channelId: ids.chA },
        { accountId: ACCOUNTS.KASSA_INCOME, credit: 5_000_000 },
      ],
      period: P2,
      sourceTable: "KassaEntry",
      sourceId: `${TAG}-feb`,
      createdBy: ids.admin,
    });
  });

  const balanceOf = async (through: string) => {
    const rows = await getCashByChannel(prisma, through, { fromPeriod: P1 });
    return rows.find((r) => r.channelId === ids.chA)?.balance ?? 0;
  };

  it("getCashByChannel: yanvar oxiriga fevral puli KO'RINMAYDI", async () => {
    // Bu aynan `server/kassaReport.ts` beradigan juftlik: throughPeriod + fromPeriod.
    // Yuqori chegara yo'qolganda bu 6 000 000 qaytarardi.
    expect(await balanceOf(P1)).toBe(1_000_000);
    expect(await balanceOf(P2)).toBe(6_000_000);
  });

  it("getCashByChannel: oylik harakat nolga aylanib qolmaydi", async () => {
    // Hisobot kirim ustunini shunday hisoblaydi: joriy oy − oldingi oy.
    // Chegara yo'qolganda ikkala chaqiruv bir xil raqam berib, ayirma
    // HAR DOIM nol chiqardi — ya'ni hech qanday oyda kirim ko'rinmasdi.
    const movement = (await balanceOf(P2)) - (await balanceOf(P1));
    expect(movement).toBe(5_000_000);
  });

  it("getLedgerCashBalance: kanal + ikkala chegara birga ishlaydi", async () => {
    const jan = await getLedgerCashBalance(prisma, P1, { channelId: ids.chA, fromPeriod: P1 });
    const feb = await getLedgerCashBalance(prisma, P2, { channelId: ids.chA, fromPeriod: P1 });
    expect(jan).toBe(1_000_000);
    expect(feb).toBe(6_000_000);
  });
});

// ─────────────────────────────────────────────────────────
// 2. OFFSET NAQD DEB SANALMAYDI
// ─────────────────────────────────────────────────────────

describe("oy harakati offsetni naqd deb sanamaydi", () => {
  it("getMonthMovement kirimi jurnalning CASH harakati bilan bir xil o'sadi", async () => {
    const month = 6; // iyun (1-asosli)
    const before = await getMonthMovement(Y, month);
    const ledgerBefore = await getLedgerCashBalance(prisma, `${Y}-06`, { fromPeriod: `${Y}-06` });

    // Bankdan 4 mln HAQIQIY pul...
    await applyAllocation(prisma, {
      companyId: ids.client,
      amount: 4_000_000,
      receivedAt: utc(5, 10),
      source: "bank",
      paymentMethod: "schyot",
      dedupKey: `${TAG}:bank`,
      channelId: ids.chB,
      createdBy: ids.admin,
    });
    // ...va 3 mln vzaimozachyot: qarz yopiladi, LEKIN pul kelmaydi.
    await applyAllocation(prisma, {
      companyId: ids.client,
      amount: 3_000_000,
      receivedAt: utc(5, 11),
      source: "offset",
      paymentMethod: "boshqa",
      dedupKey: `${TAG}:offset`,
      channelId: null,
      createdBy: ids.admin,
    });

    const after = await getMonthMovement(Y, month);
    const ledgerAfter = await getLedgerCashBalance(prisma, `${Y}-06`, { fromPeriod: `${Y}-06` });

    // Qarz 7 mln ga yopildi, kassaga esa 4 mln tushdi.
    const payment = await prisma.payment.findFirst({
      where: { companyId: ids.client },
      select: { amount: true },
    });
    expect(Number(payment?.amount)).toBe(7_000_000);

    // ASOSIY DA'VO: harakat jurnal bilan AYNAN bir xil o'sdi.
    // Xom `_sum(amount)` da bu 7 000 000 chiqib, jurnaldan 3 mln farq qilardi
    // va oy yopish `ledger_source_balance_match` bandini soxta qizil qilardi.
    expect(after.income - before.income).toBe(4_000_000);
    expect(ledgerAfter - ledgerBefore).toBe(4_000_000);
  });
});

// ─────────────────────────────────────────────────────────
// 3. MANBA DARVOZASINI EKRAN YO'LIDAN CHETLAB O'TIB BO'LMAYDI
// ─────────────────────────────────────────────────────────

describe("ekrandan yozilgan chiqim manba qoldig'idan oshib keta olmaydi", () => {
  beforeAll(async () => {
    // Umumiy balansni ATAYIN to'ldiramiz — BOSHQA kanalga. Shunda global
    // `assertSufficientFunds` o'tadi va rad etishning yagona sababi
    // manba darvozasi bo'lib qoladi.
    await postLedger(prisma, {
      legs: [
        { accountId: ACCOUNTS.CASH, debit: 900_000_000, channelId: ids.chA },
        { accountId: ACCOUNTS.KASSA_INCOME, credit: 900_000_000 },
      ],
      period: `${Y}-09`,
      sourceTable: "KassaEntry",
      sourceId: `${TAG}-fund`,
      createdBy: ids.admin,
    });
    await prisma.kassaEntry.create({
      data: {
        type: "income",
        category: "test",
        amount: 900_000_000,
        date: utc(8, 1),
        description: `${TAG} global to'ldirish`,
        channelId: ids.chA,
        createdBy: ids.admin,
      },
    });
  });

  it("bo'sh manbadan chiqim RAD ETILADI (bosh buxgalter)", async () => {
    SESSION.user = { id: ids.clerk, role: "chief_accountant", kind: "staff", companyId: null };

    await expect(
      createKassaEntry({
        type: "expense",
        category: "boshqa",
        amount: 500_000, // 1 mln dan kam ⇒ avto-tasdiq, pul DARHOL chiqadi
        date: utc(8, 15),
        description: `${TAG} bo'sh manbadan`,
        channelId: ids.chEmpty,
      })
    ).rejects.toThrow(/yetarli mablag' yo'q/);

    // Qator UMUMAN yozilmagan bo'lishi kerak — tranzaksiya butunlay orqaga qaytadi.
    const written = await prisma.kassaEntry.count({ where: { channelId: ids.chEmpty } });
    expect(written).toBe(0);
  });

  it("puli bor manbadan xuddi shu chiqim O'TADI", async () => {
    SESSION.user = { id: ids.clerk, role: "chief_accountant", kind: "staff", companyId: null };

    const row = await createKassaEntry({
      type: "expense",
      category: "boshqa",
      amount: 500_000,
      date: utc(8, 15),
      description: `${TAG} to'la manbadan`,
      channelId: ids.chA,
    });
    expect(row.status).toBe("approved");

    // Darvoza to'sadi, lekin ishni bloklab qo'ymaydi: jurnalga ham tushdi.
    const legs = await prisma.ledgerEntry.count({
      where: { sourceTable: "KassaEntry", sourceId: row.id },
    });
    expect(legs).toBe(2);
  });
});
