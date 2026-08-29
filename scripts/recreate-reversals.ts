import "./load-env";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";

interface LostReversal {
  sourceTable: string;
  sourceId: string;
  originalDebit: number;
  originalCredit: number;
  description: string;
  transactionId: string;
}

const LOST_REVERSALS: LostReversal[] = [
  { sourceTable: "KassaEntry-reversal", sourceId: "422d8a20", originalDebit: 3000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "013ff56d" },
  { sourceTable: "KassaEntry-reversal", sourceId: "699c3053", originalDebit: 4000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "0a5a80b5" },
  { sourceTable: "KassaEntry-reversal", sourceId: "63aaca73", originalDebit: 300000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "0b311ffd" },
  { sourceTable: "Payout-reversal", sourceId: "d1c5d3ca", originalDebit: 35000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "0ebf60d6" },
  { sourceTable: "KassaEntry-reversal", sourceId: "b9d17f93", originalDebit: 45645, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "112166fe" },
  { sourceTable: "KassaEntry-reversal", sourceId: "8ebdb852", originalDebit: 0, originalCredit: 26520000, description: "REVERSAL: sun'iy yozuv olib tashlandi (namoyish seedi)", transactionId: "116141f6" },
  { sourceTable: "Payout-reversal", sourceId: "bc0a2fb6", originalDebit: 2007650, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "128e7876" },
  { sourceTable: "Payout-reversal", sourceId: "3a5f7575", originalDebit: 245140, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "165ef6ec" },
  { sourceTable: "Payout-reversal", sourceId: "f3885ff4", originalDebit: 90000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "171656d0" },
  { sourceTable: "Payout-reversal", sourceId: "ef065af9", originalDebit: 15000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "1b8f8512" },
  { sourceTable: "KassaEntry-reversal", sourceId: "20a36ea8", originalDebit: 0, originalCredit: 1000000, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "218d8291" },
  { sourceTable: "Payout-reversal", sourceId: "2f993b21", originalDebit: 5000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "25af045e" },
  { sourceTable: "Payout-reversal", sourceId: "60e41264", originalDebit: 8085785, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "279f3ac1" },
  { sourceTable: "KassaEntry-reversal", sourceId: "367de7a0", originalDebit: 10439500, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "280ee88e" },
  { sourceTable: "KassaEntry-reversal", sourceId: "f7a4236b", originalDebit: 22900000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "284d76ae" },
  { sourceTable: "Payout-reversal", sourceId: "c646dd5d", originalDebit: 5000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "2b35c0b8" },
  { sourceTable: "KassaEntry-reversal", sourceId: "f4552109", originalDebit: 0, originalCredit: 600000, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "304bdc6f" },
  { sourceTable: "Payout-reversal", sourceId: "5fee6d22", originalDebit: 8000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "30623089" },
  { sourceTable: "Payout-reversal", sourceId: "a6cd615a", originalDebit: 800000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "3a75f983" },
  { sourceTable: "Payout-reversal", sourceId: "e763b36a", originalDebit: 2147523, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "4046f9e1" },
  { sourceTable: "KassaEntry-reversal", sourceId: "d685c252", originalDebit: 51520, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "43b16ed6" },
  { sourceTable: "Payout-reversal", sourceId: "3f336e12", originalDebit: 2000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "43dc56df" },
  { sourceTable: "Payout-reversal", sourceId: "c4be2458", originalDebit: 1992350, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "443a495d" },
  { sourceTable: "Payment-reversal", sourceId: "5199300a", originalDebit: 0, originalCredit: 3500000, description: "REVERSAL: bank kirim re-baseline: eski vipiska izi bekor qilindi", transactionId: "449a38c1" },
  { sourceTable: "KassaEntry-reversal", sourceId: "bf44487c", originalDebit: 0, originalCredit: 1000000, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "45185788" },
  { sourceTable: "KassaEntry-reversal", sourceId: "4ff1abc2", originalDebit: 11000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "456bd866" },
  { sourceTable: "Payout-reversal", sourceId: "ea63f6e0", originalDebit: 5000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "47baf727" },
  { sourceTable: "Payout-reversal", sourceId: "4ea9a919", originalDebit: 10204740, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "4bf91150" },
  { sourceTable: "Payout-reversal", sourceId: "e60a18ed", originalDebit: 4000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "4c13844f" },
  { sourceTable: "KassaEntry-reversal", sourceId: "84d74640", originalDebit: 5000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "4ce229df" },
  { sourceTable: "KassaEntry-reversal", sourceId: "6f97966b", originalDebit: 10000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "4f675700" },
  { sourceTable: "KassaEntry-reversal", sourceId: "161b9a77", originalDebit: 2500000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "50256ce5" },
  { sourceTable: "KassaEntry-reversal", sourceId: "0880c3a7", originalDebit: 0, originalCredit: 1500000, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "50fd14ee" },
  { sourceTable: "KassaEntry-reversal", sourceId: "3dc3928b", originalDebit: 0, originalCredit: 500000, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "53d1e6f8" },
  { sourceTable: "KassaEntry-reversal", sourceId: "825d0ab6", originalDebit: 0, originalCredit: 41253333, description: "REVERSAL: sun'iy yozuv olib tashlandi (namoyish seedi)", transactionId: "5bbf5dde" },
  { sourceTable: "KassaEntry-reversal", sourceId: "8a85f3ff", originalDebit: 710000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "5d75e983" },
  { sourceTable: "Payout-reversal", sourceId: "4abbc328", originalDebit: 100000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "640fa66c" },
  { sourceTable: "KassaEntry-reversal", sourceId: "56348be2", originalDebit: 24176750, originalCredit: 0, description: "REVERSAL: sun'iy yozuv olib tashlandi (namoyish seedi)", transactionId: "67b772cc" },
  { sourceTable: "Payout-reversal", sourceId: "f93e7cfa", originalDebit: 920000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "6db32f58" },
  { sourceTable: "KassaEntry-reversal", sourceId: "17d8a39f", originalDebit: 20457250, originalCredit: 0, description: "REVERSAL: sun'iy yozuv olib tashlandi (namoyish seedi)", transactionId: "6e56df11" },
  { sourceTable: "KassaEntry-reversal", sourceId: "4ef55737", originalDebit: 1000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "71c223d8" },
  { sourceTable: "Payout-reversal", sourceId: "41712519", originalDebit: 15000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "71df3693" },
  { sourceTable: "KassaEntry-reversal", sourceId: "1bec4399", originalDebit: 6000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "74c3a25c" },
  { sourceTable: "KassaEntry-reversal", sourceId: "4aa26210", originalDebit: 4000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "7519d28f" },
  { sourceTable: "Payout-reversal", sourceId: "85f2bbaa", originalDebit: 3000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "774aa5d0" },
  { sourceTable: "Payout-reversal", sourceId: "3811371e", originalDebit: 3000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "7884fd92" },
  { sourceTable: "Payout-reversal", sourceId: "858e3f49", originalDebit: 11592250, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "790db1d3" },
  { sourceTable: "Payout-reversal", sourceId: "a01b31d3", originalDebit: 8210950, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "7bc86e77" },
  { sourceTable: "Payout-reversal", sourceId: "4998377b", originalDebit: 7822000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "7ef76a40" },
  { sourceTable: "Payout-reversal", sourceId: "cdb2c2f1", originalDebit: 40000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "825827a0" },
  { sourceTable: "KassaEntry-reversal", sourceId: "f2e84632", originalDebit: 0, originalCredit: 1000000, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "87b2c5af" },
  { sourceTable: "Payout-reversal", sourceId: "d95b0ad7", originalDebit: 45645, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "883d8d57" },
  { sourceTable: "Payout-reversal", sourceId: "ab56d279", originalDebit: 500000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "88ecb282" },
  { sourceTable: "KassaEntry-reversal", sourceId: "2001a822", originalDebit: 11000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "89d88bbe" },
  { sourceTable: "Payout-reversal", sourceId: "76ad3f8a", originalDebit: 2167000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "8a9d2651" },
  { sourceTable: "Payout-reversal", sourceId: "3bfef533", originalDebit: 700000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "8c090db8" },
  { sourceTable: "Payout-reversal", sourceId: "49e579aa", originalDebit: 2000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "8d004916" },
  { sourceTable: "Payout-reversal", sourceId: "64435cca", originalDebit: 13519500, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "9033d5f2" },
  { sourceTable: "Payout-reversal", sourceId: "34050e12", originalDebit: 15000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "9035c1c9" },
  { sourceTable: "KassaEntry-reversal", sourceId: "11c9dde8", originalDebit: 0, originalCredit: 1000000, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "92fa8d01" },
  { sourceTable: "KassaEntry-reversal", sourceId: "c46a270d", originalDebit: 2900000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "93ba750a" },
  { sourceTable: "Payout-reversal", sourceId: "8454c6b6", originalDebit: 9000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "949dbad0" },
  { sourceTable: "KassaEntry-reversal", sourceId: "aba83c09", originalDebit: 0, originalCredit: 1250000, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "9dc5155a" },
  { sourceTable: "KassaEntry-reversal", sourceId: "af731c4c", originalDebit: 99690, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "a9e0510d" },
  { sourceTable: "KassaEntry-reversal", sourceId: "763a50f2", originalDebit: 20000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "ac0c6761" },
  { sourceTable: "Payout-reversal", sourceId: "48497209", originalDebit: 200000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "b9882a55" },
  { sourceTable: "KassaEntry-reversal", sourceId: "7f9393b2", originalDebit: 13018250, originalCredit: 0, description: "REVERSAL: sun'iy yozuv olib tashlandi (namoyish seedi)", transactionId: "bfc981c9" },
  { sourceTable: "Payout-reversal", sourceId: "2a932c04", originalDebit: 370800, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "c0663547" },
  { sourceTable: "Payout-reversal", sourceId: "cfa4af4e", originalDebit: 5000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "c0969cb3" },
  { sourceTable: "KassaEntry-reversal", sourceId: "5b73a8b9", originalDebit: 10000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "c1f1c85d" },
  { sourceTable: "KassaEntry-reversal", sourceId: "8400c990", originalDebit: 0, originalCredit: 20626667, description: "REVERSAL: sun'iy yozuv olib tashlandi (namoyish seedi)", transactionId: "c2d24cbd" },
  { sourceTable: "KassaEntry-reversal", sourceId: "06da1aec", originalDebit: 0, originalCredit: 5000000, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "c31b7e2f" },
  { sourceTable: "KassaEntry-reversal", sourceId: "7f6d644c", originalDebit: 725210, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "cdfe66cf" },
  { sourceTable: "KassaEntry-reversal", sourceId: "3b55c22e", originalDebit: 0, originalCredit: 1000000, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "cf22ab5a" },
  { sourceTable: "KassaEntry-reversal", sourceId: "8680375b", originalDebit: 10000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "d5e4972c" },
  { sourceTable: "KassaEntry-reversal", sourceId: "8c1a949c", originalDebit: 0, originalCredit: 500000, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "d7444f4a" },
  { sourceTable: "Payout-reversal", sourceId: "0b92c117", originalDebit: 245140, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "daa095fc" },
  { sourceTable: "Payout-reversal", sourceId: "f62b53b9", originalDebit: 5000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "dc065f7c" },
  { sourceTable: "Payout-reversal", sourceId: "fd6c3dbc", originalDebit: 3300000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "dca6e1b3" },
  { sourceTable: "Payout-reversal", sourceId: "9fd56d0a", originalDebit: 6000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "e2c0438f" },
  { sourceTable: "KassaEntry-reversal", sourceId: "843d15ac", originalDebit: 12000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "e58d1682" },
  { sourceTable: "KassaEntry-reversal", sourceId: "0edc5e40", originalDebit: 10000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "ebe90fae" },
  { sourceTable: "Payout-reversal", sourceId: "998084e3", originalDebit: 10000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "edd0cfdd" },
  { sourceTable: "Payout-reversal", sourceId: "2f670b27", originalDebit: 150000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "f34c3f4a" },
  { sourceTable: "Payout-reversal", sourceId: "57c1c271", originalDebit: 106000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "f4517545" },
  { sourceTable: "Payment-reversal", sourceId: "1f63ccf5", originalDebit: 0, originalCredit: 2000000, description: "REVERSAL: bank kirim re-baseline: eski vipiska izi bekor qilindi", transactionId: "f838a508" },
  { sourceTable: "Payout-reversal", sourceId: "eac647d0", originalDebit: 8772500, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "f8a97dd8" },
  { sourceTable: "Payout-reversal", sourceId: "90fc4acf", originalDebit: 40000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "f9b3a264" },
  { sourceTable: "Payout-reversal", sourceId: "2e4584b5", originalDebit: 1000000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "fb109cea" },
  { sourceTable: "Payout-reversal", sourceId: "896a8470", originalDebit: 49690, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "fd71c4ca" },
  { sourceTable: "Payout-reversal", sourceId: "5fd2b03b", originalDebit: 125000, originalCredit: 0, description: "REVERSAL: re-baseline: loyiha 2026-08-01 da ishga tushdi", transactionId: "fe4f06ef" },
];

async function main() {
  const { prisma } = await import("@/lib/prisma");

  const dryRun = process.argv.includes("--dry-run");
  console.log(`Nishon: ${LOST_REVERSALS.length} ta reversal yozuvini August 2026 da qayta yaratish`);
  console.log(`Period: 2026-08 (to'g'ri davr — July backdate xato edi)`);
  console.log(`Dry run: ${dryRun}\n`);

  let totalDebit = 0;
  let totalCredit = 0;

  // Count unique transaction IDs
  const txIds = [...new Set(LOST_REVERSALS.map(r => r.transactionId))];
  console.log(`Unique transaction IDs: ${txIds.length}`);

  for (const r of LOST_REVERSALS) {
    totalDebit += r.originalDebit;
    totalCredit += r.originalCredit;
  }

  console.log(`Umumiy Debit (CASH Dr): ${totalDebit.toLocaleString()}`);
  console.log(`Umumiy Credit (CASH Cr): ${totalCredit.toLocaleString()}`);
  const netEffect = totalCredit - totalDebit; // Credit - Debit = pul chiqdi = negative
  console.log(`Net ta'sir (Cr - Dr): ${netEffect.toLocaleString()}`);
  console.log(`Ekspektatsiya: tafovut ~${(25777 + netEffect).toLocaleString()} so'm bo'lishi kerak\n`);

  if (dryRun) {
    console.log("--dry-run: hech narsa yozilmadi.");
    await prisma.$disconnect();
    return;
  }

  const ledgers: Array<{
    id: string; transactionId: string; accountId: string;
    debit: bigint; credit: bigint;
    description: string | null; sourceTable: string | null; sourceId: string | null;
    period: string; createdBy: string | null;
  }> = [];

  for (const r of LOST_REVERSALS) {
    if (r.originalDebit > 0) {
      ledgers.push({
        id: randomUUID(),
        transactionId: r.transactionId,
        accountId: "CASH",
        debit: BigInt(0),
        credit: BigInt(r.originalDebit),
        description: r.description,
        sourceTable: r.sourceTable,
        sourceId: r.sourceId,
        period: "2026-08",
        createdBy: "recover-reversal",
      });
    }
    if (r.originalCredit > 0) {
      ledgers.push({
        id: randomUUID(),
        transactionId: r.transactionId,
        accountId: "CASH",
        debit: BigInt(r.originalCredit),
        credit: BigInt(0),
        description: r.description,
        sourceTable: r.sourceTable,
        sourceId: r.sourceId,
        period: "2026-08",
        createdBy: "recover-reversal",
      });
    }
  }

  // Bulk insert - use raw SQL to avoid Decimal type issues
  const values = ledgers.map(l =>
    `('${l.id}', '${l.transactionId}', '${l.accountId}', ${l.debit}, ${l.credit}, ${l.description ? `'${l.description.replace(/'/g, "''")}'` : 'NULL'}, ${l.sourceTable ? `'${l.sourceTable}'` : 'NULL'}, ${l.sourceId ? `'${l.sourceId}'` : 'NULL'}, '${l.period}', '${l.createdBy}', NOW())`
  ).join(",\n");

  await prisma.$executeRawUnsafe(`
    INSERT INTO "LedgerEntry" (id, "transactionId", "accountId", debit, credit, description, "sourceTable", "sourceId", period, "createdBy", "createdAt")
    VALUES ${values}
  `);

  console.log(`\n✓ ${ledgers.length} ta reversal yozuvi yaratildi (August 2026)`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
