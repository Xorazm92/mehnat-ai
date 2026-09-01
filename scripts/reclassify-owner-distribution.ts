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

const apply = process.argv.includes("--apply");
const SOURCE_TABLE = "Reclass";
const sourceIdFor = (period: string) => `owner-distribution:${period}`;

/**
 * Shu davr allaqachon tasniflanganmi.
 *
 * QATORLAR SONI emas, SOF QOLDIQ tekshiriladi: jurnal append-only, ya'ni
 * bekor qilingan provodkaning qatorlari joyida qoladi va sanoq hech qachon
 * nolga qaytmaydi. Sanoq bilan tekshirilsa, xato provodka bekor qilingach
 * uni qayta yozib bo'lmasdi.
 */
async function alreadyReclassified(period: string): Promise<boolean> {
  // FAQAT `OWNER_DISTRIBUTION` oyog'i bo'yicha: provodka balanslangani uchun
  // uning BARCHA oyoqlari yig'indisi har doim nol bo'ladi va hech narsani
  // ayta olmaydi. Bekor qilinganda esa aynan shu oyoq nolga qaytadi.
  const legs = await prisma.ledgerEntry.findMany({
    where: {
      sourceTable: SOURCE_TABLE,
      sourceId: sourceIdFor(period),
      accountId: ACCOUNTS.OWNER_DISTRIBUTION,
    },
    select: { debit: true, credit: true },
  });
  const net = legs.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
  return Math.abs(net) >= 0.01;
}

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

  // MIQDOR JURNALDAN OLINADI, kassa yozuvidan EMAS.
  //
  // Sabab: yozuv qaysi hisobga tushgani import yo'liga bog'liq. Yangi
  // yozuvlar `lib/expenseAccount.ts` orqali DARHOL `OWNER_DISTRIBUTION` ga
  // tushadi (masalan `link-transit-expenses.ts`), eskilari esa
  // `OPERATING_EXPENSE` da qolgan. Agar summa toifadan hisoblansa, allaqachon
  // to'g'ri turgan yozuv IKKINCHI MARTA ko'chirilardi — iyulda bu 155 171 565
  // so'mlik soxta siljish bo'lardi.
  //
  // Shuning uchun faqat HAQIQATAN `OPERATING_EXPENSE` da turgan qism olinadi.
  // QAYSI HISOBDAN ko'chirish ham jurnaldan aniqlanadi. Eski import yo'llari
  // "Otabek akaga" ni MEHNAT HAQI deb yozgan (`link-transit-expenses.ts` ning
  // avvalgi tasnifi), yangilari esa operatsion xarajat deb. Har doim
  // `OPERATING_EXPENSE` dan chegirish o'sha hisobni MANFIYGA tushiradi —
  // lokal bazada aynan shunday bo'ldi (−32 185 731,58).
  const legs = await prisma.ledgerEntry.findMany({
    where: {
      sourceTable: "KassaEntry",
      sourceId: { in: hits.map((h) => h.id) },
      accountId: { in: [ACCOUNTS.OPERATING_EXPENSE, ACCOUNTS.SALARY_EXPENSE] },
    },
    select: { sourceId: true, accountId: true, debit: true, credit: true, period: true },
  });

  /** period → hisob → {count, sum} */
  const byPeriod = new Map<string, Map<string, { count: number; sum: number }>>();
  const seen = new Map<string, Set<string>>();
  for (const leg of legs) {
    if (!leg.sourceId) continue;
    const net = Number(leg.debit) - Number(leg.credit);
    if (net === 0) continue;
    const accounts = byPeriod.get(leg.period) ?? new Map();
    const e = accounts.get(leg.accountId) ?? { count: 0, sum: 0 };
    const key = `${leg.accountId}:${leg.sourceId}`;
    const ids = seen.get(leg.period) ?? new Set<string>();
    if (!ids.has(key)) {
      ids.add(key);
      e.count++;
    }
    e.sum += net;
    accounts.set(leg.accountId, e);
    byPeriod.set(leg.period, accounts);
    seen.set(leg.period, ids);
  }

  if (!byPeriod.size) {
    console.log(
      `Ta'sischiga taqsimot toifasida ${hits.length} yozuv bor, lekin hammasi ` +
        `allaqachon to'g'ri hisobda — ko'chiriladigan narsa yo'q.`
    );
    return;
  }

  console.log(`\nTa'sischiga taqsimot — ${hits.length} yozuv:\n`);
  let total = 0;
  for (const [period, accounts] of [...byPeriod].sort()) {
    const already = await alreadyReclassified(period);
    for (const [accountId, e] of accounts) {
      console.log(
        `  ${period}  ${accountId.padEnd(18)} ${String(e.count).padStart(3)} yozuv  ${som(e.sum).padStart(16)}` +
          (already ? "   (allaqachon tasniflangan)" : "")
      );
      total += e.sum;
    }
  }
  console.log(`  ${"JAMI".padEnd(28)} ${som(total).padStart(16)}\n`);

  if (!apply) {
    console.log("Hech narsa o'zgarmadi. Yozish uchun: --apply");
    return;
  }

  let posted = 0;
  for (const [period, accounts] of [...byPeriod].sort()) {
    if (await alreadyReclassified(period)) continue;

    const total = [...accounts.values()].reduce((s, e) => s + e.sum, 0);
    const count = [...accounts.values()].reduce((s, e) => s + e.count, 0);

    await postLedger(prisma as never, {
      period,
      sourceTable: SOURCE_TABLE,
      sourceId: sourceIdFor(period),
      description: `Ta'sischiga taqsimot xarajatdan ajratildi (${count} yozuv)`,
      legs: [
        { accountId: ACCOUNTS.OWNER_DISTRIBUTION, debit: total },
        // Har hisob O'ZI turgan summa qadar kreditlanadi — aks holda biri
        // manfiyga tushadi.
        ...[...accounts].map(([accountId, e]) => ({
          accountId: accountId as typeof ACCOUNTS.OPERATING_EXPENSE,
          credit: e.sum,
        })),
      ],
    });
    posted++;
    console.log(
      `  ✓ ${period} — ${som(total)} qayta tasniflandi ` +
        `(${[...accounts].map(([a, e]) => `${a} ${som(e.sum)}`).join(", ")})`
    );
  }

  console.log(`\n${posted} ta davr uchun provodka yozildi.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
