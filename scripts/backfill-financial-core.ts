/**
 * Financial core v2 backfill — IDEMPOTENT, necha marta yursa ham xavfsiz.
 *
 * 1) PAYOUT: tasdiqlangan 'payment'/'avans' PayrollAdjustment qatorlari uchun
 *    real to'lov (Payout) yozuvi yaratiladi (tarixiy davomiylik: balans o'sha-o'sha
 *    qoladi — ilgari bu qatorlar chiqim edi, endi ularning payout-lari chiqim).
 * 2) LEDGER: mavjud pul harakatlari (paid Payment, KassaEntry, approved Expense,
 *    Payout) uchun double-entry yozuvlar yaratiladi — har manba uchun bir marta.
 * 3) REKONSILIATSIYA: ledger CASH qoldig'i va agregat balans solishtiriladi.
 *
 * Ishga tushirish: npx tsx scripts/backfill-financial-core.ts
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { periodKeyOf } from "@/lib/periods";
import { ACCOUNTS, postLedger, getLedgerCashBalance, getTrialBalance } from "@/lib/ledger";
import { adjustmentMagnitude } from "@/lib/adjustments";
import { getAvailableBalance } from "@/lib/balance";


async function backfillPayouts(): Promise<number> {
  const adjustments = await prisma.payrollAdjustment.findMany({
    where: {
      isApproved: true,
      deletedAt: null,
      adjustmentType: { in: ["payment", "avans"] },
    },
  });

  let created = 0;
  for (const adj of adjustments) {
    const exists = await prisma.payout.findFirst({
      where: { adjustmentId: adj.id },
      select: { id: true },
    });
    if (exists) continue;

    const amount = adjustmentMagnitude(adj.amount);
    if (amount <= 0) continue;

    await prisma.payout.create({
      data: {
        employeeId: adj.employeeId,
        adjustmentId: adj.id,
        month: adj.month.slice(0, 7),
        amount,
        paymentMethod: "naqd",
        note: `migratsiya: tasdiqlangan ${adj.adjustmentType} (${adj.reason})`.slice(0, 500),
        paidAt: adj.approvedAt ?? adj.createdAt,
        createdBy: adj.approvedBy ?? adj.createdBy,
        createdAt: adj.approvedAt ?? adj.createdAt,
      },
    });
    created++;
  }
  return created;
}

async function hasLedger(sourceTable: string, sourceId: string): Promise<boolean> {
  const row = await prisma.ledgerEntry.findFirst({
    where: { sourceTable, sourceId },
    select: { id: true },
  });
  return !!row;
}

async function backfillLedger(): Promise<Record<string, number>> {
  const counts: Record<string, number> = { Payment: 0, KassaEntry: 0, Expense: 0, Payout: 0 };

  // Shartnoma to'lovlari (faqat 'paid')
  const payments = await prisma.payment.findMany({ where: { status: "paid", deletedAt: null } });
  for (const p of payments) {
    const amount = Number(p.amount);
    if (amount <= 0 || (await hasLedger("Payment", p.id))) continue;
    await postLedger(prisma, {
      legs: [
        { accountId: ACCOUNTS.CASH, debit: amount },
        { accountId: ACCOUNTS.CONTRACT_INCOME, credit: amount },
      ],
      period: p.period,
      sourceTable: "Payment",
      sourceId: p.id,
      createdBy: p.createdBy,
      description: `migratsiya: shartnoma to'lovi (${p.period})`,
    });
    counts.Payment++;
  }

  // Kassa yozuvlari
  const kassa = await prisma.kassaEntry.findMany({ where: { deletedAt: null } });
  for (const k of kassa) {
    const amount = Number(k.amount);
    if (amount <= 0 || (await hasLedger("KassaEntry", k.id))) continue;
    await postLedger(prisma, {
      legs:
        k.type === "income"
          ? [
              { accountId: ACCOUNTS.CASH, debit: amount },
              { accountId: ACCOUNTS.KASSA_INCOME, credit: amount },
            ]
          : [
              { accountId: ACCOUNTS.OPERATING_EXPENSE, debit: amount },
              { accountId: ACCOUNTS.CASH, credit: amount },
            ],
      period: periodKeyOf(k.date),
      sourceTable: "KassaEntry",
      sourceId: k.id,
      createdBy: k.createdBy,
      description: `migratsiya: kassa ${k.type} (${k.category})`,
    });
    counts.KassaEntry++;
  }

  // `Expense` jadvali olib tashlandi (2026-09): u `KassaEntry` bilan bir xil
  // savolga javob berardi va prodda uch qatori ham yumshoq o'chirilgan edi.
  // Xarajat oyog'i yuqoridagi KassaEntry sikliga kiradi.

  // Payoutlar (1-bosqichda yaratilganlar ham)
  const payouts = await prisma.payout.findMany({ where: { deletedAt: null } });
  for (const p of payouts) {
    const amount = Number(p.amount);
    if (amount <= 0 || (await hasLedger("Payout", p.id))) continue;
    await postLedger(prisma, {
      legs: [
        { accountId: ACCOUNTS.SALARY_EXPENSE, debit: amount },
        { accountId: ACCOUNTS.CASH, credit: amount },
      ],
      period: p.month,
      sourceTable: "Payout",
      sourceId: p.id,
      createdBy: p.createdBy,
      description: `migratsiya: oylik to'lovi (${p.month})`,
    });
    counts.Payout++;
  }

  return counts;
}

async function main() {
  console.log("— Payout backfill...");
  const payoutsCreated = await backfillPayouts();
  console.log(`  yaratildi: ${payoutsCreated} payout`);

  console.log("— Ledger backfill...");
  const ledgerCounts = await backfillLedger();
  console.log(`  yozildi:`, ledgerCounts);

  console.log("— Rekonsiliatsiya...");
  const [trial, ledgerCash, balance] = await Promise.all([
    getTrialBalance(prisma),
    getLedgerCashBalance(prisma),
    getAvailableBalance(),
  ]);
  console.log(`  Trial balance: debit=${trial.totalDebit} credit=${trial.totalCredit} balanced=${trial.balanced}`);
  console.log(`  Ledger CASH qoldig'i : ${ledgerCash}`);
  console.log(`  Agregat balans       : ${balance.balance}`);
  if (!trial.balanced) throw new Error("XATO: ledger balanslashmagan!");
  if (Math.abs(ledgerCash - balance.balance) > 0.01) {
    console.warn(
      `  OGOHLANTIRISH: ledger CASH (${ledgerCash}) va agregat balans (${balance.balance}) farq qiladi — tekshirilsin`
    );
  } else {
    console.log("  ✓ Ledger va agregat balans mos");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
