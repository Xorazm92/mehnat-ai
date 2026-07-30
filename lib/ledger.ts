// =====================================================
// DOUBLE-ENTRY LEDGER yadrosi
// =====================================================
// Har bir moliyaviy harakat ikki tomonlama yoziladi: Σdebit == Σcredit.
// Ledger APPEND-ONLY: update/delete yo'q; tuzatish faqat reversal orqali.
// Bu modul sof validatsiya + tranzaksiya ichida yozish helperlari — chaqiruvchi
// server action o'z auditini (recordAuditLog) o'zi yozadi.
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";

/** Hisoblar rejasi (soddalashtirilgan boshqaruv hisobi). */
export const ACCOUNTS = {
  CASH: "CASH", // kassa (aktiv)
  CONTRACT_INCOME: "CONTRACT_INCOME", // firma shartnoma to'lovlari (daromad)
  KASSA_INCOME: "KASSA_INCOME", // boshqa kassa kirimlari (daromad)
  OPERATING_EXPENSE: "OPERATING_EXPENSE", // operatsion xarajatlar
  SALARY_EXPENSE: "SALARY_EXPENSE", // oylik/avans to'lovlari
} as const;

export type AccountId = (typeof ACCOUNTS)[keyof typeof ACCOUNTS];

export interface LedgerLeg {
  accountId: AccountId;
  debit?: number;
  credit?: number;
  description?: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Sof validatsiya: har oyoq faqat debit YOKI credit (musbat), va jami
 * Σdebit == Σcredit (2 kasr aniqlikda). Buzilsa — xato, hech narsa yozilmaydi.
 */
export function assertBalancedLegs(legs: LedgerLeg[]): void {
  if (legs.length < 2) throw new Error("Ledger tranzaksiyasi kamida 2 oyoqdan iborat bo'lishi kerak");
  let debit = 0;
  let credit = 0;
  for (const leg of legs) {
    const d = leg.debit ?? 0;
    const c = leg.credit ?? 0;
    if (d < 0 || c < 0) throw new Error("Ledger oyog'ida manfiy summa bo'lishi mumkin emas");
    if ((d > 0) === (c > 0)) {
      throw new Error("Har bir ledger oyog'i faqat debit YOKI credit bo'lishi kerak");
    }
    debit += d;
    credit += c;
  }
  if (r2(debit) !== r2(credit)) {
    throw new Error(`Ledger balanslashmagan: debit ${r2(debit)} != credit ${r2(credit)}`);
  }
}

export interface PostLedgerInput {
  legs: LedgerLeg[];
  period: string; // "YYYY-MM"
  sourceTable: string; // Expense | KassaEntry | Payment | Payout
  sourceId: string;
  createdBy?: string | null;
  description?: string;
}

type Db = Prisma.TransactionClient;

/**
 * Ikki tomonlama yozuvni bitta transactionId ostida yozadi.
 * Tranzaksiya (tx) ichida chaqirilsin — asosiy yozuv bilan atomar bo'lsin.
 */
export async function postLedger(db: Db, input: PostLedgerInput): Promise<string> {
  assertBalancedLegs(input.legs);
  if (!/^\d{4}-\d{2}$/.test(input.period)) {
    throw new Error("Ledger davri YYYY-MM formatida bo'lishi kerak");
  }
  const transactionId = randomUUID();
  await db.ledgerEntry.createMany({
    data: input.legs.map((leg) => ({
      transactionId,
      accountId: leg.accountId,
      debit: new Prisma.Decimal(r2(leg.debit ?? 0)),
      credit: new Prisma.Decimal(r2(leg.credit ?? 0)),
      description: leg.description ?? input.description ?? null,
      sourceTable: input.sourceTable,
      sourceId: input.sourceId,
      period: input.period,
      createdBy: input.createdBy ?? null,
    })),
  });
  return transactionId;
}

/**
 * Manba yozuvi bekor qilinganda (soft delete / status orqaga qaytishi) uning
 * ledger izini TESKARI yozuv bilan nolga keltiradi. NETTO bo'yicha ishlaydi:
 * post→reverse→post→reverse sikllari necha marta bo'lsa ham, har chaqiruv
 * faqat hali yopilmagan qoldiqni teskarilaydi (netto nol bo'lsa — hech narsa
 * yozmaydi, null). Reversal ham append-only — asl qatorlar tegilmaydi.
 */
export async function reverseLedger(
  db: Db,
  params: { sourceTable: string; sourceId: string; createdBy?: string | null; reason?: string }
): Promise<string | null> {
  const reversalTable = `${params.sourceTable}-reversal`;
  const rows = await db.ledgerEntry.findMany({
    where: { sourceId: params.sourceId, sourceTable: { in: [params.sourceTable, reversalTable] } },
    select: { accountId: true, debit: true, credit: true, period: true },
    orderBy: { createdAt: "desc" },
  });
  if (rows.length === 0) return null;

  // Har hisob bo'yicha netto (debit − credit), post va oldingi reversal'lar birga.
  const net = new Map<string, number>();
  const lastPeriod = rows[0].period;
  for (const e of rows) {
    net.set(e.accountId, r2((net.get(e.accountId) ?? 0) + Number(e.debit) - Number(e.credit)));
  }

  const legs: { accountId: string; debit: number; credit: number }[] = [];
  for (const [accountId, v] of net) {
    if (v > 0) legs.push({ accountId, debit: 0, credit: v });
    else if (v < 0) legs.push({ accountId, debit: -v, credit: 0 });
  }
  if (legs.length === 0) return null; // netto allaqachon nol

  const transactionId = randomUUID();
  await db.ledgerEntry.createMany({
    data: legs.map((leg) => ({
      transactionId,
      accountId: leg.accountId,
      debit: new Prisma.Decimal(leg.debit),
      credit: new Prisma.Decimal(leg.credit),
      description: `REVERSAL${params.reason ? `: ${params.reason}` : ""}`,
      sourceTable: reversalTable,
      sourceId: params.sourceId,
      period: lastPeriod,
      createdBy: params.createdBy ?? null,
    })),
  });
  return transactionId;
}

/**
 * Sinov balansi: har bir hisob bo'yicha Σdebit va Σcredit.
 * Σdebit == Σcredit bo'lishi shart (double-entry invariant).
 * period: "YYYY-MM" — aynan shu oy; "YYYY" — butun yil; berilmasa — butun jurnal.
 */
export async function getTrialBalance(db: Db, period?: string) {
  const where =
    period === undefined
      ? {}
      : period.length === 4
        ? { period: { startsWith: `${period}-` } }
        : { period };
  const rows = await db.ledgerEntry.groupBy({
    by: ["accountId"],
    where,
    _sum: { debit: true, credit: true },
  });
  const accounts = rows.map((r) => ({
    accountId: r.accountId,
    debit: Number(r._sum.debit ?? 0),
    credit: Number(r._sum.credit ?? 0),
  }));
  const totalDebit = r2(accounts.reduce((s, a) => s + a.debit, 0));
  const totalCredit = r2(accounts.reduce((s, a) => s + a.credit, 0));
  return { accounts, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

/**
 * CASH hisobining ledger bo'yicha qoldig'i (debit − credit).
 *
 * `throughPeriod` ("YYYY-MM") berilsa — SHU DAVR OXIRIGA bo'lgan qoldiq.
 * Oy yopishda aynan shu kerak: 2026-07 ni yopayotganda 2026-09 dagi xarajat
 * to'sqinlik qilmasligi kerak. Busiz o'tgan oyni yopish keyingi oylardagi
 * harakatlarga bog'lanib qolardi — ya'ni bir marta minusga tushgan kassa
 * butun tarixni qulflab qo'yardi.
 *
 * Davrsiz chaqirilsa — butun tarix bo'yicha (backfill hisobotlari uchun).
 * "YYYY-MM" formatida leksikografik tartib xronologik tartib bilan bir xil,
 * shuning uchun oddiy `lte` yetarli va `@@index([accountId, period])` ishlaydi.
 */
export async function getLedgerCashBalance(db: Db, throughPeriod?: string): Promise<number> {
  const agg = await db.ledgerEntry.aggregate({
    where: {
      accountId: ACCOUNTS.CASH,
      ...(throughPeriod ? { period: { lte: throughPeriod } } : {}),
    },
    _sum: { debit: true, credit: true },
  });
  return r2(Number(agg._sum.debit ?? 0) - Number(agg._sum.credit ?? 0));
}
