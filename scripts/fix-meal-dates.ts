/**
 * XO'JALIK XARAJATLARINING NOTO'G'RI SANASINI KO'CHIRISH.
 *
 *   npx tsx scripts/fix-meal-dates.ts --from=2026-12 --to=2026-01
 *   npx tsx scripts/fix-meal-dates.ts --from=2026-12 --to=2026-01 --apply
 *
 * MUAMMO. "FinCo Obed harajatlar" faylida "Январь 2026" deb nomlangan
 * varaqning ustun sarlavhalari 2026-DEKABR ni ko'rsatadi (Excel serial
 * 46361 = 2026-12-05). Parser to'g'ri o'qigan — xato FAYLDA. Natijada 39 ta
 * yozuv (1 221 000 so'm) kelajak davriga tushgan: joriy oy hisobotida
 * ko'rinmaydi, keyin o'sha oy kelganda yo'qdan paydo bo'ladi.
 *
 * Varaq nomi ishonchli manba (qolgan 13 varaqda nom va sana mos keladi),
 * shuning uchun KUN saqlanadi, faqat oy/yil ko'chiriladi:
 * 2026-12-05 → 2026-01-05.
 *
 * QANDAY KO'CHIRILADI. Jurnal APPEND-ONLY va sanani joyida o'zgartirib
 * bo'lmaydi — yozuv boshqa DAVRGA tegishli bo'lib qoladi, jurnal qatori esa
 * eski davrda qolardi. Shuning uchun: eski yozuv bekor qilinadi
 * (`reverseKassaMovement` — yumshoq o'chirish + jurnal teskarisi), o'rniga
 * to'g'ri sana bilan yangisi yoziladi.
 *
 * `description` ichidagi barqaror kalit ham ko'chiriladi
 * ("obed:2026-12-05:Taksi" → "obed:2026-01-05:Taksi"), aks holda fayl
 * tuzatilib qayta import qilinganda dublikat paydo bo'lardi.
 */
import "./load-env"; // birinchi bo'lishi shart
import { prisma } from "@/lib/prisma";
import { formatNum as som } from "@/lib/platform/format";
import { recordKassaMovement, reverseKassaMovement, runCashTx } from "@/lib/cashGate";
import { ACCOUNTS } from "@/lib/ledger";
import { expenseAccountFor } from "@/lib/expenseAccount";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const apply = process.argv.includes("--apply");
const fromKey = arg("from");
const toKey = arg("to");
const actor = { kind: "script" as const, name: "fix-meal-dates" };

if (!fromKey || !toKey || !/^\d{4}-\d{2}$/.test(fromKey) || !/^\d{4}-\d{2}$/.test(toKey)) {
  console.error("Ishlatish: --from=2026-12 --to=2026-01 [--apply]");
  process.exit(1);
}

const [fy, fm] = fromKey.split("-").map(Number);
const [ty, tm] = toKey.split("-").map(Number);
const from = new Date(Date.UTC(fy, fm - 1, 1));
const to = new Date(Date.UTC(fy, fm, 1));

/** Kun saqlanadi, oy/yil almashadi. */
function shift(d: Date): Date {
  return new Date(Date.UTC(ty, tm - 1, d.getUTCDate()));
}

async function main(): Promise<void> {
  const rows = await prisma.kassaEntry.findMany({
    where: {
      type: "expense",
      deletedAt: null,
      date: { gte: from, lt: to },
      description: { startsWith: "obed:" },
    },
    select: { id: true, date: true, amount: true, category: true, description: true, channelId: true },
    orderBy: { date: "asc" },
  });

  if (!rows.length) {
    console.log(`${fromKey} davrida "obed:" yozuvi topilmadi — ko'chiriladigan narsa yo'q.`);
    return;
  }

  const sum = rows.reduce((s, r) => s + Number(r.amount), 0);
  console.log(`\n${fromKey} → ${toKey}\n`);
  console.log(`  Yozuvlar: ${rows.length} ta · ${som(sum)}`);
  console.log(
    `  Sana    : ${rows[0].date.toISOString().slice(0, 10)} … ${rows[rows.length - 1].date.toISOString().slice(0, 10)}` +
      `  →  ${shift(rows[0].date).toISOString().slice(0, 10)} … ${shift(rows[rows.length - 1].date).toISOString().slice(0, 10)}`
  );

  // Kun oyga sig'adimi (masalan 31-kun fevralga ko'chirilmaydi).
  const bad = rows.filter((r) => shift(r.date).getUTCMonth() + 1 !== tm);
  if (bad.length) {
    console.error(`\n  ✗ ${bad.length} ta yozuvning kuni ${toKey} oyiga sig'maydi — ko'chirilmaydi.`);
    process.exit(1);
  }

  if (!apply) {
    console.log("\n  DRY-RUN — hech narsa o'zgarmadi. Ko'chirish uchun: --apply");
    return;
  }

  let moved = 0;
  for (const r of rows) {
    const newDate = shift(r.date);
    const newDescription = (r.description ?? "").replace(
      `obed:${r.date.toISOString().slice(0, 10)}:`,
      `obed:${newDate.toISOString().slice(0, 10)}:`
    );

    await runCashTx((db) =>
      reverseKassaMovement(db, actor, {
        kassaEntryId: r.id,
        reason: `Sana xato edi (${fromKey}) — varaq nomi bo'yicha ${toKey} ga ko'chirildi`,
      })
    );

    await runCashTx((db) =>
      recordKassaMovement(db, actor, {
        type: "expense",
        category: r.category,
        amount: Number(r.amount),
        date: newDate,
        description: newDescription,
        channelId: r.channelId,
        expenseAccount: ACCOUNTS[expenseAccountFor(r.category)],
      })
    );
    moved++;
  }

  console.log(`\n  ✓ ${moved} ta yozuv ${toKey} ga ko'chirildi.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
