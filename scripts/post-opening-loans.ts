// =====================================================
// OCHILISH QOLDIG'I — 01.08.2026 holatiga berilgan/olingan moliyaviy yordam
// =====================================================
//
// MUAMMO. Jurnal 2026-08 dan boshlanadi (`clean-start-2026-08`), biznes esa
// undan oldin ham ishlagan. Aprelda berilgan moliyaviy yordam avgustda
// QAYTGANDA jurnalga faqat qaytish oyog'i tushdi:
//
//   LOAN_GIVEN     debet  55 000 000  ·  kredit 125 000 000  →  netto −70 mln
//   LOAN_RECEIVED  debet   5 000 000  ·  kredit           0  →  juftsiz
//
// `LOAN_GIVEN` — AKTIV hisob; unda manfiy qoldiq bo'lishi mumkin emas.
//
// TASHXIS. Yozuvlar XATO EMAS — har biri vipiskadagi hujjat matniga aynan
// mos (quyida sanab o'tilgan). Yetishmayotgani — davr boshidagi qoldiq.
//
// DALIL (bank vipiskasidagi to'lov maqsadi):
//
//   06.08  chiqim   55 000 000  "оплата за фин помощь сог дог №1 от 24.04.2026"
//   20.08  kirim   100 000 000  "№1 от 24.04.2026г молиявий ёрдам кайтарилди"
//   20.08  kirim    25 000 000  "№1 от 15.04.2026г олинган молиявий ёрдам кайтарилди"
//   24.08  chiqim    5 000 000  "возврат фин.помощь сог дог №1 от 01.06.2026"
//
// Ya'ni 24.04 va 15.04 shartnomalari bo'yicha jami 125 mln APRELDA berilgan,
// 01.06 shartnomasi bo'yicha 5 mln IYUNDA olingan. Uchalasi ham jurnal
// boshlanishidan oldin sodir bo'lgan.
//
// YECHIM. O'sha uch qoldiqni `OPENING_BALANCE` ga qarshi kiritamiz. Bu hisob
// daromad ham, xarajat ham emas — foyda hisobiga tegmaydi. CASH oyog'i YO'Q:
// pul harakati avgustda emas, aprel/iyunda bo'lgan va u allaqachon o'sha
// davrning haqiqiy qoldig'ida aks etgan.
//
// NATIJA (kutilayotgan):
//   LOAN_GIVEN     netto  55 000 000  (06.08 da berilgan, hali qaytmagan)
//   LOAN_RECEIVED  netto           0  (iyunda olingan 5 mln avgustda qaytarildi)
//
//   npx tsx scripts/post-opening-loans.ts            # dry-run
//   npx tsx scripts/post-opening-loans.ts --apply

import "./load-env";
import { prisma } from "@/lib/prisma";
import { ACCOUNTS, postLedger } from "@/lib/ledger";
import { formatNum as som } from "@/lib/platform/format";

const APPLY = process.argv.includes("--apply");
const PERIOD = "2026-08";

/**
 * Har bir qoldiq alohida `sourceId` oladi — `postLedger` manba bo'yicha
 * dublikatni bloklaydi, ya'ni skriptni ikki marta yurgizish xavfsiz.
 */
const OPENINGS = [
  {
    sourceId: "opening:loan-given:khorezm-golden-building:2026-04-24",
    account: ACCOUNTS.LOAN_GIVEN,
    side: "debit" as const,
    amount: 100_000_000,
    description: 'Ochilish qoldig\'i 01.08.2026 — "Khorezm Golden Building" MCHJ, shartnoma №1 24.04.2026',
  },
  {
    sourceId: "opening:loan-given:khorezm-golden-building:2026-04-15",
    account: ACCOUNTS.LOAN_GIVEN,
    side: "debit" as const,
    amount: 25_000_000,
    description: 'Ochilish qoldig\'i 01.08.2026 — "Khorezm Golden Building" MCHJ, shartnoma №1 15.04.2026',
  },
  {
    sourceId: "opening:loan-received:shirin-super-taom:2026-06-01",
    account: ACCOUNTS.LOAN_RECEIVED,
    side: "credit" as const,
    amount: 5_000_000,
    description: 'Ochilish qoldig\'i 01.08.2026 — ООО "SHIRIN SUPER TAOM", shartnoma №1 01.06.2026',
  },
];

async function netOf(accountId: string) {
  const r = await prisma.ledgerEntry.aggregate({
    where: { accountId },
    _sum: { debit: true, credit: true },
  });
  return Number(r._sum.debit ?? 0) - Number(r._sum.credit ?? 0);
}

async function main() {
  console.log(`\n=== Ochilish qoldig'i ${APPLY ? "(APPLY)" : "(DRY-RUN)"} ===\n`);

  console.log("OLDIN:");
  console.log(`  LOAN_GIVEN    ${som(await netOf(ACCOUNTS.LOAN_GIVEN))}`);
  console.log(`  LOAN_RECEIVED ${som(await netOf(ACCOUNTS.LOAN_RECEIVED))}\n`);

  for (const o of OPENINGS) {
    const already = await prisma.ledgerEntry.count({ where: { sourceId: o.sourceId } });
    if (already > 0) {
      console.log(`  o'tkazildi (allaqachon bor): ${o.description}`);
      continue;
    }
    console.log(`  ${o.side === "debit" ? "+" : "-"}${som(o.amount)}  ${o.description}`);
    if (!APPLY) continue;

    await postLedger(prisma, {
      legs: [
        o.side === "debit"
          ? { accountId: o.account, debit: o.amount }
          : { accountId: o.account, credit: o.amount },
        o.side === "debit"
          ? { accountId: ACCOUNTS.OPENING_BALANCE, credit: o.amount }
          : { accountId: ACCOUNTS.OPENING_BALANCE, debit: o.amount },
      ],
      period: PERIOD,
      sourceTable: "OpeningBalance",
      sourceId: o.sourceId,
      description: o.description,
    });
  }

  console.log("\nKEYIN:");
  console.log(`  LOAN_GIVEN    ${som(await netOf(ACCOUNTS.LOAN_GIVEN))}`);
  console.log(`  LOAN_RECEIVED ${som(await netOf(ACCOUNTS.LOAN_RECEIVED))}`);
  console.log(`  OPENING_BALANCE ${som(await netOf(ACCOUNTS.OPENING_BALANCE))}`);

  if (!APPLY) console.log(`\nDRY-RUN — hech narsa yozilmadi. Bajarish: --apply`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
