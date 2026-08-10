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

interface B4bCandidateLite {
  obligationId: string;
  group: "overdue" | "future";
}

interface Baseline {
  overdueObligations: number;
  futureObligations: number;
  overdueCandidates: number;
  futureCandidates: number;
  totalCandidates: number;
  candidateDeliveryIds: string[];
  candidates: B4bCandidateLite[];
  baseline: {
    notificationCount: number;
    obligationCount: number;
    notificationDeliveryCount: number;
    verdictCount: number;
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
  const open = await prisma.obligation.findMany({
    where: {
      status: { in: OPEN_OBLIGATION_STATUSES },
      template: { code: { notIn: [...PAYROLL_CODES] } },
    },
    select: { id: true, dueAt: true },
  });
  const overdueIds = open.filter((o) => o.dueAt < now).map((o) => o.id);
  const futureIds = open.filter((o) => o.dueAt >= now).map((o) => o.id);

  console.log("  ── QAMROV ──────────────────────────────────────────────────────────");
  check("overdue obligations", overdueIds.length, b.overdueObligations);
  check("future obligations", futureIds.length, b.futureObligations);
  console.log();

  // ── Kuygan kalitlar ketdimi — IKKALA GURUH ────────────────────────────
  const groups: [string, string[]][] = [
    ["overdue", overdueIds],
    ["future", futureIds],
  ];
  for (const [label, ids] of groups) {
    console.log(`  ── KUYGAN KALITLAR · ${label} (hammasi 0 bo'lishi shart) ─────────────`);
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
  }

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
  check("verdict kanali (tegilmagan)", verdicts, b.baseline.verdictCount);
  console.log();

  // ── Siz so'ragan yakuniy ko'rinish ────────────────────────────────────
  console.log("  ── YAKUNIY ─────────────────────────────────────────────────────────");
  console.log(`     Notification rows touched  = ${notif - b.baseline.notificationCount}`);
  console.log(`     Obligation rows touched    = ${obl - b.baseline.obligationCount}`);
  console.log(
    `     Financial rows touched     = ${
      kassa - b.baseline.kassaCount + (payment - b.baseline.paymentCount) + (ledger - b.baseline.ledgerCount)
    }`,
  );
  console.log(`     AuditLog rows touched      = ${audit - b.baseline.auditCount}`);
  console.log(`     StatusEvent rows touched   = ${statusEvents - b.baseline.statusEventCount}`);
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
