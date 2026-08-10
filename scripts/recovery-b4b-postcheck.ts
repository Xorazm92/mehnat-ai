/**
 * B4b · 3-BOSQICH — TOZALASHDAN KEYINGI TEKSHIRUV (qat'iy READ-ONLY)
 * ==================================================================
 * Kuygan kalitlar ketganini va TEGILMASLIGI kerak bo'lgan hamma narsa
 * o'zgarmaganini isbotlaydi. Hech narsa yozmaydi.
 *
 * ISHLATISH:
 *   npx tsx scripts/recovery-b4b-postcheck.ts --baseline .recovery/b4b-baseline.json
 */
import "./load-env";
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { OPEN_OBLIGATION_STATUSES } from "@/lib/obligationWorkflow";
import { escalationDedupKey } from "@/lib/escalation";

const PAYROLL_CODES = ["PAYROLL_CALC", "PAYROLL_POSTED"] as const;
const MILESTONES = ["D-5", "D-3", "D-1", "due", "overdue:L1"] as const;

interface Baseline {
  realOverdueCount: number;
  realOverdueIds: string[];
  totalCandidates: number;
  candidateDeliveryIds: string[];
  baseline: {
    notificationCount: number;
    obligationCount: number;
    notificationDeliveryCount: number;
    kassaCount: number;
    paymentCount: number;
    ledgerCount: number;
    auditCount: number;
    statusEventCount: number;
  };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

let failed = 0;
function check(label: string, actual: number | string, expected: number | string): void {
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`     ${ok ? "✓" : "✗"} ${label.padEnd(36)} ${String(actual).padStart(10)}  (kutilgan ${expected})`);
}

async function main(): Promise<void> {
  const p = arg("--baseline");
  if (!p) throw new Error("--baseline <fayl> majburiy.");
  const b = JSON.parse(readFileSync(p, "utf8")) as Baseline;
  const now = new Date();

  console.log();
  console.log("╔════════════════════════════════════════════════════════════════════════╗");
  console.log("║  B4b · 3-BOSQICH — POST-CHECK                      (READ-ONLY)         ║");
  console.log("╚════════════════════════════════════════════════════════════════════════╝");
  console.log();

  // ── Qamrov o'zgarmagani ───────────────────────────────────────────────
  const realOverdue = await prisma.obligation.count({
    where: {
      dueAt: { lt: now },
      status: { in: OPEN_OBLIGATION_STATUSES },
      template: { code: { notIn: [...PAYROLL_CODES] } },
    },
  });
  console.log("  ── QAMROV ──────────────────────────────────────────────────────────");
  check("real overdue", realOverdue, b.realOverdueCount);
  console.log();

  // ── Kuygan kalitlar ketdimi ───────────────────────────────────────────
  console.log("  ── KUYGAN KALITLAR (hammasi 0 bo'lishi shart) ──────────────────────");
  const ids = b.realOverdueIds;
  for (const m of MILESTONES) {
    const keys = ids.map((id) => `obligation:${id}:reminder:${m}`);
    const n = await prisma.notificationDelivery.count({
      where: { dedupKey: { in: keys }, channel: { in: ["inapp", "telegram"] } },
    });
    check(`burned ${m}`, n, 0);
  }
  for (const lvl of [1, 2] as const) {
    const keys = ids.map((id) => escalationDedupKey("obligation", id, lvl));
    const n = await prisma.notificationDelivery.count({
      where: { dedupKey: { in: keys }, channel: "escalation" },
    });
    check(`burned escalation:L${lvl}`, n, 0);
  }
  console.log();

  // ── TEGILMASLIGI kerak bo'lganlar ─────────────────────────────────────
  console.log("  ── TEGILMAGANI ISBOTI ──────────────────────────────────────────────");
  const [notif, obl, kassa, payment, ledger, audit, statusEvents, deliveries] = await Promise.all([
    prisma.notification.count(),
    prisma.obligation.count(),
    prisma.kassaEntry.count(),
    prisma.payment.count(),
    prisma.ledgerEntry.count(),
    prisma.auditLog.count(),
    prisma.obligationStatusEvent.count(),
    prisma.notificationDelivery.count(),
  ]);
  check("Notification count", notif, b.baseline.notificationCount);
  check("Obligation count", obl, b.baseline.obligationCount);
  check("KassaEntry count", kassa, b.baseline.kassaCount);
  check("Payment count", payment, b.baseline.paymentCount);
  check("LedgerEntry count", ledger, b.baseline.ledgerCount);
  check("AuditLog count", audit, b.baseline.auditCount);
  check("ObligationStatusEvent count", statusEvents, b.baseline.statusEventCount);
  console.log();

  // NotificationDelivery esa AYNAN nomzodlar soniga kamayishi kerak.
  console.log("  ── NOTIFICATIONDELIVERY BALANSI ────────────────────────────────────");
  console.log(`     before                                 ${String(b.baseline.notificationDeliveryCount).padStart(10)}`);
  console.log(`     o'chirilishi kerak edi                  ${String(b.totalCandidates).padStart(10)}`);
  check(
    "after = before − nomzodlar",
    deliveries,
    b.baseline.notificationDeliveryCount - b.totalCandidates,
  );
  const leftover = await prisma.notificationDelivery.count({ where: { id: { in: b.candidateDeliveryIds } } });
  check("nomzod qatorlaridan qolgani", leftover, 0);
  console.log();

  // ── Duplicate protection hali ishlayotganini tekshirish ───────────────
  console.log("  ── DUBLIKAT HIMOYASI ───────────────────────────────────────────────");
  const dupIdx = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes
     WHERE tablename = 'NotificationDelivery' AND indexdef LIKE '%UNIQUE%'
       AND indexdef LIKE '%channel%' AND indexdef LIKE '%dedupKey%'`;
  check("unique(channel, dedupKey) o'rnida", dupIdx.length > 0 ? "ha" : "YO'Q", "ha");

  const dupRows = await prisma.$queryRaw<{ cnt: bigint }[]>`
    SELECT coalesce(sum(c - 1), 0)::bigint AS cnt
      FROM (SELECT count(*) c FROM "NotificationDelivery"
             WHERE "dedupKey" IS NOT NULL
             GROUP BY channel, "dedupKey" HAVING count(*) > 1) x`;
  check("bazada dublikat", Number(dupRows[0]?.cnt ?? 0), 0);

  const verdicts = await prisma.notificationDelivery.count({ where: { channel: "verdict" } });
  console.log(`     ℹ verdict kanali (tegilmagan)          ${String(verdicts).padStart(10)}`);
  console.log();

  if (failed > 0) {
    console.error(`  ✗ ${failed} ta tekshiruv YIQILDI.`);
    console.error("    Orqaga qaytarish:");
    console.error(`      npx tsx scripts/recovery-b4b-clear.ts --baseline ${p} --rollback --apply`);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log("  ✓ Barcha post-check tekshiruvlari o'tdi.");
  console.log("    852 ta majburiyat yana eslatma va eskalatsiya olishi mumkin.");
  console.log();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\n✗ b4b-postcheck yiqildi:", e instanceof Error ? e.message : e);
  await prisma.$disconnect().catch(() => {});
  process.exit(2);
});
