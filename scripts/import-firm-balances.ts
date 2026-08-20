/**
 * FIRMA BANK QOLDIQLARI — "Band qilganlar.json" → `Firmalar` varag'i
 * =================================================================
 *
 *   npx tsx scripts/import-firm-balances.ts                    # solishtiradi
 *   npx tsx scripts/import-firm-balances.ts --apply            # farqni yozadi
 *   npx tsx scripts/import-firm-balances.ts --apply --as-of=2026-08-01
 *
 * NIMA QILADI: har o'z firmaning Exceldagi BANK OSTATKASI raqamini tizimdagi
 * schyot kanali qoldig'i bilan solishtiradi va FARQNI "Boshlang'ich qoldiq"
 * yozuvi qilib kiritadi.
 *
 * NEGA FARQ, TO'LIQ SUMMA EMAS: qayta ishga tushirilganda to'liq summa
 * yozilsa, qoldiq har safar ikkilanardi. Farq yozilsa — birinchi marta
 * to'liq summa tushadi, keyingi safar farq nol bo'lib hech narsa yozilmaydi.
 * Qayta hisoblash oson: Excel raqami o'zgarsa, faqat o'zgargan qismi kiradi.
 *
 * SANA ATAYIN PARAMETR: Excelda "BANK OSTATKASI" — hisobot olingan KUNDAGI
 * qoldiq, u qaysi kunga tegishli ekani faylda yozilmagan. Taxmin qilib
 * qo'yish o'rniga `--as-of` bilan ochiq ko'rsatiladi (standart: joriy oy
 * boshi). Jurnal davri shu sanadan olinadi.
 *
 * Ustun bo'sh bo'lgan firma (Excelda 7 tasi shunday) O'TKAZIB YUBORILADI —
 * bo'sh katak "qoldiq nol" degani emas, "hali yozilmagan" degani.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { requireImportFile } from "./import-source";
import { formatNum as som } from "@/lib/format";
import { ACCOUNTS, postLedger, getCashByChannel } from "@/lib/ledger";
import { periodKeyOf } from "@/lib/periods";
import fs from "node:fs";

const norm = (s: string) => s.toLowerCase().replace(/[«»"'`‘’]/g, "").replace(/\s+/g, " ").trim();

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const asOfArg = process.argv.find((a) => a.startsWith("--as-of="))?.slice(8);
  const asOf = asOfArg ? new Date(asOfArg) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  if (Number.isNaN(asOf.getTime())) {
    console.error(`Sana noto'g'ri: ${asOfArg}`);
    process.exit(1);
  }
  const period = periodKeyOf(asOf);

  const sheet = JSON.parse(fs.readFileSync(requireImportFile("Band qilganlar.json"), "utf8"))["Firmalar"] ?? [];
  const declared = sheet
    .filter((r: Record<string, unknown>) => r["Firmalar"] && r["BANK OSTATKASI"] != null)
    .map((r: Record<string, unknown>) => ({
      name: String(r["Firmalar"]),
      inn: r["INN"] != null ? String(r["INN"]) : null,
      founder: (r["Ta'sischi"] as string) ?? null,
      director: (r["Direktor"] as string) ?? null,
      balance: Number(r["BANK OSTATKASI"]),
    }));

  console.log(`\nFirmalar varag'i: ${declared.length} ta firmada bank qoldig'i ko'rsatilgan`);
  console.log(`Sana: ${asOf.toISOString().slice(0, 10)} (davr ${period})\n`);

  const firms = await prisma.company.findMany({
    where: { isOwnFirm: true },
    select: { id: true, name: true, inn: true },
  });
  const channels = await prisma.disbursementChannel.findMany({
    where: { type: "own_firm_account" },
    select: { id: true, ownFirmId: true, label: true },
  });
  const channelByFirm = new Map(channels.map((c) => [c.ownFirmId, c]));
  const cash = await getCashByChannel(prisma as never, period);
  const balanceByChannel = new Map(cash.map((r) => [r.channelId ?? "", Number(r.balance)]));

  const importer = await prisma.user.findFirst({
    where: { role: "super_admin", isActive: true },
    select: { id: true },
  });

  console.log(
    `${"EXCEL FIRMA".padEnd(22)}${"Excel".padStart(14)}${"tizimda".padStart(14)}${"farq".padStart(14)}  kanal`
  );

  let posted = 0;
  const missing: string[] = [];

  for (const d of declared) {
    // INN — ishonchli kalit; nom Excelda va bazada har xil yozilgan
    // ("FININFO BEST" ↔ "HOME SPOT STORY", "SOFYTEAM" ↔ "SOFI TEAM").
    const firm =
      (d.inn ? firms.find((f) => f.inn?.replace(/\D/g, "") === d.inn!.replace(/\D/g, "")) : null) ??
      firms.find((f) => norm(f.name) === norm(d.name)) ??
      null;
    const ch = firm ? channelByFirm.get(firm.id) : null;
    const current = ch ? (balanceByChannel.get(ch.id) ?? 0) : 0;
    const diff = Math.round((d.balance - current) * 100) / 100;

    console.log(
      `${d.name.padEnd(22)}${som(d.balance).padStart(14)}${som(current).padStart(14)}` +
        `${som(diff).padStart(14)}  ${ch ? ch.label : "✗ topilmadi"}`
    );

    if (!ch) {
      missing.push(`${d.name} (INN ${d.inn ?? "—"})`);
      continue;
    }
    if (Math.abs(diff) < 1) continue;
    if (!apply) {
      posted++;
      continue;
    }

    const entry = await prisma.kassaEntry.create({
      data: {
        type: diff > 0 ? "income" : "expense",
        category: "Boshlang'ich qoldiq",
        amount: Math.abs(diff),
        date: asOf,
        channelId: ch.id,
        companyId: firm!.id,
        description: `Bank qoldig'i tenglashtirildi (Excel "Firmalar" varag'i, ${asOf.toISOString().slice(0, 10)})`,
      },
      select: { id: true },
    });
    await postLedger(prisma as never, {
      legs:
        diff > 0
          ? [
              { accountId: ACCOUNTS.CASH, debit: Math.abs(diff), channelId: ch.id },
              { accountId: ACCOUNTS.KASSA_INCOME, credit: Math.abs(diff) },
            ]
          : [
              { accountId: ACCOUNTS.OPERATING_EXPENSE, debit: Math.abs(diff) },
              { accountId: ACCOUNTS.CASH, credit: Math.abs(diff), channelId: ch.id },
            ],
      period,
      sourceTable: "KassaEntry",
      sourceId: entry.id,
      createdBy: importer?.id ?? null,
      description: `Boshlang'ich qoldiq: ${ch.label}`,
    });
    posted++;
  }

  const total = declared.reduce((s: number, d: { balance: number }) => s + d.balance, 0);
  console.log(`${"─".repeat(66)}`);
  console.log(`${"JAMI".padEnd(22)}${som(total).padStart(14)}`);

  if (missing.length) {
    console.log(`\n✗ Schyot kanali topilmadi (${missing.length}) — avval seed-own-firm-accounts.ts:`);
    for (const m of missing) console.log(`   ${m}`);
  }

  console.log();
  console.log(
    apply ? `✓ Tenglashtirish yozuvi: ${posted} ta` : `Hech narsa yozilmadi (${posted} ta yozilardi). Yozish uchun: --apply`
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
