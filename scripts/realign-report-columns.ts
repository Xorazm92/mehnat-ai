/**
 * QQS ↔ AYLANMA KATAKLARINI SOLIQ REJIMIGA MOSLASH.
 *
 * NEGA KERAK BO'LDI: "Aylanma/QQS" ustuni ikkiga bo'linganda ma'lumot o'sha
 * kundagi soliq rejimiga qarab ko'chirilgan edi. Keyin 119 ta firma
 * aylanmadan QQS ga o'tkazildi — va ularning O'SHA OYDA topshirilgan ishi
 * "Aylanma" ustunida qolib ketdi. Matritsa esa rejimga tegishli bo'lmagan
 * katakni yopadi, ya'ni buxgalter o'z ishini na ko'ra oladi, na ko'chira
 * oladi: QQS katagi bo'sh turadi, Aylanma katagi esa qulflangan.
 *
 * Skript aynan shu holatni tuzatadi va rejim keyin ham o'zgarsa qayta
 * ishlatiladi.
 *
 * SKRINSHOT DALILI HAM KO'CHADI (`ReportProof.colKey`) — busiz katak
 * ko'chgan bo'lardi-yu, unga biriktirilgan skrinshot eski kalitda qolib,
 * nazoratchi uchun yo'qolardi.
 *
 * ZIDDIYATGA TEGILMAYDI: ikkala ustun ham to'ldirilgan bo'lsa, qaysi biri
 * to'g'ri ekanini faqat odam biladi. Bunday qatorlar ro'yxatga chiqadi.
 *
 *   npx tsx scripts/realign-report-columns.ts            # quruq rejim
 *   npx tsx scripts/realign-report-columns.ts --apply
 */
import "./load-env";
import { prisma } from "@/lib/prisma";

/** (rejim, manba ustun) → maqsad ustun. Juftliklar mustaqil ko'chadi. */
const MOVES = [
  { regime: "vat", from: "aylanma", to: "qqs", fromKey: "aylanma", toKey: "qqs" },
  { regime: "vat", from: "aylanmaTolov", to: "qqsTolov", fromKey: "aylanma_tolov", toKey: "qqs_tolov" },
  { regime: "turnover", from: "qqs", to: "aylanma", fromKey: "qqs", toKey: "aylanma" },
  { regime: "turnover", from: "qqsTolov", to: "aylanmaTolov", fromKey: "qqs_tolov", toKey: "aylanma_tolov" },
] as const;

async function main() {
  const apply = process.argv.includes("--apply");
  let movedCells = 0;
  let movedProofs = 0;
  let conflicts = 0;

  for (const m of MOVES) {
    // 1) KATAKLAR — faqat maqsad ustun BO'SH bo'lganda.
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; name: string; period: string; val: string }>>(
      `SELECT m.id, c.name, m.period, m."${m.from}" AS val
         FROM "MonthlyReport" m JOIN "Company" c ON c.id = m."companyId"
        WHERE c."taxRegime" = $1 AND m."${m.from}" IS NOT NULL AND m."${m.to}" IS NULL`,
      m.regime,
    );
    const clash = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*) AS n FROM "MonthlyReport" m JOIN "Company" c ON c.id = m."companyId"
        WHERE c."taxRegime" = $1 AND m."${m.from}" IS NOT NULL AND m."${m.to}" IS NOT NULL`,
      m.regime,
    );
    const clashN = Number(clash[0]?.n ?? 0);
    conflicts += clashN;

    console.log(`\n${m.from} → ${m.to}  (rejim: ${m.regime})`);
    console.log(`  ko'chadi: ${rows.length}   ziddiyat (tegilmaydi): ${clashN}`);
    for (const r of rows.slice(0, 8)) console.log(`    ${r.period}  ${r.name}  = "${r.val}"`);
    if (rows.length > 8) console.log(`    … yana ${rows.length - 8} ta`);

    // 2) DALILLAR — maqsad kalitda dalil bo'lmasa.
    const proofs = await prisma.$queryRawUnsafe<Array<{ id: string; name: string; period: string }>>(
      `SELECT p.id, c.name, p.period
         FROM "ReportProof" p JOIN "Company" c ON c.id = p."companyId"
        WHERE c."taxRegime" = $1 AND p."colKey" = $2
          AND NOT EXISTS (
            SELECT 1 FROM "ReportProof" q
             WHERE q."companyId" = p."companyId" AND q.period = p.period AND q."colKey" = $3)`,
      m.regime, m.fromKey, m.toKey,
    );
    console.log(`  skrinshot ko'chadi: ${proofs.length}`);

    if (apply) {
      if (rows.length) {
        await prisma.$executeRawUnsafe(
          `UPDATE "MonthlyReport" m SET "${m.to}" = m."${m.from}", "${m.from}" = NULL
             FROM "Company" c
            WHERE c.id = m."companyId" AND c."taxRegime" = $1
              AND m."${m.from}" IS NOT NULL AND m."${m.to}" IS NULL`,
          m.regime,
        );
        movedCells += rows.length;
      }
      if (proofs.length) {
        await prisma.$executeRawUnsafe(
          `UPDATE "ReportProof" p SET "colKey" = $3
             FROM "Company" c
            WHERE c.id = p."companyId" AND c."taxRegime" = $1 AND p."colKey" = $2
              AND NOT EXISTS (
                SELECT 1 FROM "ReportProof" q
                 WHERE q."companyId" = p."companyId" AND q.period = p.period AND q."colKey" = $3)`,
          m.regime, m.fromKey, m.toKey,
        );
        movedProofs += proofs.length;
      }
    }
  }

  console.log(`\n${"─".repeat(50)}`);
  if (apply) {
    console.log(`✅ ${movedCells} ta katak va ${movedProofs} ta skrinshot ko'chirildi.`);
    if (conflicts) console.log(`⚠️  ${conflicts} ta ziddiyatga TEGILMADI — qo'lda ko'rib chiqing.`);
  } else {
    console.log("QURUQ REJIM — hech narsa yozilmadi. Yozish uchun: --apply");
  }
}

main()
  .catch((e) => { console.error("XATO:", e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
