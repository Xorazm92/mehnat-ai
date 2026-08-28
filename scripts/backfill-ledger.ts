// =====================================================
// JURNAL BACKFILL — jurnalga tushmagan pul qatorlari
// =====================================================
//
// NIMA UCHUN KERAK. Jurnal (`lib/ledger.ts`) mavjud edi, lekin MAJBURIY emas:
// import va skript yo'llari `postLedger` ni chetlab o'tib to'g'ridan-to'g'ri
// `create` qilardi. Natijada bir qism pul qatorining ikki tomonlama yozuvda
// izi yo'q va ikkita "haqiqat" paydo bo'ldi:
//
//     lib/balance.ts   jadval agregatlari   ← chiqimni bloklashda ishlatiladi
//     lib/ledger.ts    jurnal qoldig'i      ← oy/yil yopishda muhrlanadi
//
// Yangi yozuvlar endi `lib/cashGate.ts` darvozasidan o'tadi, ya'ni bo'shliq
// KENGAYMAYDI. Bu skript esa MAVJUD bo'shliqni yopadi.
//
// XAVFSIZLIK QOIDALARI (scripts/recovery-b4-cancel.ts naqshi):
//   * standart holat DRY-RUN — `--apply` bo'lmasa bitta ham qator yozilmaydi;
//   * YOPIQ DAVRGA yozmaydi: LOCKED/CLOSING davr uchrasa TO'XTAYDI va
//     reopen runbook'ini aytadi (yopiq davrga jurnal qatori qo'shish
//     `FinancialSnapshot.ledgerBalance` ni jimgina yolg'onga aylantiradi —
//     trigger snapshot QATORINI himoya qiladi, uning ostidagi jurnalni emas);
//   * har `--apply` kvitansiya fayli yozadi (`.recovery/`), va
//     `--rollback --receipt <fayl>` o'sha tranzaksiyalarni TESKARILAYDI
//     (jismonan o'chirmaydi — jurnal append-only);
//   * idempotent: `postLedger` manba bo'yicha ochiq netto bo'lsa rad etadi,
//     ya'ni ikkinchi marta yurgizish dublikat yozmaydi;
//   * KELAJAK DAVRGA yozmaydi. Prodda 39 ta `obed:` (tushlik) qatori
//     Excel importidan 2026-12 sanasi bilan tushgan — bugun esa 2026-08.
//     Ularni jurnalga qo'ysak, hali sarflanmagan pul sarflangan bo'lib
//     qoladi va dekabr qoldig'i noto'g'ri chiqadi. Bu MA'LUMOT xatosi
//     (manba Excel'dagi sana), backfill uni yashirmasligi kerak — shuning
//     uchun chetlanadi va alohida sanab ko'rsatiladi. Chegarani bilib
//     turib surish uchun `--until YYYY-MM`.
//
// ISHLATISH:
//   npx tsx scripts/backfill-ledger.ts                 # dry-run hisoboti
//   npx tsx scripts/backfill-ledger.ts --json          # mashina formati
//   npx tsx scripts/backfill-ledger.ts --apply         # yozadi + kvitansiya
//   npx tsx scripts/backfill-ledger.ts --rollback --receipt .recovery/x.json
//   npx tsx scripts/backfill-ledger.ts --until 2026-09     # chegarani surish

import "./load-env";
import { prisma } from "@/lib/prisma";
import { periodKeyOf } from "@/lib/periods";
import { formatNum as som } from "@/lib/format";
import { ACCOUNTS, postLedger, reverseLedger, type LedgerLeg } from "@/lib/ledger";
import { PERIOD_STATUS } from "@/lib/periodLock";
import { serializable } from "@/lib/tx";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

const APPLY = process.argv.includes("--apply");
const JSON_OUT = process.argv.includes("--json");
const ROLLBACK = process.argv.includes("--rollback");
const receiptArg = process.argv.indexOf("--receipt");
const RECEIPT_PATH = receiptArg >= 0 ? process.argv[receiptArg + 1] : null;
const untilArg = process.argv.indexOf("--until");
const UNTIL_PERIOD =
  untilArg >= 0 && /^\d{4}-\d{2}$/.test(process.argv[untilArg + 1] ?? "")
    ? process.argv[untilArg + 1]
    : periodKeyOf(new Date());



interface Candidate {
  sourceTable: string;
  sourceId: string;
  period: string;
  amount: number;
  legs: LedgerLeg[];
  description: string;
}

// ─────────────────────────────────────────────────────────
// NOMZODLARNI YIG'ISH — manba → jurnal yo'nalishida
// ─────────────────────────────────────────────────────────
//
// DIQQAT: yo'nalish MUHIM. `lib/monthClose.ts` dagi yaxlitlik tekshiruvi
// JURNALDAN manbaga yuradi, shuning uchun jurnalda UMUMAN qatori bo'lmagan
// manbani ko'rmaydi — aynan shu ko'r nuqta bo'shliqni yashirib turgan edi.

async function collect(): Promise<Candidate[]> {
  const out: Candidate[] = [];

  /**
   * Manba jurnalda AKS ETGANMI — "qatori bormi" EMAS, "nettosi nolmi".
   *
   * Farq muhim: post → reversal qilingan qatorning jurnalda izi BOR, lekin
   * pul jarayoni aks etmagan (netto nol). "Qatori bormi" deb tekshirilganda
   * backfill rollback qilingandan keyin o'sha qatorlarni QAYTA KO'RMASDI —
   * ya'ni rollback amalda qaytarib bo'lmas bo'lib qolardi.
   *
   * Netto HISOB KESIMIDA sanaladi: bitta tranzaksiyaning barcha oyoqlari
   * bo'yicha yig'indi ta'rifan nol (Σdebit == Σcredit), shuning uchun
   * `sourceId` bo'yicha yalpi yig'indi hech qachon signal bermaydi.
   */
  const coveredIds = async (sourceTable: string, ids: string[]) => {
    if (ids.length === 0) return new Set<string>();
    const rows = await prisma.ledgerEntry.groupBy({
      by: ["sourceId", "accountId"],
      where: { sourceTable: { in: [sourceTable, `${sourceTable}-reversal`] }, sourceId: { in: ids } },
      _sum: { debit: true, credit: true },
    });
    const covered = new Set<string>();
    for (const r of rows) {
      const net = Number(r._sum.debit ?? 0) - Number(r._sum.credit ?? 0);
      if (Math.abs(net) > 0.005 && r.sourceId) covered.add(r.sourceId);
    }
    return covered;
  };

  // ── KassaEntry ────────────────────────────────────────
  const kassa = await prisma.kassaEntry.findMany({
    where: { deletedAt: null, status: "approved" },
    select: { id: true, type: true, category: true, amount: true, date: true, channelId: true },
  });
  const kassaSeen = await coveredIds("KassaEntry", kassa.map((k) => k.id));
  for (const k of kassa) {
    if (kassaSeen.has(k.id)) continue;
    const amount = Number(k.amount);
    if (!(amount > 0)) continue;
    out.push({
      sourceTable: "KassaEntry",
      sourceId: k.id,
      period: periodKeyOf(k.date),
      amount,
      description: `Kassa ${k.type === "income" ? "kirim" : "chiqim"}: ${k.category}`,
      legs:
        k.type === "income"
          ? [
              { accountId: ACCOUNTS.CASH, debit: amount, channelId: k.channelId },
              { accountId: ACCOUNTS.KASSA_INCOME, credit: amount },
            ]
          : [
              { accountId: ACCOUNTS.OPERATING_EXPENSE, debit: amount },
              { accountId: ACCOUNTS.CASH, credit: amount, channelId: k.channelId },
            ],
    });
  }

  // ── Payment (tushgan pul: paid | partial) ─────────────
  const payments = await prisma.payment.findMany({
    where: { deletedAt: null, status: { in: ["paid", "partial"] } },
    select: { id: true, amount: true, period: true, companyId: true },
  });
  const paySeen = await coveredIds("Payment", payments.map((p) => p.id));
  for (const p of payments) {
    if (paySeen.has(p.id)) continue;
    const amount = Number(p.amount);
    if (!(amount > 0)) continue;
    if (!/^\d{4}-\d{2}$/.test(p.period)) continue; // buzuq davr — qo'lda hal qilinsin
    out.push({
      sourceTable: "Payment",
      sourceId: p.id,
      period: p.period,
      amount,
      description: `Shartnoma to'lovi (${p.period})`,
      legs: [
        { accountId: ACCOUNTS.CASH, debit: amount },
        { accountId: ACCOUNTS.CONTRACT_INCOME, credit: amount, subjectId: p.companyId },
      ],
    });
  }

  // ── Payout ────────────────────────────────────────────
  const payouts = await prisma.payout.findMany({
    where: { deletedAt: null },
    select: { id: true, amount: true, month: true, paidAt: true, employeeId: true },
  });
  const outSeen = await coveredIds("Payout", payouts.map((p) => p.id));
  for (const p of payouts) {
    if (outSeen.has(p.id)) continue;
    const amount = Number(p.amount);
    if (!(amount > 0)) continue;
    const period = /^\d{4}-\d{2}$/.test(p.month) ? p.month : periodKeyOf(p.paidAt);
    out.push({
      sourceTable: "Payout",
      sourceId: p.id,
      period,
      amount,
      description: `Oylik to'lovi (${period})`,
      legs: [
        { accountId: ACCOUNTS.SALARY_EXPENSE, debit: amount, subjectId: p.employeeId },
        { accountId: ACCOUNTS.CASH, credit: amount },
      ],
    });
  }

  return out;
}

/** Yopiq davrlar — bularga jurnal qatori QO'SHILMAYDI. */
async function lockedPeriods(): Promise<Set<string>> {
  const rows = await prisma.accountingPeriod.findMany({
    where: {
      companyId: null,
      status: { in: [PERIOD_STATUS.LOCKED, PERIOD_STATUS.CLOSING] },
    },
    select: { year: true, month: true, status: true },
  });
  return new Set(rows.map((r) => `${r.year}-${String(r.month).padStart(2, "0")}`));
}

// ─────────────────────────────────────────────────────────

async function rollback(): Promise<void> {
  if (!RECEIPT_PATH) throw new Error("--rollback uchun --receipt <fayl> kerak");
  const receipt = JSON.parse(readFileSync(RECEIPT_PATH, "utf8")) as {
    posted: { sourceTable: string; sourceId: string }[];
  };
  console.log(`Kvitansiya: ${RECEIPT_PATH} — ${receipt.posted.length} ta yozuv`);
  if (!APPLY) {
    console.log("DRY-RUN: teskarilash uchun `--rollback --receipt <fayl> --apply`");
    return;
  }
  let done = 0;
  for (const item of receipt.posted) {
    await serializable(async (db) => {
      const id = await reverseLedger(db, {
        sourceTable: item.sourceTable,
        sourceId: item.sourceId,
        reason: "backfill rollback",
      });
      if (id) done++;
    });
  }
  console.log(`✔ ${done} ta yozuv teskarilandi (append-only — asl qatorlar joyida).`);
}

async function main(): Promise<void> {
  if (ROLLBACK) return rollback();

  const [candidates, locked] = await Promise.all([collect(), lockedPeriods()]);

  const blocked = candidates.filter((c) => locked.has(c.period));
  // Davr kaliti "YYYY-MM" — leksik solishtirish xronologik solishtirishga teng.
  const future = candidates.filter((c) => !locked.has(c.period) && c.period > UNTIL_PERIOD);
  const writable = candidates.filter((c) => !locked.has(c.period) && c.period <= UNTIL_PERIOD);

  const byTable = new Map<string, { count: number; total: number }>();
  for (const c of candidates) {
    const cur = byTable.get(c.sourceTable) ?? { count: 0, total: 0 };
    cur.count++;
    cur.total += c.amount;
    byTable.set(c.sourceTable, cur);
  }
  const byPeriod = new Map<string, number>();
  for (const c of candidates) byPeriod.set(c.period, (byPeriod.get(c.period) ?? 0) + 1);

  if (JSON_OUT) {
    console.log(
      JSON.stringify(
        {
          mode: APPLY ? "apply" : "dry-run",
          candidates: candidates.length,
          writable: writable.length,
          blockedByLockedPeriod: blocked.length,
          skippedFuturePeriod: future.length,
          until: UNTIL_PERIOD,
          byTable: Object.fromEntries(byTable),
          byPeriod: Object.fromEntries([...byPeriod].sort()),
        },
        null,
        2
      )
    );
  } else {
    console.log("\n━━━ JURNAL BACKFILL " + (APPLY ? "(APPLY)" : "(DRY-RUN)") + " ━━━━━━━━━━━━━━━\n");
    if (candidates.length === 0) {
      console.log("  ✓ Jurnalda izi yo'q qator topilmadi — bo'shliq yopiq.\n");
    } else {
      console.log("  Manba jadval bo'yicha:");
      for (const [table, v] of [...byTable].sort((a, b) => b[1].total - a[1].total)) {
        console.log(`    ${table.padEnd(12)} ${String(v.count).padStart(5)} ta   ${som(v.total).padStart(18)} so'm`);
      }
      console.log("\n  Davr bo'yicha:");
      for (const [p, n] of [...byPeriod].sort()) {
        const mark = locked.has(p) ? "  ← YOPIQ DAVR" : "";
        console.log(`    ${p}   ${String(n).padStart(5)} ta${mark}`);
      }
      console.log(
        `\n  Yozish mumkin : ${writable.length} ta` +
          `\n  Bloklangan    : ${blocked.length} ta (yopiq davr)` +
          `\n  Kelajak davr  : ${future.length} ta (${UNTIL_PERIOD} dan keyin — yozilmaydi)`
      );
      if (future.length > 0) {
        const futureTotal = future.reduce((s, c) => s + c.amount, 0);
        console.log(
          `\n  ⚠ ${future.length} ta qator KELAJAK davrga tegishli (${som(futureTotal)} so'm).\n` +
            "    Bu backfill muammosi emas — MANBA sanasi noto'g'ri (odatda Excel\n" +
            "    importidagi yil). Avval o'sha qatorlarning sanasini tuzating, keyin\n" +
            "    shu skriptni qayta yurgizing. Bilib turib yozish uchun: --until <davr>"
        );
      }
    }
  }

  if (blocked.length > 0) {
    console.error(
      `\n✖ ${blocked.length} ta qator YOPIQ davrga tegishli. Backfill to'xtatildi.\n` +
        "  Yopiq davrga jurnal qatori qo'shish snapshot qoldig'ini jimgina yolg'onga\n" +
        "  aylantiradi. To'g'ri yo'l:\n" +
        "    1) superadmin o'sha davrni reopen qiladi (server/monthClosing.ts);\n" +
        "    2) shu skript --apply bilan yuritiladi;\n" +
        "    3) davr qayta yopiladi.\n"
    );
    if (APPLY) process.exitCode = 1;
    return;
  }

  if (!APPLY) {
    console.log("\n  DRY-RUN — hech narsa yozilmadi. Yozish uchun: --apply\n");
    return;
  }

  const posted: { sourceTable: string; sourceId: string; transactionId: string }[] = [];
  const failed: { sourceTable: string; sourceId: string; error: string }[] = [];

  for (const c of writable) {
    try {
      const transactionId = await serializable((db) =>
        postLedger(db, {
          legs: c.legs,
          period: c.period,
          sourceTable: c.sourceTable,
          sourceId: c.sourceId,
          description: c.description,
        })
      );
      posted.push({ sourceTable: c.sourceTable, sourceId: c.sourceId, transactionId });
    } catch (e) {
      failed.push({ sourceTable: c.sourceTable, sourceId: c.sourceId, error: (e as Error).message });
    }
  }

  const path = `.recovery/ledger-backfill-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ at: new Date().toISOString(), posted, failed }, null, 2));

  console.log(`\n  ✔ Yozildi   : ${posted.length} ta`);
  if (failed.length) {
    console.log(`  ✖ Yiqildi   : ${failed.length} ta`);
    for (const f of failed.slice(0, 5)) console.log(`      ${f.sourceTable}/${f.sourceId}: ${f.error}`);
  }
  console.log(`  Kvitansiya : ${path}`);
  console.log(`  Qaytarish  : npx tsx scripts/backfill-ledger.ts --rollback --receipt ${path} --apply\n`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
