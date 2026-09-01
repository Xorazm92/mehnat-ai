/**
 * TA'SISCHIGA TAQSIMOTNI OPERATSION XARAJATDAN AJRATISH.
 *
 *   npx tsx scripts/reclassify-owner-distribution.ts            # ko'rsatadi
 *   npx tsx scripts/reclassify-owner-distribution.ts --apply
 *
 * MUAMMO. "Otabek akaga" toifasi bilan chiqqan pul jurnalda
 * `OPERATING_EXPENSE` ga tushgan. Avgustda bu 321 508 320 so'm — korxona
 * shuncha zarar ko'rgandek ko'rinadi, holbuki biznes qaroriga ko'ra
 * (2026-09-01) bu FOYDA TAQSIMOTI: pul tizimdan chiqqan, lekin xarajat emas.
 *
 * NEGA TESKARI YOZUV EMAS. Jurnal APPEND-ONLY va `reverseKassaMovement`
 * KassaEntry'ni yumshoq o'chiradi — ya'ni chiqimni bekor qilib, keyin qayta
 * yozish kerak bo'lardi. Bunda pul harakati tarixida sun'iy "o'chirildi va
 * qayta yozildi" izi qolardi, holbuki PUL HARAKATI TO'G'RI edi — faqat
 * qarama-qarshi hisob noto'g'ri tanlangan.
 *
 * Shuning uchun buxgalteriyaning standart yo'li: QAYTA TASNIFLASH
 * PROVODKASI — davr kesimida bitta yozuv,
 *
 *     Dt OWNER_DISTRIBUTION   Kt OPERATING_EXPENSE
 *
 * CASH oyog'iga TEGILMAYDI: pul haqiqatan chiqqan, balans o'zgarmaydi.
 * Kassa yozuvlari ham o'z joyida qoladi.
 *
 * Idempotent: har davr uchun `sourceTable = "Reclass"`,
 * `sourceId = "owner-distribution:<davr>"` — ikkinchi marta yozilmaydi.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { formatNum as som } from "@/lib/platform/format";
import { ACCOUNTS, postLedger } from "@/lib/ledger";
import { isOwnerDistribution } from "@/lib/expenseAccount";
import { periodKeyOf } from "@/lib/periods";

const apply = process.argv.includes("--apply");
const SOURCE_TABLE = "Reclass";
const sourceIdFor = (period: string) => `owner-distribution:${period}`;

async function main(): Promise<void> {
  // Toifani KENG olamiz va sof qoida bilan filtrlaymiz — SQL'da regexni
  // takrorlash ikkinchi haqiqat manbasini yaratardi.
  const rows = await prisma.kassaEntry.findMany({
    where: { type: "expense", deletedAt: null },
    select: { id: true, category: true, amount: true, date: true },
  });
  const hits = rows.filter((r) => isOwnerDistribution(r.category));

  if (!hits.length) {
    console.log("Ta'sischiga taqsimot toifasidagi yozuv topilmadi.");
    return;
  }

  const byPeriod = new Map<string, { count: number; sum: number }>();
  for (const r of hits) {
    const key = periodKeyOf(r.date);
    const e = byPeriod.get(key) ?? { count: 0, sum: 0 };
    e.count++;
    e.sum += Number(r.amount);
    byPeriod.set(key, e);
  }

  console.log(`\nTa'sischiga taqsimot — ${hits.length} yozuv:\n`);
  let total = 0;
  for (const [period, e] of [...byPeriod].sort()) {
    const already = await prisma.ledgerEntry.count({
      where: { sourceTable: SOURCE_TABLE, sourceId: sourceIdFor(period) },
    });
    console.log(
      `  ${period}  ${String(e.count).padStart(3)} yozuv  ${som(e.sum).padStart(16)}` +
        (already ? "   (allaqachon tasniflangan)" : "")
    );
    total += e.sum;
  }
  console.log(`  ${"JAMI".padEnd(5)} ${String(hits.length).padStart(3)} yozuv  ${som(total).padStart(16)}\n`);

  if (!apply) {
    console.log("Hech narsa o'zgarmadi. Yozish uchun: --apply");
    return;
  }

  let posted = 0;
  for (const [period, e] of [...byPeriod].sort()) {
    const already = await prisma.ledgerEntry.count({
      where: { sourceTable: SOURCE_TABLE, sourceId: sourceIdFor(period) },
    });
    if (already) continue;

    await postLedger(prisma as never, {
      period,
      sourceTable: SOURCE_TABLE,
      sourceId: sourceIdFor(period),
      description: `Ta'sischiga taqsimot operatsion xarajatdan ajratildi (${e.count} yozuv)`,
      legs: [
        { accountId: ACCOUNTS.OWNER_DISTRIBUTION, debit: e.sum },
        { accountId: ACCOUNTS.OPERATING_EXPENSE, credit: e.sum },
      ],
    });
    posted++;
    console.log(`  ✓ ${period} — ${som(e.sum)} qayta tasniflandi`);
  }

  console.log(`\n${posted} ta davr uchun provodka yozildi.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
