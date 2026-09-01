/**
 * AVGUST KASSA DAFTARI — TOZALANGAN MANBADAN IMPORT.
 *
 *   npx tsx scripts/import-kassa-clean.ts --dry-run
 *   npx tsx scripts/import-kassa-clean.ts --replace --with-expenses
 *
 * NEGA `import-transit.ts` YETMAYDI. U Excel eksportini o'qiydi. 2026-09-01
 * auditi o'sha eksportda 60 996 ta yo'qolgan belgi va 226 ta buzuq sana
 * topdi — natijada avgust importi JIMGINA kam yozgan:
 *
 *   daftar (audit)   120 kirim / 768 968 738,58 · 116 chiqim / 767 169 546,62
 *   bazada (avval)    97 kirim / 659 854 346,58 ·  89 chiqim / 598 212 634,62
 *   farq                       −109 114 392,00           −168 956 912,00
 *
 * Bu skript auditning tekshirilgan chiqishini o'qiydi
 * (`kassa/json_clean/cash_transactions.json`) va o'sha ikkita jadvalga
 * yozadi: `TransitEntry` (daftar) va `--with-expenses` bilan `KassaEntry`
 * (haqiqiy xarajat + ikki tomonlama jurnal).
 *
 * `--replace` — eski `xls:2026-08:*` qatorlarini bekor qiladi. Ular buzuq
 * manbadan kelgan, shuning uchun yonma-yon qoldirilmaydi: qoldirilsa avgust
 * ikki barobar ko'rinadi. TransitEntry jismonan o'chadi (u xom daftar
 * nusxasi), KassaEntry esa YUMSHOQ o'chadi va jurnali teskarisi bilan
 * bekor qilinadi (`financial-core-v2` qoidasi: moliyaviy yozuv yo'qolmaydi).
 *
 * Idempotent: `TransitEntry.dedupKey = "clean:2026-08:<qator>:<in|out|fee>"`.
 */
import "./load-env"; // birinchi bo'lishi shart
import fs from "node:fs";
import { prisma } from "@/lib/prisma";
import { formatNum as som } from "@/lib/platform/format";
import { requireImportFile } from "./import-source";
import {
  parseCleanCash,
  cleanCashTotals,
  balanceByRegister,
  resolveRegister,
  type CleanCashMovement,
} from "@/lib/kassaClean";
import { expenseAccountFor } from "@/lib/expenseAccount";
import { recordKassaMovement, reverseKassaMovement, runCashTx } from "@/lib/cashGate";
import { ACCOUNTS } from "@/lib/ledger";

const PERIOD = "2026-08";
const LEGACY_PREFIX = `xls:${PERIOD}:`;
const dryRun = process.argv.includes("--dry-run");
const replace = process.argv.includes("--replace");
const withExpenses = process.argv.includes("--with-expenses");
const actor = { kind: "script" as const, name: "import-kassa-clean" };

const key = (m: CleanCashMovement, dir: "in" | "out" | "fee") =>
  `clean:${PERIOD}:${m.rowNo}:${dir}`;

/** Eski (buzuq manbadan kelgan) avgust qatorlarini bekor qiladi. */
async function purgeLegacy(): Promise<void> {
  const rows = await prisma.transitEntry.findMany({
    where: { dedupKey: { startsWith: LEGACY_PREFIX } },
    select: { id: true, kassaEntryId: true, direction: true, amount: true },
  });

  const sum = (dir: string) =>
    rows.filter((r) => r.direction === dir).reduce((s, r) => s + Number(r.amount), 0);
  console.log(
    `Eski avgust qatorlari: ${rows.length} ta — kirim ${som(sum("in"))} · chiqim ${som(sum("out"))}`
  );
  if (!rows.length || dryRun) return;

  let reversed = 0;
  for (const r of rows) {
    if (!r.kassaEntryId) continue;
    const res = await runCashTx((tx) =>
      reverseKassaMovement(tx, actor, {
        kassaEntryId: r.kassaEntryId!,
        reason: "Buzuq Excel manbasidan kelgan avgust yozuvi — tozalangan daftardan qayta import",
      })
    );
    if (res.reversed) reversed++;
  }
  await prisma.transitEntry.deleteMany({ where: { dedupKey: { startsWith: LEGACY_PREFIX } } });
  console.log(`   ✓ ${rows.length} ta daftar qatori o'chirildi, ${reversed} ta kassa yozuvi bekor qilindi`);
}

async function main(): Promise<void> {
  const file = requireImportFile("json_clean/cash_transactions.json");
  const movements = parseCleanCash(JSON.parse(fs.readFileSync(file, "utf8")));
  const totals = cleanCashTotals(movements);

  console.log(`\nManba: ${file}`);
  console.log(
    `Fayl: ${totals.rows} qator · kirim ${totals.inCount} / ${som(totals.totalIn)} · ` +
      `chiqim ${totals.outCount} / ${som(totals.totalOut)} · komissiya ${som(totals.totalFee)}`
  );
  console.log(`Kassalar: ${totals.registers.length} ta · qoldiq ${som(totals.balance)}\n`);

  // ── 1. REGISTR → KANAL ───────────────────────────────────────────────
  // Kanal AVTOMATIK OCHILMAYDI. Prodda bir odamga ikki kanal ochilib qolgan
  // holat bor (60 kanal / 31 odam), yangisini ochish uni battar qiladi.
  // Mos kelmagan registr bo'lsa — hech narsa yozmay to'xtaymiz.
  const channels = await prisma.disbursementChannel.findMany({
    where: { type: "employee_card" },
    select: { id: true, label: true },
  });

  const channelByRegister = new Map<string, string>();
  const unresolved: string[] = [];
  for (const register of totals.registers) {
    const hits = resolveRegister(register, channels);
    if (hits.length === 1) channelByRegister.set(register, hits[0].id);
    else unresolved.push(`${register} — ${hits.length ? `${hits.length} nomzod: ${hits.map((h) => h.label).join(", ")}` : "kanal topilmadi"}`);
  }

  if (unresolved.length) {
    console.error(`Kanal aniqlanmadi (${unresolved.length}):`);
    for (const u of unresolved) console.error(`   ${u}`);
    console.error("\nImport to'xtatildi — kanalsiz pul boshqa odamga yozilib ketishi mumkin.");
    process.exit(1);
  }
  console.log(`Kanallar: ${channelByRegister.size}/${totals.registers.length} aniq mos keldi`);

  // ── 2. KASSA BALANSLARI ──────────────────────────────────────────────
  const balances = [...balanceByRegister(movements)].filter(([, v]) => Math.abs(v) >= 1);
  console.log(
    `Nolda yopilmagan kassa: ${balances.length} ta` +
      (balances.length ? ` — ${balances.map(([r, v]) => `${r} ${som(v)}`).join(", ")}` : "")
  );

  // ── 3. ESKI QATORLAR ─────────────────────────────────────────────────
  if (replace) await purgeLegacy();
  else {
    const legacy = await prisma.transitEntry.count({
      where: { dedupKey: { startsWith: LEGACY_PREFIX } },
    });
    if (legacy) {
      console.error(
        `\n${legacy} ta eski avgust qatori turibdi (${LEGACY_PREFIX}…). Ular buzuq manbadan ` +
          `kelgan va yonma-yon qolsa avgust ikki barobar ko'rinadi.\nQayta import: --replace`
      );
      process.exit(1);
    }
  }

  if (dryRun) {
    console.log("\n--dry-run: hech narsa yozilmadi.");
    return;
  }

  // ── 4. YOZISH ────────────────────────────────────────────────────────
  let written = 0;
  let posted = 0;
  for (const m of movements) {
    const channelId = channelByRegister.get(m.register)!;
    const source = m.company ? `${m.company} dan` : "Manba ko'rsatilmagan";

    if (m.amountIn > 0) {
      await prisma.transitEntry.upsert({
        where: { dedupKey: key(m, "in") },
        create: {
          dedupKey: key(m, "in"),
          channelId,
          direction: "in",
          amount: m.amountIn,
          date: m.date,
          description: source,
        },
        update: { amount: m.amountIn, date: m.date, description: source },
      });
      written++;
    }

    // DIQQAT: 151 qatordan 85 tasida kirim ham, chiqim ham bor ("oldim va
    // darhol oylikka berdim"). Shuning uchun bu yerda `continue` yo'q.
    for (const part of [
      m.amountOut > 0
        ? {
            dir: "out" as const,
            amount: m.amountOut,
            category: m.purpose ?? "Boshqa xarajatlar",
            description: [m.purpose, m.note].filter(Boolean).join(" — ") || null,
          }
        : null,
      m.bankFee > 0
        ? {
            dir: "fee" as const,
            amount: m.bankFee,
            category: "bank_komissiya",
            description: "Bank komissiyasi",
          }
        : null,
    ]) {
      if (!part) continue;
      const dedupKey = key(m, part.dir);
      const row = await prisma.transitEntry.upsert({
        where: { dedupKey },
        create: {
          dedupKey,
          channelId,
          direction: "out",
          amount: part.amount,
          date: m.date,
          category: part.category,
          description: part.description,
        },
        update: { amount: part.amount, date: m.date },
        select: { id: true, kassaEntryId: true },
      });
      written++;

      if (!withExpenses) continue;

      // Kartadan sarflangan pul — HAQIQIY xarajat: KassaEntry + jurnal.
      // Kalit daftar qatori bilan bir xil, ya'ni qayta ishga tushirish
      // ikkinchi nusxa yozmaydi.
      const res = await runCashTx((tx) =>
        recordKassaMovement(tx, actor, {
          type: "expense",
          category: part.category,
          amount: part.amount,
          date: m.date,
          description: `${m.register}: ${part.description ?? part.category}`,
          channelId,
          dedupKey,
          // Oylik / ta'sischiga taqsimot / operatsion — uchalasi boshqa
          // hisobga (`lib/expenseAccount.ts`).
          expenseAccount: ACCOUNTS[expenseAccountFor(part.category)],
        })
      );
      if (!res.alreadyRecorded) posted++;
      if (!row.kassaEntryId) {
        await prisma.transitEntry.update({ where: { id: row.id }, data: { kassaEntryId: res.id } });
      }
    }
  }

  console.log(`\nTransitEntry yozildi: ${written}`);
  if (withExpenses) console.log(`KassaEntry (xarajat) yozildi: ${posted}`);

  // ── 5. TEKSHIRUV ─────────────────────────────────────────────────────
  // Yozgandan keyin bazani fayl bilan solishtiramiz. Mos kelmasa — import
  // yarim qolgan degani va buni JIM o'tkazib yubormaymiz.
  const check = await prisma.transitEntry.groupBy({
    by: ["direction"],
    where: { dedupKey: { startsWith: `clean:${PERIOD}:` } },
    _sum: { amount: true },
    _count: true,
  });
  const got = (dir: string) => {
    const r = check.find((c) => c.direction === dir);
    return { count: r?._count ?? 0, sum: Number(r?._sum.amount ?? 0) };
  };
  const inDb = got("in");
  const outDb = got("out");
  const expectedOut = totals.totalOut + totals.totalFee;

  console.log(`\nBazada: kirim ${inDb.count} / ${som(inDb.sum)} · chiqim ${outDb.count} / ${som(outDb.sum)}`);
  console.log(`Faylda: kirim ${totals.inCount} / ${som(totals.totalIn)} · chiqim+komissiya ${som(expectedOut)}`);

  const ok =
    inDb.count === totals.inCount &&
    Math.abs(inDb.sum - totals.totalIn) < 1 &&
    Math.abs(outDb.sum - expectedOut) < 1;
  if (!ok) {
    console.error("\n✗ Baza fayl bilan mos kelmadi — import ishonchsiz.");
    process.exit(1);
  }
  console.log("\n✓ Baza fayl bilan tiyinigacha mos keldi.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
