// =====================================================
// OYLIKNI KASSA USULIDAN HISOBLASH (ACCRUAL) USULIGA O'TKAZISH
// =====================================================
//
// MUAMMO. Jurnalda oylik faqat TO'LOV paytida yozilardi:
//
//   SALARY_EXPENSE debet / CASH kredit
//
// Ya'ni P&L dagi oylik xarajati "shu oyda qancha to'landi" ni ko'rsatardi,
// "shu oyda qancha hisoblandi" ni emas. To'lov kechikkan oy arzon, ikki
// oylik birga to'langan oy qimmat chiqardi.
//
// YECHIM — ikki yozuv:
//
//   1) HISOBLASH   SALARY_EXPENSE   debet A / ACCRUED_SALARIES kredit A
//   2) QAYTA TASNIF ACCRUED_SALARIES debet P / SALARY_EXPENSE   kredit P
//
// bu yerda A — tabeldagi hisoblangan summa, P — o'sha davrda jurnalga
// tushgan to'lovlar. Natijada:
//
//   SALARY_EXPENSE   = A            (P&L da faqat hisoblangan summa)
//   ACCRUED_SALARIES = A − P        (to'lanmagan qoldiq; manfiy = ortiqcha to'langan)
//
// NEGA QATORLAR TAHRIRLANMAYDI. Jurnal append-only (`lib/ledger.ts`) —
// mavjud 257 qatorni o'zgartirish o'rniga bitta jamlovchi qayta tasnif
// yozuvi qo'yiladi. Tarix buzilmaydi, orqaga qaytarish `reverseLedger` bilan.
//
// TO'LOV OYOG'I O'ZGARMAYDI: `CASH` kredit qanday bo'lsa shundoq qoladi,
// faqat qarama-qarshi hisob `SALARY_EXPENSE` dan `ACCRUED_SALARIES` ga o'tadi.
//
//   npx tsx scripts/post-payroll-accrual.ts --period=2026-08 --amount=381309308
//   npx tsx scripts/post-payroll-accrual.ts --period=2026-08 --amount=381309308 --apply

import "./load-env";
import { prisma } from "@/lib/prisma";
import { ACCOUNTS, postLedger } from "@/lib/ledger";
import { formatNum as som } from "@/lib/platform/format";

const APPLY = process.argv.includes("--apply");
const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

const PERIOD = arg("period");
const AMOUNT = Number(arg("amount"));

/** Shu manba bo'yicha jurnalda yozuv bormi (skript idempotent bo'lsin). */
async function alreadyPosted(sourceId: string) {
  return (await prisma.ledgerEntry.count({ where: { sourceId } })) > 0;
}

async function netOf(accountId: string, period?: string) {
  const r = await prisma.ledgerEntry.aggregate({
    where: { accountId, ...(period ? { period } : {}) },
    _sum: { debit: true, credit: true },
  });
  return Number(r._sum.debit ?? 0) - Number(r._sum.credit ?? 0);
}

async function main() {
  if (!PERIOD || !/^\d{4}-\d{2}$/.test(PERIOD)) {
    throw new Error("--period=YYYY-MM ko'rsatilishi shart");
  }
  if (!Number.isFinite(AMOUNT) || AMOUNT <= 0) {
    throw new Error("--amount=<son> ko'rsatilishi shart (tabeldagi hisoblangan summa)");
  }

  const accrualSource = `accrual:payroll:${PERIOD}`;
  const reclassSource = `reclass:payroll-cash:${PERIOD}`;

  console.log(`\n=== Oylik accrual · ${PERIOD} ${APPLY ? "(APPLY)" : "(DRY-RUN)"} ===\n`);

  // To'langan summa — HISOBLASH YOZUVIDAN OLDIN o'lchanadi, aks holda
  // o'zimiz qo'shgan accrual ham "to'lov" bo'lib sanalardi.
  const paidBefore = await netOf(ACCOUNTS.SALARY_EXPENSE, PERIOD);

  console.log(`  hisoblangan (tabel) : ${som(AMOUNT)}`);
  console.log(`  jurnaldagi to'lovlar: ${som(paidBefore)}`);
  console.log(`  farq                : ${som(AMOUNT - paidBefore)}\n`);

  if (await alreadyPosted(accrualSource)) {
    console.log("  accrual allaqachon yozilgan — o'tkazildi");
  } else if (APPLY) {
    await postLedger(prisma, {
      legs: [
        { accountId: ACCOUNTS.SALARY_EXPENSE, debit: AMOUNT },
        { accountId: ACCOUNTS.ACCRUED_SALARIES, credit: AMOUNT },
      ],
      period: PERIOD,
      sourceTable: "PayrollAccrual",
      sourceId: accrualSource,
      description: `Hisoblangan oylik ${PERIOD} (tabel bo'yicha)`,
    });
    console.log(`  1) hisoblash yozildi: ${som(AMOUNT)}`);
  } else {
    console.log(`  1) hisoblash: SALARY_EXPENSE debet ${som(AMOUNT)} / ACCRUED_SALARIES kredit`);
  }

  if (await alreadyPosted(reclassSource)) {
    console.log("  qayta tasnif allaqachon yozilgan — o'tkazildi");
  } else if (paidBefore === 0) {
    console.log("  qayta tasnif shart emas: bu davrda to'lov yozuvi yo'q");
  } else if (APPLY) {
    await postLedger(prisma, {
      legs: [
        { accountId: ACCOUNTS.ACCRUED_SALARIES, debit: paidBefore },
        { accountId: ACCOUNTS.SALARY_EXPENSE, credit: paidBefore },
      ],
      period: PERIOD,
      sourceTable: "PayrollAccrual",
      sourceId: reclassSource,
      description: `To'langan oylik ${PERIOD} majburiyatga o'tkazildi (kassa → accrual)`,
    });
    console.log(`  2) qayta tasnif yozildi: ${som(paidBefore)}`);
  } else {
    console.log(`  2) qayta tasnif: ACCRUED_SALARIES debet ${som(paidBefore)} / SALARY_EXPENSE kredit`);
  }

  console.log(`\nNATIJA (${PERIOD}):`);
  console.log(`  SALARY_EXPENSE   ${som(await netOf(ACCOUNTS.SALARY_EXPENSE, PERIOD))}`);
  console.log(`  ACCRUED_SALARIES ${som(await netOf(ACCOUNTS.ACCRUED_SALARIES, PERIOD))}`);
  console.log(`\nJAMI (barcha davrlar):`);
  console.log(`  SALARY_EXPENSE   ${som(await netOf(ACCOUNTS.SALARY_EXPENSE))}`);
  console.log(`  ACCRUED_SALARIES ${som(await netOf(ACCOUNTS.ACCRUED_SALARIES))}`);

  if (!APPLY) console.log(`\nDRY-RUN — hech narsa yozilmadi. Bajarish: --apply`);
}

main()
  .catch((e) => { console.error(e.message ?? e); process.exit(1); })
  .finally(() => prisma.$disconnect());
