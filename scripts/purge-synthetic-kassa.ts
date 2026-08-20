/**
 * SOXTA KASSA YOZUVLARINI OLIB TASHLASH (test + demo)
 * ===================================================
 *
 *   npx tsx scripts/purge-synthetic-kassa.ts            # nima o'chishini ko'rsatadi
 *   npx tsx scripts/purge-synthetic-kassa.ts --apply
 *
 * MUAMMO: lokal ishlab chiqish bazasida ikki xil sun'iy yozuv to'planib
 * qolgan va ular balansni butunlay buzib ko'rsatardi:
 *
 *   • `vitest-race-…`  — test poygasi yozuvlari (test izolyatsiyasi
 *     joriy qilinishidan oldin lokal bazaga tushgan);
 *   • `[demo] …`       — `seed-cashflow-demo.ts` namoyish ma'lumoti.
 *
 * Ikkalasi birgalikda ~1,2 mlrd so'mni tashkil qilardi, ya'ni ekrandagi
 * "kirim 1,25 mlrd" raqamining deyarli hammasi shular edi. Rahbar uni
 * korxonaning haqiqiy aylanmasi deb o'qir, holbuki bir oylik tushum
 * ~1 mlrd atrofida.
 *
 * O'CHIRISH — YUMSHOQ (`deletedAt`), jismoniy emas. Moliyaviy yozuv hech
 * qachon jadvaldan yo'qolmaydi (`financial-core-v2` qoidasi): kerak bo'lsa
 * qaytarish mumkin va nima o'chirilgani ko'rinib turadi. Balans va kassalar
 * jadvali `deletedAt: null` bo'yicha filtrlaydi, jurnal esa `reverseLedger`
 * bilan bekor qilinadi — ya'ni ikkala manba ham darhol tozalanadi.
 *
 * PRODGA TEGISHLI EMAS deb o'ylamang — avval `--apply`siz ishga tushiring.
 * Prod toza bo'lsa, u "0 ta topildi" deb chiqadi va hech narsa qilmaydi.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { formatNum as som } from "@/lib/format";
import { reverseLedger } from "@/lib/ledger";

/** Sun'iy yozuvning belgisi — `description` boshidagi barqaror prefiks. */
const MARKERS = [
  { label: "test poygasi (vitest)", startsWith: "vitest-race-" },
  { label: "namoyish seedi (demo)", startsWith: "[demo]" },
];

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const admin = await prisma.user.findFirst({
    where: { role: "super_admin", isActive: true },
    select: { id: true },
  });

  console.log();
  let grandCount = 0;
  let grandAmount = 0;

  for (const marker of MARKERS) {
    const rows = await prisma.kassaEntry.findMany({
      where: { deletedAt: null, description: { startsWith: marker.startsWith } },
      select: { id: true, type: true, amount: true, date: true, category: true },
    });

    const income = rows.filter((r) => r.type === "income").reduce((s, r) => s + Number(r.amount), 0);
    const expense = rows.filter((r) => r.type === "expense").reduce((s, r) => s + Number(r.amount), 0);

    console.log(`${marker.label} — "${marker.startsWith}…"`);
    console.log(`   yozuvlar : ${rows.length} ta`);
    console.log(`   kirim    : ${som(income)}`);
    console.log(`   chiqim   : ${som(expense)}`);
    console.log();

    grandCount += rows.length;
    grandAmount += income + expense;

    if (!apply || rows.length === 0) continue;

    for (const r of rows) {
      // Jurnal APPEND-ONLY: yozuv o'chirilmaydi, teskarisi yoziladi.
      await reverseLedger(prisma as never, {
        sourceTable: "KassaEntry",
        sourceId: r.id,
        createdBy: admin?.id ?? null,
        reason: `sun'iy yozuv olib tashlandi (${marker.label})`,
      });
      await prisma.kassaEntry.update({
        where: { id: r.id },
        data: {
          deletedAt: new Date(),
          deletedBy: admin?.id ?? null,
          deleteReason: `Sun'iy yozuv: ${marker.label}`,
        },
      });
    }
    console.log(`   ✓ ${rows.length} ta yozuv yumshoq o'chirildi va jurnali bekor qilindi\n`);
  }

  console.log("─".repeat(60));
  console.log(`Jami: ${grandCount} ta yozuv · ${som(grandAmount)} so'm`);
  if (!apply) console.log("\nHech narsa o'zgarmadi. O'chirish uchun: --apply");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
