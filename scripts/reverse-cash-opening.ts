// =====================================================
// XATO KIRITILGAN CASH OCHILISH QOLDIG'INI BEKOR QILISH
// =====================================================
//
// NIMA BO'LGAN. 2026-09-01 da `CASH` hisobiga 544 727 918 so'mlik ochilish
// qoldig'i kiritildi. Raqam tashqaridan berilgan edi va TEKSHIRILMADI.
// Tekshirganda ikkita xato chiqdi:
//
//  1) HAJMI NOTO'G'RI. 01.08.2026 dagi haqiqiy pul:
//       bank hisoblari (10 ta vipiska ochilish qoldig'i)  36 185 406
//       naqd/karta daftari (iyul yakuni)                   2 728 855
//       ────────────────────────────────────────────────────────────
//                                                          38 914 261
//     Ya'ni berilgan raqam ~14 barobar katta.
//
//  2) IKKI MARTA SANALGAN. Ochilish qoldig'i ALLAQACHON tizimda edi:
//     01.08.2026 sanali, "Boshlang'ich qoldiq" toifasidagi 10 ta
//     `KassaEntry(income)` — jami aynan 36 185 406. Ular jurnalga ham
//     tushgan. Ustiga yana ochilish yozuvi qo'yilishi o'sha pulni ikki
//     marta sanaydi.
//
// Jurnal append-only, shuning uchun qator o'chirilmaydi — `reverseLedger`
// teskari yozuv qo'yadi va netto nolga tushadi.
//
// MUHIM: bu bekor qilingandan keyin balans YANA manfiy chiqadi. Bu to'g'ri
// natija — manfiylikning sababi ochilish qoldig'i emas, HISOBGA OLINMAGAN
// KIRIMLAR (81,5 mln `matched`, 42,3 mln `unmatched`, 135 mln `ignored`).
// Ularni Kirim navbatidan o'tkazish kerak.
//
//   npx tsx scripts/reverse-cash-opening.ts            # dry-run
//   npx tsx scripts/reverse-cash-opening.ts --apply

import "./load-env";
import { prisma } from "@/lib/prisma";
import { ACCOUNTS, reverseLedger } from "@/lib/ledger";
import { formatNum as som } from "@/lib/platform/format";

const APPLY = process.argv.includes("--apply");
const SOURCE_TABLE = "OpeningBalance";
const SOURCE_ID = "opening:cash:2026-08-01";

async function netOf(accountId: string) {
  const r = await prisma.ledgerEntry.aggregate({
    where: { accountId },
    _sum: { debit: true, credit: true },
  });
  return Number(r._sum.debit ?? 0) - Number(r._sum.credit ?? 0);
}

async function main() {
  console.log(`\n=== CASH ochilish qoldig'ini bekor qilish ${APPLY ? "(APPLY)" : "(DRY-RUN)"} ===\n`);

  const rows = await prisma.ledgerEntry.findMany({
    where: { sourceTable: SOURCE_TABLE, sourceId: SOURCE_ID },
    select: { accountId: true, debit: true, credit: true },
  });

  if (rows.length === 0) {
    console.log("Bekor qilinadigan yozuv topilmadi — allaqachon tozalangan.");
    return;
  }

  for (const r of rows) {
    console.log(`  ${r.accountId.padEnd(18)} debet ${som(Number(r.debit))} · kredit ${som(Number(r.credit))}`);
  }

  console.log(`\n  CASH oldin : ${som(await netOf(ACCOUNTS.CASH))}`);

  if (!APPLY) {
    console.log(`\nDRY-RUN — hech narsa yozilmadi. Bajarish: --apply`);
    return;
  }

  const txId = await reverseLedger(prisma, {
    sourceTable: SOURCE_TABLE,
    sourceId: SOURCE_ID,
    reason: "xato ochilish qoldig'i — haqiqiy qoldiq allaqachon 'Boshlang'ich qoldiq' kassa kirimlarida",
  });

  console.log(`  reversal: ${txId ?? "(netto allaqachon nol)"}`);
  console.log(`  CASH keyin : ${som(await netOf(ACCOUNTS.CASH))}`);
  console.log(`  OPENING_BALANCE: ${som(await netOf(ACCOUNTS.OPENING_BALANCE))}`);
}

main()
  .catch((e) => { console.error(e.message ?? e); process.exit(1); })
  .finally(() => prisma.$disconnect());
