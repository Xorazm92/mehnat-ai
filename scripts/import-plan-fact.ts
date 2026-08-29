/**
 * OYLIK REJA/FAKT IMPORTI ("Plan fact" jadvali).
 *
 *   npx tsx scripts/import-plan-fact.ts --dry-run
 *   npx tsx scripts/import-plan-fact.ts
 *
 * Idempotent: `@@unique([period, metric])`.
 */
import "./load-env"; // birinchi bo'lishi shart
import { prisma } from "@/lib/prisma";
import { formatNum as som } from "@/lib/platform/format";
import fs from "node:fs";
import path from "node:path";
import { findImportFileByPrefix, importDirs, requireImportFile } from "./import-source";
import { parsePlanFact } from "@/lib/planFact";


async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const file = findImportFileByPrefix("Plan fact");
  if (!file) {
    console.error(`"Plan fact" fayli topilmadi (${importDirs().join(", ") || "manba papkasi yo'q"})`);
    process.exit(1);
  }

  const workbook = JSON.parse(fs.readFileSync(requireImportFile(file), "utf8"));
  const rows = parsePlanFact(workbook["Umumiy"] ?? []);
  const periods = [...new Set(rows.map((r) => r.period))].sort();
  const metrics = [...new Set(rows.map((r) => r.metric))];

  console.log(`Fayl: ${file}`);
  console.log(`Qator: ${rows.length} · davr: ${periods.length} · ko'rsatkich: ${metrics.length}`);
  console.log(`Davrlar: ${periods.join(", ")}`);

  const revenue = rows.filter((r) => /umumiy tushum/i.test(r.metric));
  console.log(`\nUMUMIY TUSHUM:`);
  for (const r of revenue.sort((a, b) => a.period.localeCompare(b.period))) {
    const pct = r.plan && r.fact ? ` (${Math.round((r.fact / r.plan) * 100)}%)` : "";
    console.log(`   ${r.period}  fakt ${som(r.fact).padStart(13)}  reja ${som(r.plan).padStart(13)}${pct}`);
  }

  if (dryRun) {
    console.log("\n--dry-run: hech narsa yozilmadi.");
    return;
  }

  let written = 0;
  for (const r of rows) {
    await prisma.monthlyTarget.upsert({
      where: { period_metric: { period: r.period, metric: r.metric } },
      create: { period: r.period, metric: r.metric, plan: r.plan, fact: r.fact },
      update: { plan: r.plan, fact: r.fact },
    });
    written++;
  }
  console.log(`\n✓ ${written} ta reja/fakt qatori yozildi`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
