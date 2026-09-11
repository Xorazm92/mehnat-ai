// =====================================================
// OYLIKNI BITTA UYGA — `KassaEntry` → `Payout` (Faza 4)
// =====================================================
//
//   npx tsx scripts/migrate-salary-to-payout.ts            # DRY-RUN
//   npx tsx scripts/migrate-salary-to-payout.ts --apply
//
// MUAMMO. Oylik ikki uyda yashaydi va `lib/balance.ts` ikkalasini ham
// sanaydi (`outflow = outflowKassa + outflowPayroll`). Prodda:
//
//   KassaEntry (oylik toifasi)   81 qator · 390 969 308   ← noto'g'ri uy
//   Payout (to'g'ri uy)           2 qator ·   2 235 490
//
// Tizim arxitekturasining javobi aniq: oylik `Payout` orqali beriladi.
// `lib/cashGate.ts` va `lib/salaryCategory.ts` endi `KassaEntry` ga oylik
// yozishni TAQIQLAYDI — qolgan qatorlar o'sha taqiqdan oldingi import
// qoldig'i.
//
// ── NEGA STORNO EMAS, QAYTA YO'NALTIRISH ─────────────────────────────
//
// Ikkala uyning JURNAL OYOQLARI AYNAN BIR XIL:
//
//   KassaEntry (postExpenseLegs)  SALARY_EXPENSE debet / CASH kredit
//   Payout     (createPayout)     SALARY_EXPENSE debet / CASH kredit
//
// Ya'ni buxgalteriya ta'siri o'zgarmaydi — faqat pul QAYSI JADVALDA
// yashashi o'zgaradi. Storno qilib qayta yozish har qator uchun to'rtta
// ortiqcha jurnal qatori yaratardi (81 x 4 = 324), netto ta'siri nol
// bo'lgan holda: jurnal o'qib bo'lmaydigan holga kelardi va har storno
// qarshi hisobni chalkashtirish uchun yana bitta imkoniyat bo'lardi.
//
// Shuning uchun mavjud jurnal qatorlari QAYTA YO'NALTIRILADI
// (`sourceTable`/`sourceId`), summalar esa umuman tegilmaydi. Ustiga
// `Payout` yo'li beradigan ikkita O'LCHOV qo'shiladi: `SALARY_EXPENSE`
// oyog'ida XODIM (`subjectId`) va `CASH` oyog'ida MANBA (`channelId`) —
// shundan keyin "qaysi kassadan qaysi xodimga" savoliga jurnalning o'zi
// javob beradi.
//
// ── CHEGARA ──────────────────────────────────────────────────────────
//
// FAQAT `KASSA_START_DATE` dan keyingi qatorlar. Undan oldingi davr
// 2026-08-23 da ATAYLAB tizimdan chiqarilgan ("re-baseline: loyiha
// 2026-08-01 da ishga tushdi") va balansga ta'sir qilmaydi — uni qayta
// tiriltirish o'sha qarorni bekor qilardi.
//
// Kanalida EGASI ko'rsatilmagan qator KO'CHIRILMAYDI: `Payout.employeeId`
// majburiy va uni taxmin qilib bo'lmaydi. Ular joyida qoladi va
// `npm run reconcile` ularni ko'rsatib turadi.

import "./load-env";
import { makePrisma } from "./_bootstrap";
import { isSalaryCategory } from "@/lib/salaryCategory";
import { KASSA_START_DATE, KASSA_START_PERIOD } from "@/lib/constants";
import { ACCOUNTS } from "@/lib/ledger";
import { PAYOUT_METHOD_BY_CHANNEL, normalizeChannelType } from "@/lib/transitChannels";
import { formatNum as som } from "@/lib/platform/format";

const REASON = `Oylik "bitta uy"ga ko'chirildi — Payout (Faza 4, ${KASSA_START_PERIOD})`;

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma, pool } = makePrisma();

  const candidates = await prisma.kassaEntry.findMany({
    where: { deletedAt: null, type: "expense", date: { gte: KASSA_START_DATE } },
    select: {
      id: true,
      amount: true,
      date: true,
      category: true,
      channelId: true,
      description: true,
      createdBy: true,
    },
    orderBy: { date: "asc" },
  });
  const rows = candidates.filter((e) => isSalaryCategory(e.category));

  const channels = await prisma.disbursementChannel.findMany({
    select: {
      id: true,
      label: true,
      type: true,
      employeeId: true,
      employee: { select: { fullName: true } },
    },
  });
  const chanBy = new Map(channels.map((c) => [c.id, c]));

  const movable = rows.filter((r) => r.channelId && chanBy.get(r.channelId)?.employeeId);
  const stuck = rows.filter((r) => !(r.channelId && chanBy.get(r.channelId)?.employeeId));
  const sum = (list: typeof rows) => list.reduce((s, r) => s + Number(r.amount), 0);

  console.log("=".repeat(70));
  console.log(`OYLIKNI BITTA UYGA: KassaEntry -> Payout  (${apply ? "--apply" : "DRY-RUN"})`);
  console.log("=".repeat(70));
  console.log(`Qamrov     : ${KASSA_START_PERIOD} dan beri (undan oldingi davr tizimdan chiqarilgan)`);
  console.log(`Nomzodlar  : ${rows.length} qator · ${som(sum(rows))} so'm`);
  console.log(`Ko'chadi   : ${movable.length} qator · ${som(sum(movable))} so'm`);
  console.log(`Qoladi     : ${stuck.length} qator · ${som(sum(stuck))} so'm (kanal egasi ko'rsatilmagan)`);

  if (stuck.length > 0) {
    const labels = new Set(
      stuck.map((r) => (r.channelId ? chanBy.get(r.channelId)?.label : null) ?? "(kanalsiz)")
    );
    console.log(`             kanallar: ${[...labels].join(" · ")}`);
  }

  // Xodim kesimi — ko'chirishdan oldin ko'rib chiqish uchun.
  const byEmp = new Map<string, { count: number; sum: number }>();
  for (const r of movable) {
    const name = chanBy.get(r.channelId!)!.employee!.fullName;
    const cur = byEmp.get(name) ?? { count: 0, sum: 0 };
    cur.count += 1;
    cur.sum += Number(r.amount);
    byEmp.set(name, cur);
  }
  console.log(`\n-- XODIM KESIMI — ${byEmp.size} ta ${"-".repeat(44)}`);
  for (const [name, v] of [...byEmp].sort((a, b) => b[1].sum - a[1].sum)) {
    console.log(`   ${name.padEnd(38)} ${String(v.count).padStart(3)} ta  ${som(v.sum).padStart(16)}`);
  }

  if (!apply) {
    console.log(`\n  DRY-RUN — hech narsa yozilmadi. Ko'chirish uchun: --apply`);
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  let moved = 0;
  let movedSum = 0;
  const failed: string[] = [];

  for (const r of movable) {
    const ch = chanBy.get(r.channelId!)!;
    const month = `${r.date.getUTCFullYear()}-${String(r.date.getUTCMonth() + 1).padStart(2, "0")}`;
    const kind = normalizeChannelType(ch.type);
    try {
      await prisma.$transaction(async (tx) => {
        const payout = await tx.payout.create({
          data: {
            employeeId: ch.employeeId!,
            month,
            amount: r.amount,
            paymentMethod: kind ? PAYOUT_METHOD_BY_CHANNEL[kind] : "naqd",
            channelId: r.channelId,
            note: r.description
              ? `${r.description} [ko'chirildi: KassaEntry ${r.id}]`
              : REASON,
            paidAt: r.date,
            createdBy: r.createdBy,
          },
          select: { id: true },
        });

        // Jurnal oyoqlari QAYTA YO'NALTIRILADI — summalar tegilmaydi.
        // Ustiga `Payout` yo'lining ikki o'lchovi qo'shiladi.
        await tx.ledgerEntry.updateMany({
          where: { sourceTable: "KassaEntry", sourceId: r.id, accountId: ACCOUNTS.SALARY_EXPENSE },
          data: {
            sourceTable: "Payout",
            sourceId: payout.id,
            subjectType: "user",
            subjectId: ch.employeeId,
          },
        });
        await tx.ledgerEntry.updateMany({
          where: { sourceTable: "KassaEntry", sourceId: r.id, accountId: ACCOUNTS.CASH },
          data: { sourceTable: "Payout", sourceId: payout.id, channelId: r.channelId },
        });

        await tx.kassaEntry.update({
          where: { id: r.id },
          data: { deletedAt: new Date(), deleteReason: `${REASON} -> Payout ${payout.id}` },
        });
      });
      moved++;
      movedSum += Number(r.amount);
    } catch (e) {
      failed.push(`${r.id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`\n${moved} qator ko'chirildi · ${som(movedSum)} so'm`);
  if (failed.length > 0) {
    console.log(`${failed.length} qator ko'chmadi:`);
    for (const f of failed.slice(0, 10)) console.log(`   ${f}`);
  }
  console.log(`\nKeyingi qadam: npm run reconcile — "Oylik faqat Payout orqali" tekshiruvi.`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error("XATO:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
