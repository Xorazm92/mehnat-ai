/**
 * B4 · 3-BOSQICH — BEKOR QILISHDAN KEYINGI TEKSHIRUV (qat'iy READ-ONLY)
 * =====================================================================
 * 1-bosqich saqlagan baseline bilan solishtiradi va MOLIYAVIY HOLAT
 * O'ZGARMAGANINI isbotlaydi. Hech narsa yozmaydi.
 *
 * ISHLATISH:
 *   npx tsx scripts/recovery-b4-postcheck.ts --baseline .recovery/b4-baseline.json
 */
import "./load-env";
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { OPEN_OBLIGATION_STATUSES } from "@/lib/engines/workflow/obligationWorkflow";
import { B4_CRITERIA, readFinancialBaseline, type FinancialBaseline } from "./recovery-b4-preview";

interface Baseline {
  candidateIds: string[];
  candidateCount: number;
  realOverdueTotal: number;
  m08Total: number;
  baseline: FinancialBaseline;
}

const num = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

let failed = 0;
function check(label: string, actual: number | string, expected: number | string): void {
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(
    `     ${ok ? "✓" : "✗"} ${label.padEnd(38)} ${String(actual).padStart(16)}  (kutilgan ${expected})`,
  );
}

async function main(): Promise<void> {
  const p = arg("--baseline");
  if (!p) throw new Error("--baseline <fayl> majburiy.");
  const b = JSON.parse(readFileSync(p, "utf8")) as Baseline;
  const now = new Date();

  console.log();
  console.log("╔════════════════════════════════════════════════════════════════════════╗");
  console.log("║  B4 · 3-BOSQICH — POST-CHECK                       (READ-ONLY)         ║");
  console.log("╚════════════════════════════════════════════════════════════════════════╝");
  console.log();

  // ── Majburiyat holati ─────────────────────────────────────────────────
  const [cancelledInList, stillOpenInList, falsePayrollOpen, realOverdue, m08] = await Promise.all([
    prisma.obligation.count({ where: { id: { in: b.candidateIds }, status: "cancelled" } }),
    prisma.obligation.count({ where: { id: { in: b.candidateIds }, status: { in: OPEN_OBLIGATION_STATUSES } } }),
    prisma.obligation.count({
      where: {
        periodKey: B4_CRITERIA.periodKey,
        status: { in: OPEN_OBLIGATION_STATUSES },
        template: { code: { in: [...B4_CRITERIA.templateCodes] } },
      },
    }),
    prisma.obligation.count({
      where: {
        dueAt: { lt: now },
        status: { in: OPEN_OBLIGATION_STATUSES },
        template: { code: { notIn: [...B4_CRITERIA.templateCodes] } },
      },
    }),
    prisma.obligation.count({ where: { periodKey: "2026-M08" } }),
  ]);

  console.log("  ── MAJBURIYATLAR ───────────────────────────────────────────────────");
  console.log(`     before count                            ${String(b.candidateCount).padStart(16)}`);
  console.log(`     updated count (ro'yxatda cancelled)     ${String(cancelledInList).padStart(16)}`);
  console.log(`     after count (ro'yxatda hali ochiq)      ${String(stillOpenInList).padStart(16)}`);
  console.log();
  check("false PAYROLL open/overdue", falsePayrollOpen, 0);
  check("real overdue", realOverdue, b.realOverdueTotal);
  check("M08 obligations", m08, b.m08Total);
  console.log();

  // ── Hard delete bo'lmaganini isbotlash ────────────────────────────────
  const stillExist = await prisma.obligation.count({ where: { id: { in: b.candidateIds } } });
  check("yozuvlar saqlanib qolgan (delete YO'Q)", stillExist, b.candidateCount);

  const events = await prisma.obligationStatusEvent.count({
    where: { obligationId: { in: b.candidateIds }, toStatus: "cancelled" },
  });
  const audits = await prisma.auditLog.count({
    where: { tableName: "Obligation", recordId: { in: b.candidateIds }, action: "update" },
  });
  console.log(`     ℹ status hodisalari (cancelled)         ${String(events).padStart(16)}`);
  console.log(`     ℹ audit yozuvlari                       ${String(audits).padStart(16)}`);
  console.log();

  // ── Moliyaviy holat O'ZGARMAGANI ──────────────────────────────────────
  const after = await readFinancialBaseline();
  const before = b.baseline;

  console.log("  ── MOLIYA (o'zgarmasligi SHART) ────────────────────────────────────");
  check("KassaEntry qator", after.kassaCount, before.kassaCount);
  check("KassaEntry summa", num(after.kassaSum), num(before.kassaSum));
  check("Payment qator", after.paymentCount, before.paymentCount);
  check("Payment summa", num(after.paymentSum), num(before.paymentSum));
  check("LedgerEntry qator", after.ledgerRows, before.ledgerRows);
  check("Jurnal debet", num(after.ledgerDebit), num(before.ledgerDebit));
  check("Jurnal kredit", num(after.ledgerCredit), num(before.ledgerCredit));
  check("Jurnal CASH qoldig'i", num(after.ledgerCashBalance), num(before.ledgerCashBalance));
  check("Manba balansi", num(after.sourceBalance), num(before.sourceBalance));
  console.log();

  if (failed > 0) {
    console.error(`  ✗ ${failed} ta tekshiruv YIQILDI — holatni ko'rib chiqing.`);
    console.error("    Orqaga qaytarish:");
    console.error(`      npx tsx scripts/recovery-b4-cancel.ts --baseline ${p} --rollback --apply`);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log("  ✓ Barcha post-check tekshiruvlari o'tdi.");
  console.log("    Moliyaviy holat bitta tiyinga ham o'zgarmadi.");
  console.log();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\n✗ b4-postcheck yiqildi:", e instanceof Error ? e.message : e);
  await prisma.$disconnect().catch(() => {});
  process.exit(2);
});
