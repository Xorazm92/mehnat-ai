// =====================================================
// MONTH-END CLOSING yadrosi — framework-free
// =====================================================
// Auth/audit YO'Q (server/monthClosing.ts o'raydi), Next ham YO'Q — bot cron
// bemalol import qiladi. Barcha tekshiruvlar shu yerda: checklist (READY_TO_CLOSE
// validatsiyasi), yopilish raqamlari (opening/income/expense/closing) va
// statuslarni avtomatik boshqarish.
import { Prisma } from "@prisma/client";
import { getTrialBalance, getLedgerCashBalance, ACCOUNTS, LEDGER_DRIFT_TOLERANCE } from "@/lib/ledger";
import { getMonthMovement, getMovementBeforeMonth } from "@/lib/balance";
import { computeObligation, computeRemaining } from "@/lib/payrollObligation";
import { isSettledPayment } from "@/lib/debt";
import { PERIOD_STATUS } from "@/lib/periodLock";

type Db = Prisma.TransactionClient;

export const monthKey = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, "0")}`;

export const prevOf = (year: number, month: number) =>
  month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };

export const nextOf = (year: number, month: number) =>
  month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

export interface ChecklistItem {
  key: string;
  label: string;
  ok: boolean;
  blocking: boolean;
  count?: number;
  detail?: string;
}

export interface ChecklistResult {
  items: ChecklistItem[];
  /** Barcha BLOCKING bandlar yashil. */
  ready: boolean;
  blockingErrors: string[];
}

/** Global davr qatorini topadi yoki OPEN holatda yaratadi. */
export async function ensureGlobalPeriod(db: Db, year: number, month: number) {
  const existing = await db.accountingPeriod.findFirst({
    where: { companyId: null, year, month },
  });
  if (existing) return existing;
  return db.accountingPeriod.create({
    data: { companyId: null, year, month, status: PERIOD_STATUS.OPEN },
  });
}

/**
 * Ledger ↔ manba mosligi: davr ichidagi har bir manba (Expense/KassaEntry/
 * Payout/Payment) uchun ledger CASH netto harakati manbaning joriy holatidan
 * kutilgan qiymatga teng bo'lishi shart. Bitta tekshiruv uch xatoni tutadi:
 * dublikat post, orphan (manbasi yo'q ledger yozuvi), buzilgan bog'lanish.
 */
async function checkLedgerSourceIntegrity(db: Db, key: string): Promise<string[]> {
  // `Expense` OLIB TASHLANDI — u `KassaEntry` ga birlashtirildi.
  const BASE_TABLES = ["KassaEntry", "Payout", "Payment"] as const;
  const tables = BASE_TABLES.flatMap((t) => [t, `${t}-reversal`]);
  const entries = await db.ledgerEntry.findMany({
    where: { period: key, sourceTable: { in: tables } },
    select: { sourceTable: true, sourceId: true, accountId: true, debit: true, credit: true },
  });

  // (jadval, id) bo'yicha CASH netto
  const net = new Map<string, number>();
  for (const e of entries) {
    if (e.accountId !== ACCOUNTS.CASH) continue;
    const base = (e.sourceTable ?? "").replace(/-reversal$/, "");
    const k = `${base}|${e.sourceId}`;
    net.set(k, (net.get(k) ?? 0) + Number(e.debit) - Number(e.credit));
  }

  const idsOf = (table: string) =>
    [...net.keys()].filter((k) => k.startsWith(`${table}|`)).map((k) => k.split("|")[1]);

  const [kassa, payouts, payments] = await Promise.all([
    db.kassaEntry.findMany({
      where: { id: { in: idsOf("KassaEntry") } },
      select: { id: true, amount: true, type: true, deletedAt: true, date: true, status: true },
    }),
    db.payout.findMany({
      where: { id: { in: idsOf("Payout") } },
      select: { id: true, amount: true, deletedAt: true, month: true },
    }),
    db.payment.findMany({
      where: { id: { in: idsOf("Payment") } },
      select: { id: true, amount: true, status: true, deletedAt: true, period: true },
    }),
  ]);

  const keyOfDate = (d: Date) => monthKey(d.getFullYear(), d.getMonth() + 1);
  const expected = new Map<string, number>();
  for (const k of kassa) {
    const sign = k.type === "income" ? 1 : -1;
    expected.set(
      `KassaEntry|${k.id}`,
      keyOfDate(k.date) === key && !k.deletedAt && k.status === "approved"
        ? sign * Number(k.amount)
        : 0
    );
  }
  for (const p of payouts) {
    expected.set(`Payout|${p.id}`, p.month === key && !p.deletedAt ? -Number(p.amount) : 0);
  }
  for (const p of payments) {
    // `isSettledPayment` — 'paid' VA 'partial'. Aynan shu shart bilan
    // `server/kassa.ts` `upsertPayment` jurnalga yozadi; bu yerda faqat 'paid'
    // kutilardi, ya'ni qo'lda kiritilgan HAR QANDAY qisman to'lov "ledger mos
    // emas" xatosi berib oy yopilishini BLOKLAB qo'yardi.
    expected.set(
      `Payment|${p.id}`,
      p.period === key && isSettledPayment(p.status) && !p.deletedAt ? Number(p.amount) : 0
    );
  }

  const errors: string[] = [];
  for (const [k, netVal] of net) {
    const exp = expected.get(k);
    if (exp === undefined) {
      errors.push(`orphan ledger yozuvi: ${k} (manba topilmadi)`);
      continue;
    }
    if (Math.abs(netVal - exp) > 0.01) {
      errors.push(`ledger mos emas: ${k} netto ${netVal}, kutilgan ${exp} (dublikat/buzilgan post)`);
    }
  }
  return errors;
}

/** READY_TO_CLOSE checklist — har band yashil/qizil, blocking belgisi bilan. */
export async function gatherChecklist(db: Db, year: number, month: number): Promise<ChecklistResult> {
  const key = monthKey(year, month);
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 1);

  const [
    pendingExpenses,
    pendingPayroll,
    pendingKpi,
    pendingPayments,
    obligations,
    payoutsPaid,
    trial,
    cashBalance,
    integrityErrors,
    closeFigures,
  ] = await Promise.all([
    db.kassaEntry.count({
      where: { status: "pending", deletedAt: null, date: { gte: from, lt: to } },
    }),
    db.payrollAdjustment.count({
      where: { isApproved: false, deletedAt: null, month: { in: [key, `${key}-01`] } },
    }),
    db.monthlyPerformance.count({
      where: { status: { in: ["draft", "submitted"] }, month: { startsWith: key } },
    }),
    db.payment.count({ where: { status: "pending", deletedAt: null, period: key } }),
    db.payrollAdjustment.findMany({
      where: {
        deletedAt: null,
        month: { in: [key, `${key}-01`] },
      },
      select: { adjustmentType: true, amount: true, isApproved: true },
    }),
    db.payout.aggregate({
      where: { deletedAt: null, month: key },
      _sum: { amount: true },
    }),
    getTrialBalance(db, key),
    getLedgerCashBalance(db, key),
    checkLedgerSourceIntegrity(db, key),
    computeCloseFigures(db, year, month),
  ]);

  // Majburiyat formulasi to'lov chegarasi bilan BIR XIL manbadan
  // (`lib/payrollObligation.ts`). Ilgari bu yerda avans majburiyatga
  // qo'shilardi, ya'ni to'liq to'langan oy ham "to'lanmagan majburiyat =
  // avans summasi" degan doimiy soxta ogohlantirish berardi.
  const obligationTotal = computeObligation(obligations);
  const paidTotal = Number(payoutsPaid._sum.amount ?? 0);
  const unpaid = computeRemaining(obligationTotal, paidTotal);
  const balanceDiff = Math.abs(closeFigures.closingBalance - closeFigures.ledgerBalance);

  const items: ChecklistItem[] = [
    {
      key: "pending_expenses",
      label: "Tasdiqlanmagan xarajatlar",
      ok: pendingExpenses === 0,
      blocking: true,
      count: pendingExpenses,
    },
    {
      key: "pending_payroll",
      label: "Tasdiqlanmagan oylik tuzatmalari",
      ok: pendingPayroll === 0,
      blocking: true,
      count: pendingPayroll,
    },
    {
      key: "pending_kpi",
      label: "Ko'rib chiqilmagan KPI yozuvlari (draft/submitted)",
      ok: pendingKpi === 0,
      blocking: true,
      count: pendingKpi,
    },
    {
      key: "pending_kassa",
      label: "Kassa yozuvlari (yaratilishda yakuniy — pending holat yo'q)",
      ok: true,
      blocking: true,
      count: 0,
    },
    {
      key: "ledger_balanced",
      label: "Ledger debit == credit (davr)",
      ok: trial.balanced,
      blocking: true,
      detail: trial.balanced ? undefined : `debit ${trial.totalDebit} != credit ${trial.totalCredit}`,
    },
    {
      key: "negative_cash",
      label: "Kassa qoldig'i manfiy emas",
      ok: cashBalance >= 0,
      blocking: true,
      detail: cashBalance < 0 ? `CASH = ${cashBalance}` : undefined,
    },
    {
      key: "ledger_integrity",
      label: "Ledger ↔ manba mosligi (dublikat/orphan yo'q)",
      ok: integrityErrors.length === 0,
      blocking: true,
      count: integrityErrors.length,
      detail: integrityErrors.slice(0, 5).join("; ") || undefined,
    },
    {
      // ENDI BLOKLAYDI. Ilgari bloklamasdi: import yo'llari jurnalga yozmagani
      // uchun tafovut 683 mln edi va bloklovchi qilinsa oy umuman yopilmasdi.
      // `scripts/backfill-ledger.ts` 157 ta qatorni tikladi, tafovut 2 mln ga
      // tushdi — u qabul qilingan qoldiq va sababi `LEDGER_DRIFT_TOLERANCE`
      // izohida yozilgan.
      key: "ledger_source_balance_match",
      label: "Kassa balansi ↔ Ledger balansi mosligi",
      ok: balanceDiff <= LEDGER_DRIFT_TOLERANCE,
      blocking: true,
      detail:
        balanceDiff > LEDGER_DRIFT_TOLERANCE
          ? `Kassa = ${closeFigures.closingBalance}, Ledger = ${closeFigures.ledgerBalance} ` +
            `(farq: ${closeFigures.closingBalance - closeFigures.ledgerBalance}, ruxsat: ${LEDGER_DRIFT_TOLERANCE})`
          : undefined,
    },
    // OGOHLANTIRISHLAR — buxgalteriya jihatdan yopishni bloklamaydi:
    // ochiq debitorka (mijoz to'lamagan) va keyin to'lanadigan oylik normal holat.
    {
      key: "pending_payments",
      label: "Mijoz to'lovlari 'pending' holatda (debitorka — ogohlantirish)",
      ok: pendingPayments === 0,
      blocking: false,
      count: pendingPayments,
    },
    {
      key: "unpaid_obligations",
      label: "To'lanmagan oylik majburiyati (keyingi oyda to'lanishi mumkin)",
      ok: unpaid <= 0,
      blocking: false,
      detail: unpaid > 0 ? `${unpaid} so'm to'lanmagan` : undefined,
    },
  ];

  const blockingErrors = items
    .filter((i) => i.blocking && !i.ok)
    .map((i) => `${i.label}${i.count ? ` (${i.count} ta)` : ""}${i.detail ? `: ${i.detail}` : ""}`);

  return { items, ready: blockingErrors.length === 0, blockingErrors };
}

/**
 * Checklist natijasiga ko'ra statusni avtomatik boshqaradi:
 * yashil bo'lsa OPEN → READY_TO_CLOSE, qizil bo'lsa READY_TO_CLOSE → OPEN.
 * LOCKED/CLOSING/REOPENED/FAILED holatlariga tegmaydi.
 */
export async function autoManageReadiness(
  db: Db,
  year: number,
  month: number
): Promise<{ checklist: ChecklistResult; status: string }> {
  const period = await ensureGlobalPeriod(db, year, month);
  const checklist = await gatherChecklist(db, year, month);

  let status = period.status;
  if (checklist.ready && period.status === PERIOD_STATUS.OPEN) {
    status = PERIOD_STATUS.READY_TO_CLOSE;
    await db.accountingPeriod.update({
      where: { id: period.id },
      data: { status, statusNote: "checklist yashil — yopishga tayyor" },
    });
  } else if (!checklist.ready && period.status === PERIOD_STATUS.READY_TO_CLOSE) {
    status = PERIOD_STATUS.OPEN;
    await db.accountingPeriod.update({
      where: { id: period.id },
      data: { status, statusNote: checklist.blockingErrors[0] ?? null },
    });
  }
  return { checklist, status };
}

export interface CloseFigures {
  key: string;
  openingBalance: number;
  income: number;
  outflow: number;
  profit: number; // max(0, net)
  loss: number; // max(0, -net)
  closingBalance: number;
  payrollTotal: number;
  cashIn: number;
  cashOut: number;
  ledgerBalance: number;
  employeeCount: number;
  companyCount: number;
  /**
   * Moliyaviy yordam (qarz) — HAQIQIY pul, lekin P&L emas (aktiv/passiv
   * qayta tasnifi). `closingBalance` ga kiradi, `income`/`outflow`/
   * `profit`/`loss` ga EMAS — aks holda qarz qaytishi soxta tushum bo'lib
   * ko'rinardi. `lib/balance.ts` loanCashMovement izohiga qarang.
   */
  loanCashMovement: number;
}

/**
 * Yopilish raqamlari (STEP 4-8):
 *   Opening  — o'tgan oy VALID snapshot'ining closing'i, bo'lmasa butun tarixdan;
 *   Income/Expense — oy harakati; Closing = Opening + Income − Expense.
 */
export async function computeCloseFigures(db: Db, year: number, month: number): Promise<CloseFigures> {
  const key = monthKey(year, month);
  const prev = prevOf(year, month);
  const prevKey = monthKey(prev.year, prev.month);

  const prevSnapshot = await db.financialSnapshot.findFirst({
    where: { companyId: null, period: prevKey, isValid: true },
  });
  const openingBalance = prevSnapshot
    ? Number(prevSnapshot.closingBalance)
    : await getMovementBeforeMonth(year, month, db).then((m) => m.income - m.outflow + m.loanCashMovement);

  const movement = await getMonthMovement(year, month, db);

  const [cashAgg, employeeCount, companyCount, ledgerBalance] = await Promise.all([
    db.ledgerEntry.aggregate({
      where: { period: key, accountId: ACCOUNTS.CASH },
      _sum: { debit: true, credit: true },
    }),
    db.user.count({ where: { isActive: true } }),
    db.company.count({ where: { isActive: true } }),
    getLedgerCashBalance(db, key),
  ]);

  // DIQQAT: `net` (foyda/zarar, P&L) moliyaviy yordamni O'Z ICHIGA OLMAYDI —
  // u xarajat ham, daromad ham emas. `closingBalance` (haqiqiy pul qoldig'i)
  // esa oladi, aks holda jurnal `ledgerBalance` bilan solishtirilganda
  // (`ledger_source_balance_match` checklist bandi) SOXTA farq chiqardi
  // (auditda topildi, 2026-09-03: avgust uchun 65 mln).
  const net = movement.income - movement.outflow;
  return {
    key,
    openingBalance,
    income: movement.income,
    outflow: movement.outflow,
    profit: Math.max(0, net),
    loss: Math.max(0, -net),
    closingBalance: openingBalance + net + movement.loanCashMovement,
    payrollTotal: 0, // quyida to'ldiriladi (payout aggregate)
    cashIn: Number(cashAgg._sum.debit ?? 0),
    cashOut: Number(cashAgg._sum.credit ?? 0),
    ledgerBalance,
    employeeCount,
    companyCount,
    loanCashMovement: movement.loanCashMovement,
  };
}

/** Oy ichida real berilgan oyliklar (Payout) yig'indisi. */
export async function getMonthPayrollTotal(db: Db, year: number, month: number): Promise<number> {
  const agg = await db.payout.aggregate({
    where: { deletedAt: null, month: monthKey(year, month) },
    _sum: { amount: true },
  });
  return Number(agg._sum.amount ?? 0);
}
