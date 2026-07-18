/**
 * Seed a realistic 6-month cash-flow (income vs expense) for the dashboard
 * "Pul oqimi" chart. Uses KassaEntry rows tagged "[demo]" so it does NOT touch
 * the real Payment/Kassa collection workflow and is trivially reversible.
 *
 * Idempotent: clears prior "[demo]" KassaEntry rows first.
 * Reverse:   npx tsx scripts/seed-cashflow-demo.ts --clear
 *
 * Run:       npx tsx scripts/seed-cashflow-demo.ts
 */
import "./load-env"; // must be first: loads DATABASE_URL before Prisma is used
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const TAG = "[demo]";

// income / expense totals per month (mln so'm), oldest → newest
const PLAN: { income: number; expense: number }[] = [
  { income: 62_000_000, expense: 54_300_000 },
  { income: 78_400_000, expense: 66_100_000 },
  { income: 71_200_000, expense: 61_500_000 },
  { income: 85_600_000, expense: 70_800_000 },
  { income: 92_100_000, expense: 76_400_000 },
  { income: 88_400_000, expense: 74_390_000 },
];

const incomeCats = ["Mijoz to'lovi", "Shartnoma to'lovi", "Qo'shimcha xizmat"];
const expenseCats = ["Ish haqi", "Ijara", "Soliqlar", "Kommunal"];

// split a total into n parts (deterministic-ish)
function split(total: number, parts: number): number[] {
  const out: number[] = [];
  let left = total;
  for (let i = 0; i < parts - 1; i++) {
    const share = Math.round((total / parts) * (0.7 + (i % 3) * 0.2));
    out.push(share);
    left -= share;
  }
  out.push(left);
  return out;
}

async function main() {
  const clear = process.argv.includes("--clear");

  const del = await prisma.kassaEntry.deleteMany({ where: { description: { startsWith: TAG } } });
  console.log(`Cleared ${del.count} prior demo cash-flow rows.`);
  if (clear) return;

  const base = new Date();
  base.setDate(1);

  const rows: Prisma.KassaEntryCreateManyInput[] = [];
  PLAN.forEach((p, idx) => {
    const monthOffset = 5 - idx; // idx 0 = 5 months ago
    const monthDate = new Date(base.getFullYear(), base.getMonth() - monthOffset, 15);

    split(p.income, 3).forEach((amt, i) => {
      rows.push({ type: "income", category: incomeCats[i % incomeCats.length], amount: new Prisma.Decimal(amt), date: monthDate, description: `${TAG} ${incomeCats[i % incomeCats.length]}` });
    });
    split(p.expense, 4).forEach((amt, i) => {
      rows.push({ type: "expense", category: expenseCats[i % expenseCats.length], amount: new Prisma.Decimal(amt), date: monthDate, description: `${TAG} ${expenseCats[i % expenseCats.length]}` });
    });
  });

  const res = await prisma.kassaEntry.createMany({ data: rows });
  console.log(`✅ Inserted ${res.count} demo cash-flow entries across 6 months.`);
}

main()
  .catch((e) => { console.error("ERROR:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
