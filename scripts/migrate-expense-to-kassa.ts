// =====================================================
// `Expense` → `KassaEntry` KO'CHIRISH
// =====================================================
//
// Ikki jadval bitta savolga javob berardi ("pul chiqdi"). Tasdiq oqimi endi
// `KassaEntry` ning o'zida, shuning uchun `Expense` qatorlari ko'chiriladi va
// jadval keyinchalik (tekshirilgach) tashlanadi.
//
// TASDIQLANGAN qatorda jurnal izi ham ko'chiriladi: eski `sourceTable`
// "Expense" edi, yangisi "KassaEntry". Ko'chirish teskari yozuv + qayta post
// orqali — jurnal append-only, qator tahrirlanmaydi.
//
// Prodda 3 ta `pending` qator bor (63 mln) va NOLTA tasdiqlangan, ya'ni
// amalda faqat navbat ko'chadi. Skript baribir ikkala holatni ham qamraydi.
//
//   npx tsx scripts/migrate-expense-to-kassa.ts            # dry-run
//   npx tsx scripts/migrate-expense-to-kassa.ts --apply

import "./load-env";
import { prisma } from "@/lib/prisma";
import { formatNum as som } from "@/lib/platform/format";
import { periodKeyOf } from "@/lib/periods";
import { ACCOUNTS, postLedger, reverseLedger } from "@/lib/ledger";
import { serializable } from "@/lib/tx";

const APPLY = process.argv.includes("--apply");

async function main() {
  const rows = await prisma.expense.findMany({
    where: { deletedAt: null },
    orderBy: { date: "asc" },
  });

  const byStatus = new Map<string, { n: number; sum: number }>();
  for (const r of rows) {
    const c = byStatus.get(r.status) ?? { n: 0, sum: 0 };
    c.n++; c.sum += Number(r.amount); byStatus.set(r.status, c);
  }

  console.log("\n━━━ Expense → KassaEntry " + (APPLY ? "(APPLY)" : "(DRY-RUN)") + " ━━━━\n");
  if (rows.length === 0) {
    console.log("  Ko'chiriladigan qator yo'q.\n");
    return;
  }
  for (const [st, v] of byStatus) {
    console.log(`  ${st.padEnd(10)} ${String(v.n).padStart(4)} ta  ${som(v.sum)} so'm`);
  }

  // Allaqachon ko'chirilganini `dedupKey` bilan aniqlaymiz — qayta yurgizish
  // dublikat yaratmaydi.
  const already = await prisma.kassaEntry.findMany({
    where: { dedupKey: { in: rows.map((r) => `expense:${r.id}`) } },
    select: { dedupKey: true },
  });
  const done = new Set(already.map((a) => a.dedupKey));
  const todo = rows.filter((r) => !done.has(`expense:${r.id}`));
  console.log(`\n  Ko'chirilgan : ${done.size} ta`);
  console.log(`  Qoldi        : ${todo.length} ta\n`);

  if (!APPLY || todo.length === 0) {
    if (!APPLY) console.log("  DRY-RUN — hech narsa yozilmadi. Yozish uchun: --apply\n");
    return;
  }

  let moved = 0;
  for (const e of todo) {
    await serializable(async (db) => {
      const created = await db.kassaEntry.create({
        data: {
          type: "expense",
          category: e.category,
          amount: e.amount,
          date: e.date,
          description: e.description,
          channelId: e.channelId,
          createdBy: e.createdBy,
          status: e.status,
          approvedBy: e.approvedBy,
          approvedAt: e.approvedAt,
          rejectedReason: e.rejectedReason,
          dedupKey: `expense:${e.id}`,
        },
        select: { id: true },
      });

      // Tasdiqlangan bo'lsa jurnal izi ham ko'chadi: eskisi teskarilanadi,
      // yangisi yangi manba ostida yoziladi.
      if (e.status === "approved") {
        await reverseLedger(db, {
          sourceTable: "Expense",
          sourceId: e.id,
          reason: "KassaEntry ga ko'chirildi",
        });
        await postLedger(db, {
          legs: [
            { accountId: ACCOUNTS.OPERATING_EXPENSE, debit: Number(e.amount) },
            { accountId: ACCOUNTS.CASH, credit: Number(e.amount), channelId: e.channelId },
          ],
          period: periodKeyOf(e.date),
          sourceTable: "KassaEntry",
          sourceId: created.id,
          createdBy: e.createdBy,
          description: `Xarajat: ${e.category}`,
        });
      }

      // Manba qatori SOFT-DELETE qilinadi, jismonan o'chirilmaydi — jadval
      // tashlangunga qadar iz qolsin.
      await db.expense.update({
        where: { id: e.id },
        data: { deletedAt: new Date(), deleteReason: `KassaEntry ga ko'chirildi: ${created.id}` },
      });
      moved++;
    });
  }

  console.log(`  ✔ Ko'chirildi: ${moved} ta`);
  console.log("  `Expense` jadvali hali TASHLANMADI — tekshirilgach alohida migratsiyada.\n");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("✖", (e as Error).message);
    await prisma.$disconnect();
    process.exit(1);
  });
