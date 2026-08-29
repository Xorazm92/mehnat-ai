/**
 * PRE-AVGUST TOZALASH — loyiha 2026-08-01 da ishga tushgan.
 * ==========================================================
 *
 *   npx tsx scripts/wipe-pre-august.ts            # DRY-RUN
 *   npx tsx scripts/wipe-pre-august.ts --apply
 *
 * ISHGA TUSHIRISHDAN OLDINGI DAVRLAR TIZIMDA YASHAMASLIGI KERAK: ular
 * balansni va P&L ni soxta ko'rsatadi. Bu skript faqat AVGUST va undan
 * keyingini qoldiradi:
 *
 *   A) KassaEntry(date < 2026-08-01)            — HAMMA turi (chiqim+kirim)
 *   B) KassaEntry(avgust, xarajat/kirim) dedupKey xls: EMAS VA bugun ertalab-
 *      dan oldin yaratilgani — o'chirilgan eski vipiskalar/importlardan
 *      qolgan bo'laklar. Daftar (xls:) va foydalanuvchining BUGUNGI qo'lda
 *      yozganlari qoladi.
 *   C) Payout(paidAt < 2026-08-01)
 *
 * JURNAL QOIDASI: hech narsa jismonan o'chmaydi — soft-delete +
 * reverseLedger bilan netto-nol (`lib/ledger.ts` append-only).
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { serializable } from "@/lib/tx";
import { reverseLedger } from "@/lib/ledger";
import { formatNum as som } from "@/lib/platform/format";

const AUGUST_START = new Date(2026, 7, 1);
/** Bugungi rebaseline'dan KEYINGI qo'lda yozuvlar qoladi. */
const KEEP_CREATED_AFTER = new Date("2026-08-23T09:00:00Z");
const REASON = "re-baseline: loyiha 2026-08-01 da ishga tushdi — eski davr tizimda yashamaydi";

interface Row { id: string }

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  // ── A: avgustdan oldingi HAMMA kassa yozuvi ────────────────────────────
  const preAugust = await prisma.kassaEntry.findMany({
    where: { deletedAt: null, date: { lt: AUGUST_START } },
    select: { id: true, amount: true, type: true },
  });
  const preSum = preAugust.reduce((s, r) => s + Number(r.amount), 0);

  // ── B: avgustdagi xls-bo'lmagan eski qatlamlar ─────────────────────────
  const augustJunk = await prisma.kassaEntry.findMany({
    where: {
      deletedAt: null,
      date: { gte: AUGUST_START },
      createdAt: { lt: KEEP_CREATED_AFTER },
      NOT: [{ dedupKey: { startsWith: "xls:" } }],
    },
    select: { id: true, amount: true, type: true, dedupKey: true },
  });
  const junkExp = augustJunk.filter((r) => r.type === "expense");
  const junkInc = augustJunk.filter((r) => r.type === "income");
  const junkSum = augustJunk.reduce((s, r) => s + Number(r.amount), 0);

  // ── C: avgustdan oldingi payoutlar ─────────────────────────────────────
  const oldPayouts = await prisma.payout.findMany({
    where: { deletedAt: null, paidAt: { lt: AUGUST_START } },
    select: { id: true, amount: true },
  });
  const payoutSum = oldPayouts.reduce((s, r) => s + Number(r.amount), 0);

  console.log("═".repeat(68));
  console.log(apply ? "REJIM: --apply" : "REJIM: DRY-RUN");
  console.log("═".repeat(68));
  console.log(`A) < 2026-08 kassa yozuvlari     : ${preAugust.length} ta / ${som(preSum)}`);
  console.log(`B) avgust eski qatlamlar         : ${augustJunk.length} ta / ${som(junkSum)}`);
  console.log(`      chiqim: ${junkExp.length} · kirim: ${junkInc.length}`);
  console.log(`C) < 2026-08 payoutlar           : ${oldPayouts.length} ta / ${som(payoutSum)}`);
  console.log(`JAMI chiqib ketadigan xarajat ta'siri ≈ ${som(preSum + junkExp.reduce((s,r)=>s+Number(r.amount),0))}`);

  if (!apply) {
    console.log("\nDRY-RUN tugadi. Bajarish: npx tsx scripts/wipe-pre-august.ts --apply");
    return;
  }

  let done = 0;
  const softDeleteKassa = async (rows: Row[]) => {
    await serializable(async (tx) => {
      for (const r of rows) {
        const existing = await tx.kassaEntry.findUnique({ where: { id: r.id }, select: { deletedAt: true } });
        if (!existing || existing.deletedAt) continue;
        await tx.kassaEntry.update({
          where: { id: r.id },
          data: { deletedAt: new Date(), deleteReason: REASON },
        });
        await reverseLedger(tx, {
          sourceTable: "KassaEntry",
          sourceId: r.id,
          reason: REASON,
        });
        done++;
      }
    });
  };

  await softDeleteKassa(preAugust);
  await softDeleteKassa(augustJunk);

  let payoutDone = 0;
  await serializable(async (tx) => {
    for (const p of oldPayouts) {
      const existing = await tx.payout.findUnique({ where: { id: p.id }, select: { deletedAt: true } });
      if (!existing || existing.deletedAt) continue;
      await tx.payout.update({
        where: { id: p.id },
        data: { deletedAt: new Date(), deleteReason: REASON },
      });
      await reverseLedger(tx, { sourceTable: "Payout", sourceId: p.id, reason: REASON });
      payoutDone++;
    }
  });

  console.log(`\n✓ KassaEntry tozalandi : ${done}`);
  console.log(`✓ Payout tozalandi     : ${payoutDone}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
