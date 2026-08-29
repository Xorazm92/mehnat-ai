/**
 * PAYOUT ↔ KARTA DAFTARI DUBLIKATINI YO'QOTISH
 * ============================================
 *
 *   npx tsx scripts/dedupe-payouts.ts            # DRY-RUN
 *   npx tsx scripts/dedupe-payouts.ts --apply
 *
 * REAL JARAYON (korxona tasviri): firma hisobi → o'zini-o'zi band shaxs
 * kartasi → u pulni boshqalarning plastigiga oylik qilib o'tkazadi,
 * ba'zida ta'sischiga beriladi ("Otabek akaga"). Bu harakat TRANZIT
 * DAFTRIDA yuritiladi va endi tizimda KassaEntry(expense) + jurnal
 * sifatida BIR MARTA yoziladi (`import-transit --with-expenses`).
 *
 * Muammo: ilgari shu daftar qatorlari /payroll ga ham nusxa ko'chirilgan
 * (har bir Payout izohida "Karta daftaridan: …" turibdi). Ikkala yozuv ham
 * balansdan ayirilgani uchun oylik IKKI MARTA sanalgan.
 *
 * YECHIM: daftar — birlamchi manba. "Karta daftaridan:" degan Payoutlar
 * soft-delete + reverse qilinadi. Kelajakda /payroll faqat kartadan
 * CHIQMAYDIGAN rasmiy xodim uchun ishlatiladi.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { serializable } from "@/lib/tx";
import { reverseLedger } from "@/lib/ledger";
import { formatNum as som } from "@/lib/platform/format";

const REASON = "dublikat: pul tranzit daftaridan KassaEntry sifatida yozilgan";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const rows = await prisma.payout.findMany({
    where: {
      deletedAt: null,
      note: { startsWith: "Karta daftaridan" },
    },
    select: { id: true, amount: true, paidAt: true, note: true },
    orderBy: { paidAt: "asc" },
  });
  const sum = rows.reduce((s, r) => s + Number(r.amount), 0);

  console.log("═".repeat(64));
  console.log(apply ? "REJIM: --apply" : "REJIM: DRY-RUN");
  console.log(`Daftar dublikati Payoutlar: ${rows.length} ta / ${som(sum)} so'm`);
  for (const r of rows.slice(0, 8)) {
    console.log(`   ${r.paidAt.toISOString().slice(0, 10)} ${som(Number(r.amount)).padStart(12)}  ${r.note?.slice(0, 40)}`);
  }
  if (rows.length > 8) console.log(`   … va yana ${rows.length - 8} ta`);
  if (!apply || rows.length === 0) {
    console.log("\nHech narsa o'zgarmadi.");
    return;
  }

  let done = 0;
  await serializable(async (tx) => {
    for (const r of rows) {
      const cur = await tx.payout.findUnique({ where: { id: r.id }, select: { deletedAt: true } });
      if (!cur || cur.deletedAt) continue;
      await tx.payout.update({
        where: { id: r.id },
        data: { deletedAt: new Date(), deleteReason: REASON },
      });
      await reverseLedger(tx, { sourceTable: "Payout", sourceId: r.id, reason: REASON });
      done++;
    }
  });
  console.log(`\n✓ ${done} ta dublikat Payout bekor qilindi (${som(sum)} so'm ikki hisobdan chiqdi)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
