/**
 * SOXTA KPI TARIXINI TOZALASH.
 *
 * `scripts/seed-kpi-history.ts` ilgari joriy oyning bahalarini `Math.random()`
 * bilan buzib, 5 ta o'tgan oyga `status='approved', source='system'` qilib
 * nusxalardi. Oylik hisobi aynan `approved` qatorlarni o'qiydi
 * (`lib/kpiLogic.ts`), ya'ni bu qatorlar haqiqiy bahodan farq qilmasdi.
 * Skript o'zi tuzatildi (draft + demo), lekin eski ishga tushirishlardan
 * qolgan qatorlar bazada turadi — bu yerda ular o'chiriladi.
 *
 * XAVFSIZLIK: hech narsani o'zi tanlab o'chirmaydi. Argumentsiz ishga
 * tushirilsa FAQAT hisobot chiqaradi; o'chirish uchun oylar aniq ko'rsatiladi.
 * O'chiriladigan qator SHARTLARI (uchalasi ham):
 *   source = 'system' | 'demo'   — inson yozgan qatorga tegilmaydi
 *   approvedBy IS NULL           — haqiqiy tasdiq har doim tasdiqlovchini yozadi
 *   month = ko'rsatilgan oylardan biri
 *
 * Ishlatish:
 *   npx tsx scripts/purge-demo-kpi-history.ts                       # hisobot
 *   npx tsx scripts/purge-demo-kpi-history.ts --months 2026-02-01,2026-03-01
 *   npx tsx scripts/purge-demo-kpi-history.ts --months ... --apply  # o'chirish
 */
import "./load-env"; // must be first: loads DATABASE_URL before Prisma is used
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const has = (name: string) => process.argv.includes(name);

function dbHost(): string {
  return (process.env.DATABASE_URL ?? "").match(/@([^:/?]+)/)?.[1] ?? "(noma'lum)";
}

async function main() {
  const months = (arg("--months") ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const apply = has("--apply");

  console.log(`Baza xosti: ${dbHost()}\n`);

  // Hisobot: har oy bo'yicha nima turibdi.
  const rows = await prisma.monthlyPerformance.groupBy({
    by: ["month", "source", "status"],
    _count: true,
    orderBy: [{ month: "asc" }],
  });
  console.log("Oy bo'yicha holat (month | source | status | soni):");
  for (const r of rows) {
    console.log(`  ${r.month} | ${r.source ?? "-"} | ${r.status} | ${r._count}`);
  }

  const suspectWhere: Prisma.MonthlyPerformanceWhereInput = {
    source: { in: ["system", "demo"] },
    status: "approved",
    approvedBy: null,
  };

  const suspects = await prisma.monthlyPerformance.groupBy({
    by: ["month"],
    where: suspectWhere,
    _count: true,
    orderBy: [{ month: "asc" }],
  });
  console.log("\nTasdiqlovchisi YO'Q avtomatik 'approved' qatorlar (nomzodlar):");
  for (const s of suspects) console.log(`  ${s.month} — ${s._count}`);

  if (months.length === 0) {
    console.log(
      "\nHech narsa o'chirilmadi. Oylarni aniq ko'rsating:\n" +
        "  npx tsx scripts/purge-demo-kpi-history.ts --months 2026-02-01,2026-03-01 [--apply]"
    );
    return;
  }

  const target: Prisma.MonthlyPerformanceWhereInput = { ...suspectWhere, month: { in: months } };
  const count = await prisma.monthlyPerformance.count({ where: target });
  console.log(`\nTanlangan oylar: ${months.join(", ")}\nMos keladigan qator: ${count}`);

  if (!apply) {
    console.log("DRY-RUN — o'chirish uchun --apply qo'shing.");
    return;
  }
  if (count === 0) {
    console.log("O'chiriladigan qator yo'q.");
    return;
  }

  const res = await prisma.monthlyPerformance.deleteMany({ where: target });
  console.log(`✅ O'chirildi: ${res.count} qator.`);
}

main()
  .catch((e) => {
    console.error("ERROR:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
