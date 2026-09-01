// =====================================================
// TRANZIT CHIQIMINI KASSAGA BOG'LASH
// =====================================================
//
// MUAMMO. `lib/transit.ts` qoidasi: kartadan qilingan xarajat IKKI yozuv
// hosil qiladi — `TransitEntry(out)` (karta qoldig'i uchun) va
// `KassaEntry(expense)` (firma balansi uchun). Balans faqat ikkinchisini
// o'qiydi.
//
// Prodda 125 ta `TransitEntry(out)` bor va ularning HECH BIRIDA
// `kassaEntryId` yo'q: ma'lumot import skripti bilan to'g'ridan-to'g'ri
// yozilgan, `recordTransitOut` chetlab o'tilgan. Natijada 441 753 336 so'mlik
// haqiqiy xarajat firma balansida UMUMAN ko'rinmaydi va balans shu summaga
// ORTIQCHA turibdi.
//
// TASNIF. Toifalar ikki guruhga bo'linadi va ular boshqa hisobga tushadi:
//
//   salary     — "Oylik", "O'ziga oylik" → SALARY_EXPENSE. Mehnat haqi
//                  operatsion xarajat emas, aks holda foyda tahlili buziladi.
//   owner      — "Otabek akaga" → OWNER_DISTRIBUTION. 2026-09-01 biznes
//                  qarori: bu foyda taqsimoti, xarajat EMAS. Ilgari bu yerda
//                  oylik deb tasniflanardi.
//   operating  — ovqat, texnika, bank komissiyasi va h.k. (22 ta / 20.2 mln)
//                → OPERATING_EXPENSE.
//
// Har yozuv `lib/cashGate.ts` darvozasidan o'tadi, ya'ni jurnal qatori ham
// birga yoziladi — bu qatorlar uchun alohida backfill KERAK EMAS.
//
// XAVFSIZLIK:
//   * standart DRY-RUN, `--apply` majburiy;
//   * `dedupKey = "transit:<id>"` — ikkinchi marta yurgizish dublikat yozmaydi;
//   * yopiq davr uchrasa darvoza o'zi to'xtatadi (`assertPeriodOpen`);
//   * `--rollback --receipt <fayl>` bilan qaytariladi.
//
// ISHLATISH:
//   npx tsx scripts/link-transit-expenses.ts                     # dry-run, hammasi
//   npx tsx scripts/link-transit-expenses.ts --group operating --apply
//   npx tsx scripts/link-transit-expenses.ts --group salary --apply
//   npx tsx scripts/link-transit-expenses.ts --rollback --receipt .recovery/x.json --apply

import "./load-env";
import { prisma } from "@/lib/prisma";
import { formatNum as som } from "@/lib/platform/format";
import { ACCOUNTS, reverseLedger } from "@/lib/ledger";
import { expenseAccountFor } from "@/lib/expenseAccount";
import { recordKassaMovement, runCashTx, type CashActor } from "@/lib/cashGate";
import { serializable } from "@/lib/tx";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

const APPLY = process.argv.includes("--apply");
const ROLLBACK = process.argv.includes("--rollback");
const arg = (f: string) => {
  const i = process.argv.indexOf(f);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
};
const GROUP = (arg("--group") ?? "all") as "operating" | "salary" | "owner" | "all";
const RECEIPT_PATH = arg("--receipt");

const ACTOR: CashActor = { kind: "script", name: "link-transit-expenses" };

/** Mehnat haqi toifalari — foydalanuvchi tasdiqlagan ro'yxat. */
// Tasnif YAGONA manbadan (`lib/expenseAccount.ts`) — ilgari bu yerda o'z
// regexi bor edi va u "Otabek akaga" ni oylik deb bilardi.

/** Toifa qaysi guruhga tegishli — `lib/expenseAccount.ts` bilan bir xil qoida. */
function groupOf(category: string | null): "salary" | "owner" | "operating" {
  const account = expenseAccountFor(category ?? "");
  if (account === "OWNER_DISTRIBUTION") return "owner";
  if (account === "SALARY_EXPENSE") return "salary";
  return "operating";
}

interface Row {
  id: string;
  category: string | null;
  amount: number;
  date: Date;
  channelId: string;
  description: string | null;
  group: "salary" | "owner" | "operating";
}

async function collect(): Promise<Row[]> {
  const rows = await prisma.transitEntry.findMany({
    where: { direction: "out", kassaEntryId: null },
    select: { id: true, category: true, amount: true, date: true, channelId: true, description: true },
    orderBy: { date: "asc" },
  });
  return rows.map((r) => ({
    ...r,
    amount: Number(r.amount),
    group: groupOf(r.category),
  }));
}

async function rollback() {
  if (!RECEIPT_PATH) throw new Error("--rollback uchun --receipt <fayl> kerak");
  const receipt = JSON.parse(readFileSync(RECEIPT_PATH, "utf8")) as {
    linked: { transitId: string; kassaEntryId: string }[];
  };
  console.log(`Kvitansiya: ${RECEIPT_PATH} — ${receipt.linked.length} ta bog'lanish`);
  if (!APPLY) {
    console.log("DRY-RUN: qaytarish uchun `--rollback --receipt <fayl> --apply`");
    return;
  }
  let n = 0;
  for (const item of receipt.linked) {
    await serializable(async (db) => {
      await reverseLedger(db, {
        sourceTable: "KassaEntry",
        sourceId: item.kassaEntryId,
        reason: "transit bog'lanishi qaytarildi",
      });
      await db.kassaEntry.update({
        where: { id: item.kassaEntryId },
        data: { deletedAt: new Date(), deleteReason: "transit bog'lanishi qaytarildi", dedupKey: null },
      });
      await db.transitEntry.update({
        where: { id: item.transitId },
        data: { kassaEntryId: null },
      });
      n++;
    });
  }
  console.log(`✔ ${n} ta bog'lanish qaytarildi.`);
}

async function main() {
  if (ROLLBACK) return rollback();

  const all = await collect();
  const target = GROUP === "all" ? all : all.filter((r) => r.group === GROUP);

  const summarize = (rows: Row[]) => {
    const byCat = new Map<string, { n: number; sum: number }>();
    for (const r of rows) {
      const k = r.category ?? "(toifasiz)";
      const c = byCat.get(k) ?? { n: 0, sum: 0 };
      c.n++; c.sum += r.amount; byCat.set(k, c);
    }
    return [...byCat].sort((a, b) => b[1].sum - a[1].sum);
  };

  const sum = (rows: Row[]) => rows.reduce((s, r) => s + r.amount, 0);
  const salary = all.filter((r) => r.group === "salary");
  const owner = all.filter((r) => r.group === "owner");
  const operating = all.filter((r) => r.group === "operating");

  console.log("\n━━━ TRANZIT → KASSA " + (APPLY ? "(APPLY)" : "(DRY-RUN)") + " ━━━━━━━━━━━\n");
  console.log(`  Bog'lanmagan jami : ${all.length} ta · ${som(sum(all))} so'm`);
  console.log(`    oylik (SALARY_EXPENSE)    : ${salary.length} ta · ${som(sum(salary))} so'm`);
  console.log(`    ta'sischiga (OWNER_DISTR) : ${owner.length} ta · ${som(sum(owner))} so'm`);
  console.log(`    xarajat (OPERATING)       : ${operating.length} ta · ${som(sum(operating))} so'm`);
  console.log(`\n  Tanlangan guruh   : ${GROUP} — ${target.length} ta · ${som(sum(target))} so'm\n`);
  for (const [cat, v] of summarize(target)) {
    console.log(`    ${cat.padEnd(22)} ${String(v.n).padStart(4)} ta  ${som(v.sum).padStart(16)}`);
  }

  if (target.length === 0) {
    console.log("\n  Bog'lanmagan qator yo'q — ish tugagan.\n");
    return;
  }

  console.log(
    `\n  DIQQAT: bu yozuvlar balansni ${som(sum(target))} so'mga KAMAYTIRADI —` +
    `\n  pul haqiqatan chiqqan, hozir balans shu summaga ortiqcha ko'rsatmoqda.\n`
  );

  if (!APPLY) {
    console.log("  DRY-RUN — hech narsa yozilmadi. Yozish uchun: --apply\n");
    return;
  }

  const linked: { transitId: string; kassaEntryId: string }[] = [];
  const failed: { transitId: string; error: string }[] = [];

  for (const r of target) {
    try {
      await runCashTx(async (db) => {
        const res = await recordKassaMovement(db, ACTOR, {
          type: "expense",
          category: r.category ?? "boshqa",
          amount: r.amount,
          date: r.date,
          description: r.description ?? `Karta xarajati (tranzit ${r.id.slice(0, 8)})`,
          channelId: r.channelId,
          dedupKey: `transit:${r.id}`,
          expenseAccount:
            ACCOUNTS[expenseAccountFor(r.category ?? "")],
        });
        // Zanjirni yopamiz: endi tranzit qatori o'z kassa yozuvini biladi va
        // skript ikkinchi marta yurgizilsa uni umuman ko'rmaydi.
        await db.transitEntry.update({
          where: { id: r.id },
          data: { kassaEntryId: res.id },
        });
        linked.push({ transitId: r.id, kassaEntryId: res.id });
      });
    } catch (e) {
      failed.push({ transitId: r.id, error: (e as Error).message });
    }
  }

  const path = `.recovery/transit-link-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ at: new Date().toISOString(), group: GROUP, linked, failed }, null, 2));

  console.log(`  ✔ Bog'landi : ${linked.length} ta`);
  if (failed.length) {
    console.log(`  ✖ Yiqildi   : ${failed.length} ta`);
    for (const f of failed.slice(0, 5)) console.log(`      ${f.transitId}: ${f.error}`);
  }
  console.log(`  Kvitansiya  : ${path}`);
  console.log(`  Qaytarish   : npx tsx scripts/link-transit-expenses.ts --rollback --receipt ${path} --apply\n`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("✖", (e as Error).message);
    await prisma.$disconnect();
    process.exit(1);
  });
