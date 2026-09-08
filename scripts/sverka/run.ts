import "../load-env";

// BIR MARTALIK SVERKA — mijoz papkasidan hisobotgacha.
//
// Ish holati: mijoz "2026-yil yanvardan sentyabrgacha solishtirib, kamomadni
// toping" deb Excel fayllarni beradi. Har safar qo'lda skript yozish o'rniga
// shu quvur ishlatiladi:
//
//   papka → tur aniqlash → normal JSON → sverka → xlsx + md hisobot
//
// Mantiq ILOVA bilan BIR XIL modullardan keladi (`lib/pos/*`, `lib/bank/*`),
// shuning uchun CLI va ekran hech qachon bir-biridan uzoqlashmaydi.
//
//   npx tsx scripts/sverka/run.ts --dir <papka> [--from 2026-01-01] [--to 2026-09-30] [--out <papka>]
//
// Papkada `sverka.config.json` bo'lsa, undagi qarorlar qo'llanadi:
//   { "inScope": ["UZCARD 50219"], "outOfScope": ["EPOS 97011045"] }

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { readWorkbook } from "@/lib/bank/readWorkbook";
import { parseWorkbook } from "@/lib/bank/parseStatement";
import { detectKind, type FileKind } from "./detect";
import { parseFiscalWorkbook, fmHintFromFileName } from "@/lib/pos/parseFiscalReport";
import { parseChecksWorkbook } from "@/lib/pos/parseChecksList";
import { classifySettlement, settlementSign, defaultInScope, CHANNEL_LABELS } from "@/lib/pos/classifySettlement";
import { reconcile, dayKey, type DeviceDay, type SettlementDay } from "@/lib/pos/reconcile";
import { formatNum } from "@/lib/platform/format";

interface Args { dir: string; from?: string; to?: string; out: string; ignoreConfig: boolean }

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (k: string) => {
    const i = a.indexOf(`--${k}`);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const dir = get("dir");
  if (!dir) {
    console.error(
      "Ishlatish: npx tsx scripts/sverka/run.ts --dir <papka> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--out <papka>] [--ignore-config]",
    );
    process.exit(1);
  }
  return {
    dir: resolve(dir),
    from: get("from"),
    to: get("to"),
    out: resolve(get("out") ?? join(dir, "sverka-natija")),
    // Doira qarorini vaqtincha e'tiborsiz qoldirib, SUKUT holatini ko'rish —
    // "config qancha o'zgartiryapti" degan savolga javob.
    ignoreConfig: a.includes("--ignore-config"),
  };
}

interface Config { inScope?: string[]; outOfScope?: string[] }

interface FileReport {
  file: string;
  kind: FileKind;
  why: string;
  detail: string;
  error?: string;
}

async function main() {
  const args = parseArgs();
  const cfgPath = join(args.dir, "sverka.config.json");
  const cfg: Config = !args.ignoreConfig && existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, "utf8")) : {};

  const files = readdirSync(args.dir)
    .filter((f) => [".xlsx", ".xls", ".json"].includes(extname(f).toLowerCase()))
    .filter((f) => f !== "sverka.config.json")
    .sort();
  if (!files.length) {
    console.error(`Papkada .xlsx/.xls fayl topilmadi: ${args.dir}`);
    process.exit(1);
  }

  const jsonDir = join(args.out, "json");
  mkdirSync(jsonDir, { recursive: true });

  const reports: FileReport[] = [];
  // Xom kassa qatorlari. YAKUNIY yig'indi fayllar o'qilib bo'lgach hisoblanadi:
  // bitta kunni ikki manba berishi mumkin (chek reestri FM bilan, kunlik
  // hisobot esa faqat STIR bilan) va ularni qo'shish savdoni ikki marta
  // sanardi. Kim ustun ekani fayllar TARTIBIGA bog'liq bo'lmasligi kerak.
  interface RawKassaRow { fm: string | null; inn: string | null; id: string; date: string; card: number; cash: number }
  const rawKassa: RawKassaRow[] = [];
  const dupWarnings: string[] = [];
  /** Kanal kesimi (Click/Payme/Uzum kabinetidan) — kassa yig'indisiga KIRMAYDI. */
  const channelDays: Record<string, Map<string, number>> = {};
  const deviceLabels = new Map<string, string>();
  const cashByDay = new Map<string, number>();
  const rawSettlements: {
    terminalCode: string; channel: string; date: string; docDate: string;
    fact: number; gross: number; commission: number; fromDoc: boolean; reversal: boolean;
  }[] = [];

  for (const f of files) {
    const path = join(args.dir, f);
    try {
      const buf = readFileSync(path);
      const workbook = extname(f).toLowerCase() === ".json"
        ? (JSON.parse(buf.toString("utf8")) as Record<string, Record<string, unknown>[]>)
        : await readWorkbook(new File([new Uint8Array(buf)], f));
      const { kind, why } = detectKind(workbook);

      if (kind === "bank") {
        const parsed = parseWorkbook(workbook);
        writeFileSync(join(jsonDir, `${basename(f, extname(f))}.bank.json`), JSON.stringify(parsed, null, 1));
        let used = 0;
        for (const tx of parsed.transactions) {
          const info = classifySettlement(tx.purpose, tx.counterpartyName);
          const sign = settlementSign(tx.direction, info);
          if (sign === 0) continue;
          const fact = sign * tx.amount;
          const gross =
            info.grossAmount != null
              ? sign * info.grossAmount
              : info.creditedPercent
                ? fact / (info.creditedPercent / 100)
                : fact;
          const commission = info.commissionAmount != null ? sign * info.commissionAmount : gross - fact;
          rawSettlements.push({
            terminalCode: info.terminalCode,
            channel: info.channel,
            date: dayKey(info.opDate ?? tx.valueDate),
            docDate: dayKey(tx.valueDate),
            fact, gross, commission,
            fromDoc: !info.opDate,
            reversal: info.isReversal,
          });
          used++;
        }
        reports.push({
          file: f, kind, why,
          detail: `${parsed.format} · hisob ${parsed.accountNumber ?? "?"} · ${parsed.transactions.length} qator · ekvayring ${used}`,
        });
      } else if (kind === "kassa_daily" || kind === "checks") {
        // Ikki manba ham AYNI natijani beradi: kun + apparat kesimidagi karta
        // summasi. Cheklar ro'yxati chekma-chek keladi va yig'ilishi kerak,
        // kunlik hisobot esa allaqachon yig'ilgan.
        const hint = fmHintFromFileName(f);
        // Fayl nomi kanal uchun OXIRGI chora bo'lib beriladi — parser avval
        // varaq mazmunidan qaraydi.
        const parsed = kind === "checks" ? parseChecksWorkbook(workbook) : parseFiscalWorkbook(workbook, hint, f);
        writeFileSync(join(jsonDir, `${basename(f, extname(f))}.kassa.json`), JSON.stringify(parsed, null, 1));
        const id = parsed.rows.find((r) => r.fmNumber)?.fmNumber ?? hint ?? f;
        // KANAL KESIMI: soliq kabineti to'lov turi bo'yicha filtrlangan
        // hisobotni beradi — unda naqd ham, terminal ham NOL, summa esa
        // "Жами" ustunida turadi. Bu ASOSIY hisobotning ichki bo'lagi;
        // uni kassa yig'indisiga qo'shish savdoni ikki marta sanardi.
        //
        // Qarorni endi PARSER beradi (fayl mazmuni bo'yicha). Ilgari u shu
        // yerda fayl NOMIDAN olinardi: nom mos kelmasa kesim jimgina asosiy
        // summaga qo'shilib ketardi. Kanali topilmagan kesim esa parserda
        // xato bilan rad etiladi va quyidagi `catch` da ko'rinadi.
        if (parsed.isBreakdown) {
          const channel = parsed.channel!;
          const m = (channelDays[channel] ??= new Map());
          for (const r of parsed.rows) m.set(dayKey(r.date), (m.get(dayKey(r.date)) ?? 0) + r.totalAmount);
          reports.push({
            file: f, kind, why: `${why} — ${channel} kanali kesimi`,
            detail: `${parsed.rows.length} kun · ${formatNum(parsed.rows.reduce((s2, r) => s2 + r.totalAmount, 0))} (kassa yig'indisiga kirmaydi)`,
          });
          continue;
        }
        for (const r of parsed.rows) {
          rawKassa.push({
            fm: r.fmNumber, inn: r.inn, id,
            date: dayKey(r.date), card: r.cardAmount, cash: r.cashAmount,
          });
        }
        reports.push({
          file: f, kind, why,
          detail:
            `apparat ${id} · ${parsed.rows.length} kun · karta ${formatNum(parsed.rows.reduce((s, r) => s + r.cardAmount, 0))}` +
            (parsed.rows.some((r) => r.receiptCount) ? ` · ${parsed.rows.reduce((s, r) => s + r.receiptCount, 0)} chek` : ""),
        });
      } else {
        reports.push({ file: f, kind, why, detail: kind === "kassa_monthly" ? "OYLIK hisobot — kunma-kun sverkaga yaramaydi" : "" });
      }
    } catch (e) {
      reports.push({ file: f, kind: "unknown", why: "xato", detail: "", error: (e as Error).message.slice(0, 200) });
    }
  }

  // ── Kassa qatorlarini yagonalashtirish.
  //
  // Bitta STIR va bitta kun uchun apparati ANIQ manba (chek reestrida FM bor)
  // ustun turadi; apparatini ayta olmaydigan kunlik hisobot esa o'sha kunni
  // TAKRORLAYDI, qo'shimcha savdo emas. Turli FM lar — turli apparat, ular
  // qo'shiladi.
  const deviceDays: DeviceDay[] = [];
  const byInnDay = new Map<string, RawKassaRow[]>();
  for (const r of rawKassa) {
    const k = `${r.inn ?? r.id}|${r.date}`;
    (byInnDay.get(k) ?? byInnDay.set(k, []).get(k)!).push(r);
  }
  for (const group of byInnDay.values()) {
    const identified = group.filter((r) => r.fm);
    const chosen = identified.length ? identified : group;
    const dropped = group.filter((r) => !chosen.includes(r));
    if (dropped.length) {
      const a = chosen.reduce((s2, r) => s2 + r.card, 0);
      const b = dropped.reduce((s2, r) => s2 + r.card, 0);
      if (Math.abs(a - b) > 1 && dupWarnings.length < 20) {
        dupWarnings.push(`${chosen[0].date}: manbalar har xil (${formatNum(a)} ≠ ${formatNum(b)})`);
      }
    }
    // Bir kunda bir apparatning ikki nusxasi ham bo'lishi mumkin — FM bo'yicha
    // yagonalashtiramiz.
    const seen = new Set<string>();
    for (const r of chosen) {
      const key = r.fm ?? r.id;
      if (seen.has(key)) continue;
      seen.add(key);
      deviceLabels.set(key, key);
      deviceDays.push({ deviceId: key, date: r.date, cardAmount: r.card, cashAmount: r.cash });
      cashByDay.set(r.date, (cashByDay.get(r.date) ?? 0) + r.cash);
    }
  }

  // ── Terminal doirasi. Sukut: POS kanallari kiradi, EPOS va onlayn — yo'q.
  //    Papkadagi config qarorni bekor qiladi (bir marta yozib qo'yiladi).
  const range = args.from && args.to ? { from: args.from, to: args.to } : undefined;
  const inRange = (d: string) => !range || (d >= range.from && d <= range.to);

  const terminals = new Map<string, { channel: string; inScope: boolean; total: number }>();
  for (const s of rawSettlements) {
    let t = terminals.get(s.terminalCode);
    if (!t) {
      const auto = defaultInScope(s.channel as Parameters<typeof defaultInScope>[0]);
      const forced = cfg.inScope?.includes(s.terminalCode) ? true : cfg.outOfScope?.includes(s.terminalCode) ? false : auto;
      t = { channel: s.channel, inScope: forced, total: 0 };
      terminals.set(s.terminalCode, t);
    }
    // Yig'indi DAVR ichida hisoblanadi: aks holda hisobotdagi "doiradan
    // tashqarida" raqami sverka davri bilan solishtirib bo'lmaydigan
    // (kattaroq) bo'lib chiqadi.
    if (inRange(s.date)) t.total += s.gross;
  }

  const settlements: SettlementDay[] = rawSettlements
    .filter((s) => terminals.get(s.terminalCode)!.inScope)
    .map((s) => ({
      terminalId: s.terminalCode,
      date: s.date,
      factAmount: s.fact,
      grossAmount: s.gross,
      commissionAmount: s.commission,
      fromDocumentDate: s.fromDoc,
    }));

  const result = reconcile(deviceDays, settlements, range);

  // ── Kanal kesimi: kassa kabinetining to'lov turi bo'yicha hisoboti ↔
  //    bankdagi o'sha kanal. Faqat IKKALA tomonda ham ma'lumot bor oylar
  //    solishtiriladi — kanal fayllari odatda bir necha oyni qamraydi,
  //    vipiska esa butun davrni, va aralashtirilsa farq soxta chiqadi.
  const bankByChannel = new Map<string, Map<string, number>>();
  for (const s2 of rawSettlements) {
    const m = bankByChannel.get(s2.channel) ?? new Map<string, number>();
    m.set(s2.date, (m.get(s2.date) ?? 0) + s2.gross);
    bankByChannel.set(s2.channel, m);
  }
  const channelRows: ChannelRow[] = Object.entries(channelDays).map(([ch, days]) => {
    const months = new Set([...days.keys()].filter(inRange).map((d) => d.slice(0, 7)));
    const pick = (d: string) => inRange(d) && months.has(d.slice(0, 7));
    const kassa = [...days].filter(([d]) => pick(d)).reduce((a, [, v]) => a + v, 0);
    const bank = [...(bankByChannel.get(ch) ?? [])].filter(([d]) => pick(d)).reduce((a, [, v]) => a + v, 0);
    return { channel: ch, months: [...months].sort().join(", "), kassa, bank, diff: kassa - bank };
  });

  writeFileSync(join(args.out, "sverka.json"), JSON.stringify({ range, result, terminals: [...terminals] }, null, 1));
  await writeExcel(args, result, deviceLabels, terminals, reports, cashByDay, channelRows);
  writeMarkdown(args, result, terminals, reports, channelRows, dupWarnings);

  console.log(`\nTayyor: ${args.out}`);
  console.log(`  sverka.xlsx · XULOSA.md · json/ (${files.length} fayl)`);
  console.log(`\nKassa (karta): ${formatNum(result.totals.kassaCard)}`);
  console.log(`Bank (brutto): ${formatNum(result.totals.bankGross)}`);
  console.log(`Bank (fakt):   ${formatNum(result.totals.bankFact)}`);
  console.log(`KAMOMAD:       ${formatNum(result.totals.diffFact)}  (komissiyasiz: ${formatNum(result.totals.diff)})`);
}

// ─────────────────────────────────────────────────────────

type Recon = ReturnType<typeof reconcile>;
type Terminals = Map<string, { channel: string; inScope: boolean; total: number }>;

interface ChannelRow { channel: string; months: string; kassa: number; bank: number; diff: number }

async function writeExcel(
  args: Args, r: Recon, devices: Map<string, string>, terminals: Terminals,
  reports: FileReport[], cashByDay: Map<string, number>, channels: ChannelRow[],
) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const inScope = [...terminals.entries()].filter(([, t]) => t.inScope).map(([code]) => code).sort();
  const devIds = [...devices.keys()].sort();

  const head = ["Sana", ...devIds.map((d) => `Kassa ${d}`), "JAMI KASSA",
    ...inScope.flatMap((t) => [`${t} FAKT`, `${t} BRUTTO`]),
    "BANK FAKT", "BANK BRUTTO", "KOMISSIYA", "FARQ (kassa−fakt)", "FARQ (kassa−brutto)", "Kassa naqd"];
  const body = r.days.map((d) => [
    d.date,
    ...devIds.map((id) => d.byDevice[id] ?? 0),
    d.kassaCard,
    ...inScope.flatMap((t) => [d.byTerminal[t]?.fact ?? 0, d.byTerminal[t]?.gross ?? 0]),
    d.bankFact, d.bankGross, d.commission, d.diffFact, d.diff, cashByDay.get(d.date) ?? 0,
  ]);
  const foot = ["JAMI",
    ...devIds.map((id) => r.days.reduce((s, d) => s + (d.byDevice[id] ?? 0), 0)),
    r.totals.kassaCard,
    ...inScope.flatMap((t) => [
      r.days.reduce((s, d) => s + (d.byTerminal[t]?.fact ?? 0), 0),
      r.days.reduce((s, d) => s + (d.byTerminal[t]?.gross ?? 0), 0),
    ]),
    r.totals.bankFact, r.totals.bankGross, r.totals.commission, r.totals.diffFact, r.totals.diff, r.totals.kassaCash,
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ...body, foot]), "1. Kunlik");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Oy", "Kassa (karta)", "Bank fakt", "Bank brutto", "Komissiya", "Farq (kassa−fakt)", "Farq (kassa−brutto)"],
    ...r.months.map((m) => [m.month, m.totals.kassaCard, m.totals.bankFact, m.totals.bankGross, m.totals.commission, m.totals.diffFact, m.totals.diff]),
    ["JAMI", r.totals.kassaCard, r.totals.bankFact, r.totals.bankGross, r.totals.commission, r.totals.diffFact, r.totals.diff],
  ]), "2. Oylik");

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Terminal", "Kanal", "Doirada", "Brutto summa"],
    ...[...terminals.entries()].sort((a, b) => b[1].total - a[1].total).map(([code, t]) => [
      code, CHANNEL_LABELS[t.channel as keyof typeof CHANNEL_LABELS] ?? t.channel, t.inScope ? "HA" : "yo'q", t.total,
    ]),
  ]), "3. Terminallar");

  if (channels.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Kanal", "Oylar", "Kassa kabineti", "Bank", "Farq"],
      ...channels.map((c) => [c.channel, c.months, c.kassa, c.bank, c.diff]),
    ]), "4. Kanal kesimi");
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Fayl", "Tur", "Izoh", "Xato"],
    ...reports.map((x) => [x.file, x.why, x.detail, x.error ?? ""]),
  ]), "5. Fayllar");

  writeFileSync(join(args.out, "sverka.xlsx"), XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

function writeMarkdown(
  args: Args, r: Recon, terminals: Terminals, reports: FileReport[],
  channels: ChannelRow[], dupWarnings: string[],
) {
  const t = r.totals;
  const n = (v: number) => formatNum(v);
  const outside = [...terminals.entries()].filter(([, x]) => !x.inScope).sort((a, b) => b[1].total - a[1].total);
  const period = r.days.length ? `${r.days[0].date} – ${r.days[r.days.length - 1].date}` : "—";

  const md = `# Kassa–bank sverka

**Davr:** ${period}
**Manba:** \`${args.dir}\`

## Yakun

| Ko'rsatkich | Summa, so'm |
|---|---|
| Kassa apparatlari (karta) | ${n(t.kassaCard)} |
| Bank — FAKT (hisobga tushgan) | ${n(t.bankFact)} |
| Bank — BRUTTO (komissiyagacha) | ${n(t.bankGross)} |
| Bank komissiyasi | ${n(t.commission)} |
| **KAMOMAD (kassa − fakt)** | **${n(t.diffFact)}** |
| Sof kamomad (kassa − brutto) | ${n(t.diff)} |
| Kassa naqd (ma'lumot uchun) | ${n(t.kassaCash)} |

${t.approximateAmount > 0 ? `> ⚠ ${n(t.approximateAmount)} so'm to'lov tafsilotida sanasiz keldi (UzCard «100% от сальдо») va hujjat sanasi bo'yicha joylashtirildi. Kunlik farq shu qismda shartli, davr yig'indisi to'g'ri.\n` : ""}
## Oylik kesim

| Oy | Kassa | Bank fakt | Bank brutto | Komissiya | Farq |
|---|---|---|---|---|---|
${r.months.map((m) => `| ${m.month} | ${n(m.totals.kassaCard)} | ${n(m.totals.bankFact)} | ${n(m.totals.bankGross)} | ${n(m.totals.commission)} | ${n(m.totals.diffFact)} |`).join("\n")}

## Doiradan tashqarida qolgan tushum

${outside.length === 0 ? "Yo'q — barcha kanal solishtiruvga kirdi." : `Bu kanallar kassa apparatlariga tegishli emas deb hisoblandi. Agar ular ham shu savdo nuqtasiga tegishli bo'lsa, papkadagi \`sverka.config.json\` ga \`"inScope"\` ro'yxatiga qo'shing va qayta ishga tushiring.

| Terminal | Kanal | Summa |
|---|---|---|
${outside.map(([code, x]) => `| ${code} | ${CHANNEL_LABELS[x.channel as keyof typeof CHANNEL_LABELS] ?? x.channel} | ${n(x.total)} |`).join("\n")}`}

${channels.length ? `## Kanal kesimi (kassa kabineti ↔ bank)

Kassa kabinetining to'lov turi bo'yicha hisoboti bilan bankdagi o'sha kanal.
Faqat ikkala tomonda ham ma'lumot bor oylar olingan.

| Kanal | Oylar | Kassa | Bank | Farq |
|---|---|---|---|---|
${channels.map((c) => `| ${c.channel} | ${c.months} | ${n(c.kassa)} | ${n(c.bank)} | ${n(c.diff)} |`).join("\n")}

` : ""}${dupWarnings.length ? `> ⚠ Bir kunni ikki manba har xil ko'rsatdi:\n${dupWarnings.map((w) => `> - ${w}`).join("\n")}\n\n` : ""}## O'qilgan fayllar

| Fayl | Tur | Izoh |
|---|---|---|
${reports.map((x) => `| ${x.file} | ${x.why} | ${x.error ? `❌ ${x.error}` : x.detail} |`).join("\n")}

## Metodologiya

- Sana **to'lov tafsilotidan** olinadi (\`за …\`, \`от: …\`, \`выручки за …\`); tafsilotda sana bo'lmasa hujjat sanasi ishlatiladi va yuqorida ogohlantiriladi.
- Kassa tomoni — \`Сумма (тўлов терминали)\` ustuni.
- Bank tomoni — ekvayring tushumining **yalpi** summasi; komissiya matndan aniq olinadi (taxminiy 0,2 % formulasi ishlatilmaydi).
- Bekor qilingan operatsiya faqat **bir marta** kamaytiradi: tushum stornosi (debet) minus qator, komissiya/o'tkazma stornosi (kredit) hisobga olinmaydi.
`;
  writeFileSync(join(args.out, "XULOSA.md"), md);
}

main();
