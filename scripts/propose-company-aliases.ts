/**
 * BOG'LANMAGAN 1C NOMLARIGA NOMZOD TAKLIF QILISH
 * ==============================================
 *
 *   npx tsx scripts/propose-company-aliases.ts           # ro'yxat
 *   npx tsx scripts/propose-company-aliases.ts --csv     # tahrirlash uchun
 *   npx tsx scripts/propose-company-aliases.ts --apply-file <fayl.csv>
 *
 * 1C hisobotlarida STIR yo'q, faqat nom bor. Normalizatsiya
 * (`lib/companyMatch.ts`) ko'pini o'zi topadi, qolgani imlo farqi:
 * "Dksp Amudaryo" ↔ "DSKP AMUDARYO", "Home Spot Toshkent" ↔ boshqacha.
 *
 * BU SKRIPT HECH NARSANI O'ZI BOG'LAMAYDI. U faqat nomzodlarni ko'rsatadi
 * va tasdiqlash uchun CSV beradi. Sabab: mavhum o'xshashlik bilan bog'lash
 * mijoz qarzini boshqasiga yozib qo'yadi — to'lagan mijoz qarzdor bo'lib
 * qoladi, qarzdor esa toza ko'rinadi. Bir marta tasdiqlangan bog'lanish
 * `CompanyAlias` da saqlanadi va keyingi importlarda o'zi ishlaydi.
 *
 * CSV formati (bitta qator = bitta bog'lanish):
 *   1C nomi<TAB>firma STIR
 * STIR ustuni bo'sh bo'lsa qator o'tkazib yuboriladi.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { requireImportFile } from "./import-source";
import { readLooseJsonArray } from "@/lib/bank/parsePlastik";
import { parseDebtSnapshot } from "@/lib/debtReport";
import { matchCompanyByName, normalizeCompanyName } from "@/lib/companyMatch";
import { formatNum as som } from "@/lib/format";
import fs from "node:fs";

/** Nomzodni baholash: umumiy so'zlar ulushi. Faqat KO'RSATISH uchun. */
function similarity(a: string, b: string): number {
  const wa = new Set(normalizeCompanyName(a).split(" ").filter((w) => w.length > 2));
  const wb = new Set(normalizeCompanyName(b).split(" ").filter((w) => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;
  let hit = 0;
  for (const w of wa) if (wb.has(w)) hit += 1;
  return hit / Math.max(wa.size, wb.size);
}

async function main(): Promise<void> {
  const applyFileIdx = process.argv.indexOf("--apply-file");
  const companies = await prisma.company.findMany({
    where: { isOwnFirm: false },
    select: { id: true, name: true, inn: true },
  });

  // ── Tasdiqlangan CSV ni yozish ─────────────────────────────────────────
  if (applyFileIdx !== -1) {
    const file = process.argv[applyFileIdx + 1];
    if (!file || !fs.existsSync(file)) {
      console.error("CSV fayl ko'rsatilmadi yoki topilmadi");
      process.exit(1);
    }
    const byInn = new Map(companies.filter((c) => c.inn).map((c) => [c.inn!.replace(/\D/g, ""), c]));
    let written = 0;
    let skipped = 0;
    for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
      const line = raw.replace(/\r$/, "");
      if (!line.trim() || line.startsWith("#")) continue;
      const [alias, inn] = line.split("\t");
      if (!alias?.trim() || !inn?.trim()) {
        skipped += 1;
        continue;
      }
      const company = byInn.get(inn.replace(/\D/g, ""));
      if (!company) {
        console.log(`   ✗ STIR topilmadi: ${inn.trim()}  (${alias.trim()})`);
        skipped += 1;
        continue;
      }
      await prisma.companyAlias.upsert({
        where: { alias: alias.trim() },
        create: { alias: alias.trim(), companyId: company.id, source: "1c" },
        update: { companyId: company.id },
      });
      written += 1;
    }
    console.log(`\n✓ Bog'lanish yozildi: ${written} · o'tkazib yuborildi: ${skipped}`);
    await prisma.$disconnect();
    return;
  }

  // ── Bog'lanmaganlarni yig'ish ──────────────────────────────────────────
  const aliasRows = await prisma.companyAlias.findMany({ select: { alias: true, companyId: true } });
  const aliases = new Map(aliasRows.map((a) => [a.alias, a.companyId]));

  const parsed = parseDebtSnapshot(
    readLooseJsonArray(fs.readFileSync(requireImportFile("01.08.2026 qarzdorlik.json"), "utf8")) as never
  );

  const unmatched = new Map<string, number>();
  for (const l of parsed.lines) {
    if (matchCompanyByName(l.customerName, companies, aliases)) continue;
    unmatched.set(l.customerName, (unmatched.get(l.customerName) ?? 0) + l.debt);
  }

  const ordered = [...unmatched.entries()].sort((a, b) => b[1] - a[1]);
  const csv = process.argv.includes("--csv");

  if (csv) {
    console.log("# 1C nomi\tSTIR   — STIR ustunini to'ldiring, keyin:");
    console.log("#   npx tsx scripts/propose-company-aliases.ts --apply-file <fayl>");
    for (const [name, debt] of ordered) {
      const best = companies
        .map((c) => ({ c, s: similarity(name, c.name) }))
        .sort((a, b) => b.s - a.s)[0];
      const hint = best && best.s >= 0.5 ? `\t# taklif: ${best.c.name} (${best.c.inn})` : "";
      console.log(`${name}\t${hint ? "" : ""}${hint}   # qarz ${som(debt)}`);
    }
    await prisma.$disconnect();
    return;
  }

  console.log();
  console.log(`BOG'LANMAGAN 1C NOMLARI: ${ordered.length} ta · jami qarz ${som(ordered.reduce((s, [, d]) => s + d, 0))}`);
  console.log("─".repeat(78));
  for (const [name, debt] of ordered) {
    const top = companies
      .map((c) => ({ c, s: similarity(name, c.name) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 2);
    console.log(`\n${som(debt).padStart(13)}  ${name}`);
    if (top.length === 0) {
      console.log("               (o'xshash nom topilmadi — yangi mijoz bo'lishi mumkin)");
    }
    for (const t of top) {
      console.log(`               ${Math.round(t.s * 100)}%  ${t.c.name}  · STIR ${t.c.inn ?? "—"}`);
    }
  }
  console.log(`\nTasdiqlash uchun: --csv bilan ro'yxat oling, STIR ustunini to'ldiring, --apply-file bilan yozing.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
