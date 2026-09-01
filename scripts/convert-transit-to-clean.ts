/**
 * VARAQ-VARAQ DAFTARNI TOZALANGAN YASSI SHAKLGA O'GIRISH.
 *
 *   npx tsx scripts/convert-transit-to-clean.ts --in="O'zini-o'zi band Iyul.json" --period=2026-07
 *
 * NEGA KERAK. Avgust daftari audit tomonidan tozalanib, yassi shaklda berilgan
 * (`kassa/json_clean/cash_transactions.json`) va butun import quvuri shunga
 * qurilgan: bitta o'qigich, bitta tekshiruv, bitta `dedupKey` sxemasi.
 * Boshqa oylar esa hali xom, VARAQ-VARAQ Excel eksporti bo'lib turibdi.
 *
 * Ikkinchi import yo'li ochish o'rniga (aynan shu avgustda 109 mln yo'qotgan
 * edi) xom fayl shu yerda YASSI SHAKLGA o'giriladi va keyin xuddi avgustdek
 * import qilinadi. O'qish `lib/transitImport.ts` ning sinalgan parseri bilan —
 * u varaqdagi uchta tuzoqni biladi (takrorlanuvchi "summa" yorlig'i, har
 * varaqda har xil ustun tartibi, oxiridagi "TOTAL" qatori).
 *
 * CHIQISH FAYLGA yoziladi, bazaga EMAS: raqamlar bazaga tegishidan oldin
 * ko'rib chiqilsin. Skript fayl ichidagi "Total" varag'i bilan solishtiradi
 * va mos kelmasa YOZMAYDI — auditning eng katta topilmasi aynan qo'lda
 * yozilgan "Total" edi (41 907 250 so'm kam).
 */
import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { requireImportFile } from "./import-source";
import { parseTransitSheet, parseTransitTotals } from "@/lib/transitImport";
import { formatNum as som } from "@/lib/platform/format";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

const inputName = arg("in");
const period = arg("period");
const force = process.argv.includes("--force");

if (!inputName || !period || !/^\d{4}-\d{2}$/.test(period)) {
  console.error(
    'Ishlatish: --in="O\'zini-o\'zi band Iyul.json" --period=2026-07 [--force]'
  );
  process.exit(1);
}

const [year, monthNo] = period.split("-").map(Number);
/** Sanasiz qator uchun — oy boshi (avgust faylida 30 ta shunday qator bor edi). */
const fallback = new Date(Date.UTC(year, monthNo - 1, 1));

interface CleanRow {
  register: string;
  date: string;
  date_inferred: boolean;
  company: string | null;
  company_inn: null;
  amount_in: number | null;
  purpose: string | null;
  note: string | null;
  amount_out: number | null;
  bank_fee: number;
}

function main(): void {
  const file = requireImportFile(inputName!);
  const book = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown[]>;

  const sheets = Object.keys(book).filter((s) => s !== "Total");
  const declared = new Map(
    parseTransitTotals((book["Total"] ?? []) as never).map((t) => [t.person.toLowerCase().trim(), t])
  );

  const rows: CleanRow[] = [];
  const mismatched: string[] = [];
  let totalIn = 0;
  let totalOut = 0;
  let totalFee = 0;

  console.log(`\nManba: ${file}`);
  console.log(`${"KASSA".padEnd(14)}${"kirim".padStart(15)}${"chiqim".padStart(15)}${"komis".padStart(10)}${"qoldiq".padStart(14)}  Total`);

  for (const sheet of sheets) {
    const parsed = parseTransitSheet(sheet, (book[sheet] ?? []) as never);
    const expected = declared.get(sheet.toLowerCase().trim());
    const ok = expected == null ? "—" : Math.abs(expected.cardBalance - parsed.balance) < 1 ? "✓" : "✗";
    if (ok === "✗") {
      mismatched.push(
        `${sheet}: hisoblangan ${som(parsed.balance)}, faylda ${som(expected!.cardBalance)}`
      );
    }

    console.log(
      `${sheet.padEnd(14)}${som(parsed.totalIn).padStart(15)}${som(parsed.totalOut).padStart(15)}` +
        `${som(parsed.totalCommission).padStart(10)}${som(parsed.balance).padStart(14)}  ${ok}`
    );

    totalIn += parsed.totalIn;
    totalOut += parsed.totalOut;
    totalFee += parsed.totalCommission;

    for (const m of parsed.movements) {
      const when = m.date ?? fallback;
      rows.push({
        register: sheet,
        date: when.toISOString().slice(0, 10),
        date_inferred: m.date == null,
        company: m.sourceFirm ?? null,
        company_inn: null,
        amount_in: m.amountIn > 0 ? m.amountIn : null,
        purpose: m.purpose ?? null,
        note: m.comment ?? null,
        amount_out: m.amountOut > 0 ? m.amountOut : null,
        bank_fee: m.commission ?? 0,
      });
    }
  }

  console.log(
    `\nJAMI: ${rows.length} qator · kirim ${som(totalIn)} · chiqim ${som(totalOut)} · komissiya ${som(totalFee)}`
  );
  console.log(`Qoldiq: ${som(totalIn - totalOut - totalFee)}`);

  if (mismatched.length) {
    console.error(`\n⚠️  QOLDIQ MOS KELMADI (${mismatched.length}):`);
    for (const m of mismatched) console.error(`   ${m}`);
    if (!force) {
      console.error(
        "\nFayl yozilmadi — daftar o'zi bilan kelishmasa, undan chiqqan raqamga ishonib bo'lmaydi.\n" +
          "Baribir yozish uchun: --force"
      );
      process.exit(1);
    }
  }

  const outPath = path.join(path.dirname(file), "json_clean", `cash_transactions_${period}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2), "utf8");
  console.log(`\n✓ Yozildi: ${outPath}`);
  console.log(`  Keyingi qadam: npx tsx scripts/import-kassa-clean.ts --period=${period} --dry-run`);
}

main();
