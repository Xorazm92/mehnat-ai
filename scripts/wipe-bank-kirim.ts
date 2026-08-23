/**
 * BANK KIRIM MA'LUMOTLARINI TOZALASH (re-baseline 1-bosqich)
 * ==========================================================
 *
 *   npx tsx scripts/wipe-bank-kirim.ts            # DRY-RUN — faqat hisobot
 *   npx tsx scripts/wipe-bank-kirim.ts --apply    # bajaradi
 *
 * MAQSAD. Prod 2026-08-01 da ishga tushirilganda vipiska ma'lumotlari yarim
 * import qilingan edi. Buning o'rniga 1C kesimlari (31.07 / 01.08) boshlang'ich
 * holat bo'ladi va foydalanuvchi BUGUNDAN boshlab toza vipiskalarni yuklaydi.
 * Shu sababli eski BANK kirim izlari olib tashlanadi:
 *
 *   · BankStatementImport (+ cascade BankTransaction) — vipiska yuklamalari
 *   · PaymentAllocation(source='bank')               — bank orqali tushumlar
 *   · ta'sir qilgan Payment qatorlari                — qolgan taqsimotlar
 *      yig'indisiga qayta hisoblanadi, jurnal izi reverse bilan moslanadi
 *   · TransitEntry.bankTransactionId                 — NULL ga o'tkaziladi
 *      (tranzit harakatlari O'ZIDA qoladi — karta qoldig'i tegmaydi)
 *
 * TEGMAYDIGANLAR: KassaEntry (naqd/plastik kirim-chiqim), Payout, Expense
 * navbati, tranzit kanallar qoldig'i — ya'ni CHIQIM tomon umuman tegmaydi.
 *
 * JURNAL QOIDASI (`lib/ledger.ts`): jurnal append-only — hech qanday LedgerEntry
 * o'chirilmaydi; har ta'sirlangan Payment uchun reverseLedger netto-nol yozadi,
 * so'ng qolgan (non-bank) taqsimotlar summasi bilan qayta post qilinadi.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { serializable } from "@/lib/tx";
import { ACCOUNTS, postLedger, reverseLedger } from "@/lib/ledger";
import { formatNum as som } from "@/lib/format";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  // ── 1. Nima bor — hisobot ──────────────────────────────────────────────
  const [imports, bankAllocs, otherAllocs] = await Promise.all([
    prisma.bankStatementImport.findMany({ select: { id: true, fileName: true, createdAt: true } }),
    prisma.paymentAllocation.findMany({
      where: { source: "bank" },
      select: { id: true, paymentId: true, amount: true },
    }),
    prisma.paymentAllocation.findMany({
      where: { source: { not: "bank" } },
      select: { source: true, amount: true },
    }),
  ]);

  const bankSum = bankAllocs.reduce((s, a) => s + Number(a.amount), 0);
  const affectedPaymentIds = [...new Set(bankAllocs.map((a) => a.paymentId))];

  const otherBySource = new Map<string, { count: number; sum: number }>();
  for (const a of otherAllocs) {
    const cur = otherBySource.get(a.source) ?? { count: 0, sum: 0 };
    cur.count += 1;
    cur.sum += Number(a.amount);
    otherBySource.set(a.source, cur);
  }

  console.log("═".repeat(72));
  console.log(apply ? "REJIM: --apply — o'zgartirish kiritiladi" : "REJIM: DRY-RUN — hech narsa o'chirilmaydi");
  console.log("═".repeat(72));
  console.log(`Vipiska yuklamalari      : ${imports.length} ta fayl`);
  for (const i of imports.slice(0, 5)) {
    console.log(`   · ${i.fileName ?? "(nomi yo'q)"} — ${i.createdAt.toISOString().slice(0, 10)}`);
  }
  if (imports.length > 5) console.log(`   … va yana ${imports.length - 5} ta`);
  console.log(`Bank taqsimotlari        : ${bankAllocs.length} ta / ${som(bankSum)} so'm`);
  const othersStr = [...otherBySource.entries()]
    .map(([src, v]) => `${src}:${v.count} ta/${som(v.sum)}`)
    .join(", ");
  console.log(`Qolgan taqsimotlar       : ${othersStr || "yo'q"} (TEGMAYDI)`);
  console.log(`Ta'sir etadigan Payment  : ${affectedPaymentIds.length} ta`);

  // Ta'sir etgan to'lovlarning holati — aralash (bank+plastik) qatorlar alohida.
  const payments = await prisma.payment.findMany({
    where: { id: { in: affectedPaymentIds } },
    select: {
      id: true, amount: true, status: true, companyId: true,
      _count: { select: { allocations: true } },
    },
  });
  const bankByPayment = new Map<string, number>();
  for (const a of bankAllocs) {
    bankByPayment.set(a.paymentId, (bankByPayment.get(a.paymentId) ?? 0) + Number(a.amount));
  }
  let pureBank = 0;
  let mixed = 0;
  for (const p of payments) {
    if ((p._count?.allocations ?? 0) > (bankByPayment.get(p.id) ? bankCountFor(bankAllocs, p.id) : 0)) mixed++;
    else pureBank++;
  }
  function bankCountFor(list: { paymentId: string }[], id: string) {
    return list.filter((a) => a.paymentId === id).length;
  }
  console.log(`   · faqat bankdan iborat : ${pureBank} ta (summa 0 ga tushadi)`);
  console.log(`   · aralash (plastik/naqd ham bor): ${mixed} ta (qolgan qism qayta post qilinadi)`);

  const transitLinked = await prisma.transitEntry.count({ where: { bankTransactionId: { not: null } } });
  console.log(`Tranzit bog'lanmalari    : ${transitLinked} ta (NULL ga o'tkaziladi, qatorlar qoladi)`);

  if (!apply) {
    console.log("\nDRY-RUN tugadi. Bajarish uchun: npx tsx scripts/wipe-bank-kirim.ts --apply");
    return;
  }

  // ── 2. Bajarish — BITTA serializable tranzaksiyada ─────────────────────
  await serializable(async (tx) => {
    // 2a. Har ta'sirlangan Payment: eski jurnal netto-nolga tushadi,
    //     qolgan taqsimotlar yig'indisi qayta post qilinadi.
    for (const paymentId of affectedPaymentIds) {
      const remainingRows = await tx.paymentAllocation.findMany({
        where: { paymentId, source: { not: "bank" } },
        select: { amount: true, channelId: true },
        orderBy: { amount: "desc" },
      });
      const remaining = remainingRows.reduce((s, r) => s + Number(r.amount), 0);

      await reverseLedger(tx, {
        sourceTable: "Payment",
        sourceId: paymentId,
        reason: "bank kirim re-baseline: eski vipiska izi bekor qilindi",
      });

      const pay = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { companyId: true, period: true, company: { select: { contractAmount: true } } },
      });
      if (!pay) continue;

      const due = Number(pay.company?.contractAmount ?? 0);
      const status = due > 0 && remaining >= due ? "paid" : remaining > 0 ? "partial" : "pending";
      await tx.payment.update({
        where: { id: paymentId },
        data: { amount: remaining, status },
      });

      // Kanal atributsiyasi: yagona CASH oyog'i eng KATTA qolgan taqsimot
      // kanaliga yoziladi (applyAllocation ham shunday qiladi).
      const channelId = remainingRows[0]?.channelId ?? null;
      if ((status === "paid" || status === "partial") && remaining > 0) {
        await postLedger(tx, {
          legs: [
            { accountId: ACCOUNTS.CASH, debit: remaining, channelId },
            { accountId: ACCOUNTS.CONTRACT_INCOME, credit: remaining, subjectId: pay.companyId },
          ],
          period: pay.period,
          sourceTable: "Payment",
          sourceId: paymentId,
          description: `Re-baseline: bank tashqari qolgan to'lov (${pay.period})`,
        });
      }
    }

    // 2b. Bank taqsimotlari — jismoniy o'chirish (jadvalda soft-delete yo'q;
    //     ular import artefakti va manbasi hozir o'chib ketayapti).
    const delAllocs = await tx.paymentAllocation.deleteMany({ where: { source: "bank" } });

    // 2c. Tranzit bog'lanmalarini uzamiz (qatorlarning O'ZI qoladi).
    const delTxs = await tx.bankTransaction.findMany({ select: { id: true } });
    const txIds = delTxs.map((t) => t.id);
    let nulledTransits = 0;
    for (let i = 0; i < txIds.length; i += 500) {
      const chunk = txIds.slice(i, i + 500);
      const res = await tx.transitEntry.updateMany({
        where: { bankTransactionId: { in: chunk } },
        data: { bankTransactionId: null },
      });
      nulledTransits += res.count;
    }

    // 2d. Vipiska yuklamalari — cascade BankTransaction'ni ham olib ketadi.
    const delImports = await tx.bankStatementImport.deleteMany({});

    console.log("\n✓ BAJARILDI:");
    console.log(`   Payment yangilandi     : ${affectedPaymentIds.length}`);
    console.log(`   Bank taqsimoti o'chdi  : ${delAllocs.count}`);
    console.log(`   Tranzit bog'landi uzildi: ${nulledTransits}`);
    console.log(`   Vipiska o'chdi         : ${delImports.count} ta yuklama (bank tx lar bilan)`);
  });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
