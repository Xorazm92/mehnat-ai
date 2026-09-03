/**
 * KASSA YAXLITLIGI — auditda topilgan uchta buzilish yo'lining qulfi.
 *
 * Har bir `describe` bitta ANIQ nuqsonni qayta ishlab chiqaradi. Ular
 * "kassa ishlayaptimi" degan umumiy savolga emas, "shu yo'l bilan pul
 * jurnaldan tushib qola oladimi" degan aniq savolga javob beradi:
 *
 *   1. Nomsiz naqd/plastik tushum jadvalga yozilib, JURNALGA tushmasdi —
 *      ya'ni har bir shunday tushum "jadval balansi" va "jurnal qoldig'i"
 *      orasidagi tafovutni kengaytirardi va "pul qaysi kassada" hisoboti
 *      (u faqat jurnaldan o'qiydi) o'sha pulni umuman ko'rmasdi.
 *   2. Bitta mijoz bir oyda ikki xil kanal orqali to'lasa, jurnal BUTUN
 *      summani oxirgi kanalga yozib yuborardi — kassalar kesimi buzilardi.
 *   3. `reverseLedger` muvozanatni tekshirmasdi: nosoz izni teskarilash
 *      nosozlikni ikkilantirardi.
 *
 * Live Postgres kerak (TEST_DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const SESSION = { user: { id: "", role: "admin", kind: "staff", companyId: null as string | null } };
vi.mock("@/lib/auth", () => ({ auth: async () => (SESSION.user.id ? SESSION : null) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, revalidatePath: () => {} }));

const { prisma } = await import("@/lib/prisma");
const { ACCOUNTS, reverseLedger, getLedgerCashBalance, postLedger } = await import("@/lib/ledger");
const { applyAllocation } = await import("@/lib/bank/importStatement");
const { recordManualReceipt } = await import("@/server/bankImport");
const { getAvailableBalance } = await import("@/lib/balance");
const { periodKeyOf } = await import("@/lib/periods");

const TAG = `vitest-integrity-${Date.now()}`;
// 2098-yil — boshqa test fayllari 2099 ni band qilgan, davr ham ochiq.
const at = (m: number, d: number) => new Date(Date.UTC(2098, m, d));

const ids = { user: "", cash: "", bank: "", client: "" };

beforeAll(async () => {
  const user = await prisma.user.create({
    // `requireStatementRole` ro'yxati: super_admin | admin | bank_manager.
    data: { email: `${TAG}@v.local`, fullName: `${TAG} admin`, passwordHash: "x", role: "admin" },
    select: { id: true },
  });
  ids.user = user.id;
  SESSION.user = { id: user.id, role: "admin", kind: "staff", companyId: null };

  const [cash, bank] = await Promise.all([
    prisma.disbursementChannel.create({
      data: { type: "cash", label: `${TAG} seyf`, isActive: true },
      select: { id: true },
    }),
    prisma.disbursementChannel.create({
      data: { type: "own_bank", label: `${TAG} schyot`, isActive: true },
      select: { id: true },
    }),
  ]);
  ids.cash = cash.id;
  ids.bank = bank.id;

  const client = await prisma.company.create({
    data: {
      name: `${TAG} MIJOZ`,
      inn: `8${Date.now()}`.slice(0, 9),
      contractAmount: 10_000_000,
      contractDate: at(7, 1),
    },
    select: { id: true },
  });
  ids.client = client.id;

  // Offset (vzaimozachyot) shartnomada AYRIM belgilangan bo'lishi kerak —
  // busiz `applyAllocation` uni to'g'ri rad etadi ("limit 0"). Shartnoma
  // shartlari: 10 mln jami, shundan 1 mln offset bilan yopiladi.
  await prisma.companyServiceTerm.create({
    data: {
      companyId: client.id,
      totalAmount: 10_000_000,
      bankAmount: 6_000_000,
      plastikAmount: 0,
      naqdAmount: 3_000_000,
      offsetAmount: 1_000_000,
      effectiveFrom: at(7, 1),
    },
  });
});

afterAll(async () => {
  const entries = await prisma.kassaEntry.findMany({
    where: { OR: [{ createdBy: ids.user }, { description: { contains: TAG } }] },
    select: { id: true },
  });
  const payments = await prisma.payment.findMany({
    where: { companyId: ids.client },
    select: { id: true },
  });
  const sourceIds = [...entries.map((e) => e.id), ...payments.map((p) => p.id)];

  await prisma.ledgerEntry.deleteMany({ where: { sourceId: { in: sourceIds } } });
  await prisma.ledgerEntry.deleteMany({ where: { createdBy: ids.user } });
  await prisma.paymentAllocation.deleteMany({ where: { paymentId: { in: payments.map((p) => p.id) } } });
  await prisma.payment.deleteMany({ where: { companyId: ids.client } });
  await prisma.companyServiceTerm.deleteMany({ where: { companyId: ids.client } });
  await prisma.kassaEntry.deleteMany({ where: { id: { in: entries.map((e) => e.id) } } });
  await prisma.auditLog.deleteMany({ where: { userId: ids.user } });
  await prisma.company.deleteMany({ where: { id: ids.client } });
  await prisma.disbursementChannel.deleteMany({ where: { id: { in: [ids.cash, ids.bank] } } });
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

const legsOf = (sourceId: string) =>
  prisma.ledgerEntry.findMany({ where: { sourceId }, orderBy: { createdAt: "asc" } });

/** Bitta manba bo'yicha CASH netto — kanal kesimida. */
async function cashByChannel(sourceId: string): Promise<Record<string, number>> {
  const rows = await prisma.ledgerEntry.findMany({
    where: { sourceId, accountId: ACCOUNTS.CASH },
    select: { channelId: true, debit: true, credit: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = r.channelId ?? "(null)";
    out[k] = (out[k] ?? 0) + Number(r.debit) - Number(r.credit);
  }
  return out;
}

// ─────────────────────────────────────────────────────────
// 1. NOMSIZ TUSHUM
// ─────────────────────────────────────────────────────────

describe("nomsiz naqd tushum jurnalga tushadi", () => {
  it("KassaEntry bilan birga ikki tomonlama yozuv yoziladi", async () => {
    const before = await getLedgerCashBalance(prisma, undefined, { fromPeriod: "2098-01" });

    const res = (await recordManualReceipt({
      source: "naqd",
      amount: 2_500_000,
      receivedAt: at(8, 4),
      channelId: ids.cash,
      note: `${TAG} nomsiz tushum`,
    })) as { kind: "anonymous"; entryId: string };

    expect(res.kind).toBe("anonymous");

    // Jadval qatori bor.
    const entry = await prisma.kassaEntry.findUniqueOrThrow({ where: { id: res.entryId } });
    expect(entry.type).toBe("income");
    expect(Number(entry.amount)).toBe(2_500_000);
    expect(entry.status).toBe("approved");

    // ...VA jurnal izi bor. Avval aynan shu yo'q edi.
    const legs = await legsOf(res.entryId);
    expect(legs).toHaveLength(2);
    expect(legs.reduce((s, l) => s + Number(l.debit), 0)).toBe(2_500_000);
    expect(legs.reduce((s, l) => s + Number(l.credit), 0)).toBe(2_500_000);

    // Pul TANLANGAN kassaga tushdi — "kanali ko'rsatilmagan" chelagiga emas.
    expect(await cashByChannel(res.entryId)).toEqual({ [ids.cash]: 2_500_000 });

    // Umumiy jurnal qoldig'i aynan shu summaga oshdi.
    const after = await getLedgerCashBalance(prisma, undefined, { fromPeriod: "2098-01" });
    expect(after - before).toBeCloseTo(2_500_000, 2);
  });

  it("aynan shu tushumni ikkinchi marta yuborish ikkinchi qator yaratmaydi", async () => {
    const input = {
      source: "plastik" as const,
      amount: 700_000,
      receivedAt: at(8, 5),
      channelId: ids.bank,
      note: `${TAG} takroriy`,
    };

    const first = (await recordManualReceipt(input)) as { entryId: string };
    const second = (await recordManualReceipt(input)) as { entryId: string };

    // Bir xil qator qaytadi — dublikat pul yozilmaydi.
    expect(second.entryId).toBe(first.entryId);

    const rows = await prisma.kassaEntry.count({
      where: { dedupKey: `manual:plastik:anon:2098-09-05:700000.00` },
    });
    expect(rows).toBe(1);

    // Jurnalda ham bitta juft oyoq.
    expect(await legsOf(first.entryId)).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────
// 2. KANAL KESIMI
// ─────────────────────────────────────────────────────────

describe("bir oyda ikki kanaldan to'langan tushum kanallar bo'yicha bo'linadi", () => {
  it("ikkinchi taqsimot birinchisining kanalini o'zgartirmaydi", async () => {
    // 1-to'lov: bank hisobiga 6 mln.
    const first = await applyAllocation(prisma, {
      companyId: ids.client,
      amount: 6_000_000,
      receivedAt: at(9, 3),
      source: "bank",
      paymentMethod: "schyot",
      dedupKey: `${TAG}:bank:1`,
      channelId: ids.bank,
      createdBy: ids.user,
    });

    expect(await cashByChannel(first.paymentId)).toEqual({ [ids.bank]: 6_000_000 });

    // 2-to'lov: AYNAN SHU oyda, naqd seyfga 2 mln.
    const second = await applyAllocation(prisma, {
      companyId: ids.client,
      amount: 2_000_000,
      receivedAt: at(9, 17),
      source: "naqd",
      paymentMethod: "naqd",
      dedupKey: `${TAG}:naqd:1`,
      channelId: ids.cash,
      createdBy: ids.user,
    });

    expect(second.paymentId).toBe(first.paymentId); // oylik yig'ma qator bitta
    expect(second.paymentTotal).toBe(8_000_000);

    // ASOSIY DA'VO: 8 mln OXIRGI kanalga ko'chib ketmadi.
    expect(await cashByChannel(first.paymentId)).toEqual({
      [ids.bank]: 6_000_000,
      [ids.cash]: 2_000_000,
    });

    // Jurnal baribir muvozanatda: CASH oyoqlari 8 mln = CONTRACT_INCOME 8 mln.
    const legs = await prisma.ledgerEntry.findMany({
      where: { sourceId: first.paymentId, sourceTable: "Payment" },
    });
    const live = legs.filter((l) => Number(l.debit) + Number(l.credit) > 0);
    const debit = live.reduce((s, l) => s + Number(l.debit), 0);
    const credit = live.reduce((s, l) => s + Number(l.credit), 0);
    expect(debit).toBe(credit);
  });

  it("offset (vzaimozachyot) jurnalga naqd bo'lib tushmaydi", async () => {
    const res = await applyAllocation(prisma, {
      companyId: ids.client,
      amount: 1_000_000,
      receivedAt: at(9, 20),
      source: "offset",
      paymentMethod: "boshqa",
      dedupKey: `${TAG}:offset:1`,
      channelId: null,
      createdBy: ids.user,
    });

    // Qarz 9 mln ga yopildi...
    expect(res.paymentTotal).toBe(9_000_000);
    // ...lekin kassaga baribir 8 mln tushgan: offset pul harakati emas.
    expect(await cashByChannel(res.paymentId)).toEqual({
      [ids.bank]: 6_000_000,
      [ids.cash]: 2_000_000,
    });
  });
});

// ─────────────────────────────────────────────────────────
// 3. TESKARI YOZUV MUVOZANATI
// ─────────────────────────────────────────────────────────

describe("reverseLedger muvozanatsiz izni teskarilamaydi", () => {
  const sourceId = `${TAG}-broken`;

  it("bitta oyoqli iz uchun xato beradi va hech narsa yozmaydi", async () => {
    // Nosoz iz — prodda aynan shunday 95 ta tranzaksiya topildi.
    await prisma.ledgerEntry.create({
      data: {
        transactionId: `${TAG}-tx`,
        accountId: ACCOUNTS.CASH,
        debit: 5_000_000,
        credit: 0,
        sourceTable: "KassaEntry",
        sourceId,
        period: "2098-10",
        createdBy: ids.user,
      },
    });

    await expect(
      reverseLedger(prisma as never, { sourceTable: "KassaEntry", sourceId, reason: "test" })
    ).rejects.toThrow(/muvozanatsiz/);

    // Teskari yozuv YOZILMAGAN — nosozlik ikkilanmadi.
    const rows = await prisma.ledgerEntry.count({
      where: { sourceId, sourceTable: "KassaEntry-reversal" },
    });
    expect(rows).toBe(0);

    await prisma.ledgerEntry.deleteMany({ where: { sourceId } });
  });

  it("muvozanatli izni odatdagidek teskarilaydi", async () => {
    const okSource = `${TAG}-ok`;
    await prisma.ledgerEntry.createMany({
      data: [
        {
          transactionId: `${TAG}-tx-ok`,
          accountId: ACCOUNTS.OPERATING_EXPENSE,
          debit: 3_000_000,
          credit: 0,
          sourceTable: "KassaEntry",
          sourceId: okSource,
          period: "2098-10",
          createdBy: ids.user,
        },
        {
          transactionId: `${TAG}-tx-ok`,
          accountId: ACCOUNTS.CASH,
          debit: 0,
          credit: 3_000_000,
          channelId: ids.cash,
          sourceTable: "KassaEntry",
          sourceId: okSource,
          period: "2098-10",
          createdBy: ids.user,
        },
      ],
    });

    const txId = await reverseLedger(prisma as never, {
      sourceTable: "KassaEntry",
      sourceId: okSource,
      createdBy: ids.user,
      reason: "test",
    });
    expect(txId).not.toBeNull();

    const all = await prisma.ledgerEntry.findMany({ where: { sourceId: okSource } });
    const net = all.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
    expect(net).toBe(0); // netto nolga tushdi

    // Kanal o'lchovi ham tiklandi: pul kartada abadiy qolib ketmaydi.
    const cashLegs = all.filter((l) => l.accountId === ACCOUNTS.CASH);
    expect(cashLegs.every((l) => l.channelId === ids.cash)).toBe(true);
    expect(cashLegs.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0)).toBe(0);

    await prisma.ledgerEntry.deleteMany({ where: { sourceId: okSource } });
  });
});

// ─────────────────────────────────────────────────────────
// 4. MOLIYAVIY YORDAM (QARZ) — real pul, KassaEntry/Payment/Payout dan tashqari
// ─────────────────────────────────────────────────────────
//
// PROD AUDITIDA TOPILDI (2026-09-03): `scripts/post-bank-non-pnl.ts` bank
// vipiskasidagi moliyaviy yordam qatorlarini to'g'ridan-to'g'ri jurnalga
// yozadi (Dt/Kt CASH ↔ LOAN_GIVEN/LOAN_RECEIVED) — bu haqiqiy pul harakati,
// lekin `KassaEntry`/`Payment`/`Payout` orqali EMAS. Prodda bu 65 000 000
// so'mlik doimiy, tushunarsiz farq berardi: jadval balansi 326 445 040,81,
// jurnal esa 391 445 040,81 — ikkalasi ham "to'g'ri" hisoblangan, lekin
// ikki xil savolga javob berardi.
describe("moliyaviy yordam (qarz) balansga kiradi", () => {
  it("LOAN_GIVEN va LOAN_RECEIVED CASH harakati getAvailableBalance() da ko'rinadi", async () => {
    const before = await getAvailableBalance();
    const ledgerBefore = await getLedgerCashBalance(prisma as never, undefined, { fromPeriod: "2026-08" });

    // Biz 5 mln berdik (chiqim): Dt LOAN_GIVEN / Kt CASH.
    const givenTxId = await postLedger(prisma as never, {
      legs: [
        { accountId: ACCOUNTS.LOAN_GIVEN, debit: 5_000_000, subjectId: ids.client },
        { accountId: ACCOUNTS.CASH, credit: 5_000_000 },
      ],
      period: periodKeyOf(at(9, 5)),
      sourceTable: "BankTransaction",
      sourceId: `${TAG}-given`,
      createdBy: ids.user,
      description: `${TAG} moliyaviy yordam berildi`,
    });
    expect(givenTxId).toBeTruthy();

    // Bizga 3 mln qarz berishdi (kirim): Dt CASH / Kt LOAN_RECEIVED.
    const receivedTxId = await postLedger(prisma as never, {
      legs: [
        { accountId: ACCOUNTS.CASH, debit: 3_000_000 },
        { accountId: ACCOUNTS.LOAN_RECEIVED, credit: 3_000_000, subjectId: ids.client },
      ],
      period: periodKeyOf(at(9, 6)),
      sourceTable: "BankTransaction",
      sourceId: `${TAG}-received`,
      createdBy: ids.user,
      description: `${TAG} moliyaviy yordam olindi`,
    });
    expect(receivedTxId).toBeTruthy();

    // Netto CASH harakati: -5 mln + 3 mln = -2 mln.
    const after = await getAvailableBalance();
    expect(after.loanCashMovement - before.loanCashMovement).toBeCloseTo(-2_000_000, 2);

    // ASOSIY DA'VO: bu harakat KassaEntry/Payment/Payout hech biriga
    // tegmaydi (income/outflow o'zgarmaydi), lekin BALANS o'zgaradi —
    // pulning o'zi haqiqiy ko'chganini aks ettiradi.
    expect(after.income).toBeCloseTo(before.income, 2);
    expect(after.outflow).toBeCloseTo(before.outflow, 2);
    expect(after.balance - before.balance).toBeCloseTo(-2_000_000, 2);

    // Jadval balansi va jurnal CASH qoldig'i endi BIR XIL FARQ bilan
    // harakatlanadi — auditda topilgan 65 mln'lik doimiy tafovutning aynan
    // shu turi endi yo'q. (Butun bazaning mutlaq balansini emas, FARQNI
    // solishtiramiz — boshqa test fayllarining qoldiq fixturalariga bog'liq
    // bo'lmasin.)
    const ledgerAfter = await getLedgerCashBalance(prisma as never, undefined, { fromPeriod: "2026-08" });
    expect(after.balance - before.balance).toBeCloseTo(ledgerAfter - ledgerBefore, 2);
  });
});
