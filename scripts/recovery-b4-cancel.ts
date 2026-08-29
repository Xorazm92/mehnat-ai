/**
 * B4 · 2-BOSQICH — SOXTA PAYROLL MAJBURIYATLARINI BEKOR QILISH
 * =============================================================
 * Standart holatda HECH NARSA yozmaydi (dry-run). Yozish uchun `--apply` shart.
 *
 * XAVFSIZLIK KAFOLATLARI:
 *   • Faqat 1-bosqich saqlagan MUZLATILGAN ID RO'YXATI ustida ishlaydi —
 *     so'rov qayta yurgizilmaydi, ya'ni oradan o'tgan vaqtda paydo bo'lgan
 *     yangi qatorlar tanlovga TUSHMAYDI.
 *   • Har bir ID qayta tekshiriladi: periodKey, shablon kodi, status ochiq,
 *     `canTransition(status → cancelled)` qonuniy.
 *   • Bitta tranzaksiya. Ta'sirlangan qator soni kutilgandan farq qilsa —
 *     xato tashlanadi va butun tranzaksiya ROLLBACK bo'ladi.
 *   • HARD DELETE YO'Q. Faqat status + completedAt. Dalil (submissions,
 *     financialReports, statusEvents) tegilmaydi.
 *   • Audit izi: har majburiyat uchun ObligationStatusEvent (fromStatus →
 *     cancelled, izoh) + AuditLog (kim, qachon, sabab, eski qiymat).
 *   • IDEMPOTENT: qayta yurgizilsa allaqachon `cancelled` bo'lganlarni ko'radi
 *     va hech narsa yozmaydi.
 *
 * ISHLATISH:
 *   # 1) quruq yurish — nima bo'lishini ko'rsatadi, yozmaydi
 *   npx tsx scripts/recovery-b4-cancel.ts --baseline .recovery/b4-baseline.json
 *
 *   # 2) haqiqiy bajarish
 *   npx tsx scripts/recovery-b4-cancel.ts --baseline .recovery/b4-baseline.json --apply
 *
 *   # 3) ORQAGA QAYTARISH — statuslarni baseline'dagi asl qiymatga tiklaydi
 *   npx tsx scripts/recovery-b4-cancel.ts --baseline .recovery/b4-baseline.json --rollback --apply
 */
import "./load-env";
import { readFileSync } from "node:fs";
import type { ObligationStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canTransition } from "@/lib/engines/workflow/obligationWorkflow";
import { B4_CRITERIA, B4_REASON } from "./recovery-b4-preview";

interface BaselineCandidate {
  id: string;
  companyId: string;
  template: string;
  periodKey: string;
  status: ObligationStatus;
}
interface Baseline {
  generatedAt: string;
  candidateCount: number;
  candidateIds: string[];
  candidates: BaselineCandidate[];
  invariantsPassed: boolean;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const APPLY = process.argv.includes("--apply");
const ROLLBACK = process.argv.includes("--rollback");

function loadBaseline(): Baseline {
  const p = arg("--baseline");
  if (!p) throw new Error("--baseline <fayl> majburiy (1-bosqich uni --save bilan yaratadi).");
  const b = JSON.parse(readFileSync(p, "utf8")) as Baseline;
  if (!b.invariantsPassed) {
    throw new Error("Baseline faylida invariantlar YIQILGAN deb belgilangan — 1-bosqichni qayta yuriting.");
  }
  if (b.candidateCount !== B4_CRITERIA.expectedCount || b.candidateIds.length !== B4_CRITERIA.expectedCount) {
    throw new Error(
      `Baseline'da ${b.candidateIds.length} ta ID bor, kutilgani ${B4_CRITERIA.expectedCount} — TO'XTATILDI.`,
    );
  }
  return b;
}

/** Amalni bajaruvchi — audit izida "kim" shu. */
async function resolveActor(): Promise<string | null> {
  const explicit = arg("--actor");
  if (explicit) return explicit;
  const admin = await prisma.user.findFirst({
    where: { role: { in: ["super_admin", "admin"] }, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (admin) console.log(`  Bajaruvchi: ${admin.email} (${admin.id})`);
  return admin?.id ?? null;
}

// ═══════════════════════════════════════════════════════════════════════
async function runCancel(baseline: Baseline, actorId: string | null): Promise<void> {
  const now = new Date();

  const result = await prisma.$transaction(
    async (tx) => {
      // MUZLATILGAN ro'yxat bo'yicha joriy holatni o'qiymiz.
      const live = await tx.obligation.findMany({
        where: { id: { in: baseline.candidateIds } },
        select: {
          id: true,
          status: true,
          periodKey: true,
          completedAt: true,
          template: { select: { code: true } },
        },
      });

      if (live.length !== baseline.candidateIds.length) {
        throw new Error(
          `Bazada ${live.length} ta topildi, baseline'da ${baseline.candidateIds.length} ta — ` +
            "qatorlar o'chirilgan. ROLLBACK.",
        );
      }

      const alreadyCancelled = live.filter((o) => o.status === "cancelled");
      const eligible = live.filter((o) => o.status !== "cancelled");

      // Har birini QAYTA tekshiramiz — baseline eskirgan bo'lishi mumkin.
      for (const o of eligible) {
        if (o.periodKey !== B4_CRITERIA.periodKey) {
          throw new Error(`${o.id}: periodKey "${o.periodKey}" — mezonga mos emas. ROLLBACK.`);
        }
        if (!(B4_CRITERIA.templateCodes as readonly string[]).includes(o.template.code)) {
          throw new Error(`${o.id}: shablon "${o.template.code}" — PAYROLL emas. ROLLBACK.`);
        }
        if (!canTransition(o.status, "cancelled")) {
          throw new Error(
            `${o.id}: "${o.status}" → cancelled o'tishi workflow bo'yicha TAQIQLANGAN. ROLLBACK.`,
          );
        }
      }

      if (eligible.length === 0) {
        return { before: live.length, updated: 0, alreadyCancelled: alreadyCancelled.length, noop: true };
      }

      if (!APPLY) {
        return {
          before: live.length,
          updated: eligible.length,
          alreadyCancelled: alreadyCancelled.length,
          noop: false,
          dryRun: true,
        };
      }

      // ── YOZISH ──────────────────────────────────────────────────────
      const ids = eligible.map((o) => o.id);
      const upd = await tx.obligation.updateMany({
        where: { id: { in: ids }, status: { not: "cancelled" } },
        // `timingPatch("cancelled")` → completedAt. Status yakunlandi.
        data: { status: "cancelled", completedAt: now },
      });

      if (upd.count !== eligible.length) {
        throw new Error(
          `Ta'sirlangan qator ${upd.count}, kutilgani ${eligible.length} — MOS EMAS. ROLLBACK.`,
        );
      }

      // Status tarixi — har o'tish uchun bitta qator.
      await tx.obligationStatusEvent.createMany({
        data: eligible.map((o) => ({
          obligationId: o.id,
          fromStatus: o.status,
          toStatus: "cancelled" as ObligationStatus,
          byUserId: actorId,
          note: B4_REASON,
          at: now,
        })),
      });

      // Audit izi — kim / qachon / sabab / eski qiymat.
      await tx.auditLog.createMany({
        data: eligible.map((o) => ({
          userId: actorId,
          action: "update" as const,
          tableName: "Obligation",
          recordId: o.id,
          oldData: { status: o.status, completedAt: o.completedAt } as Prisma.InputJsonValue,
          newData: {
            status: "cancelled",
            completedAt: now.toISOString(),
            reason: B4_REASON,
            recovery: "B4",
            templateCode: o.template.code,
            periodKey: o.periodKey,
          } as Prisma.InputJsonValue,
        })),
      });

      return {
        before: live.length,
        updated: upd.count,
        alreadyCancelled: alreadyCancelled.length,
        noop: false,
      };
    },
    { timeout: 120_000, isolationLevel: "Serializable" },
  );

  console.log();
  console.log("  ── NATIJA ──────────────────────────────────────────────────────────");
  console.log(`     before count        : ${result.before}`);
  console.log(`     updated count       : ${result.updated}${"dryRun" in result && result.dryRun ? "  (QURUQ YURISH — yozilmadi)" : ""}`);
  console.log(`     already cancelled   : ${result.alreadyCancelled}`);

  const after = await prisma.obligation.count({
    where: { id: { in: baseline.candidateIds }, status: "cancelled" },
  });
  console.log(`     after count (cancelled): ${after}`);
  console.log();

  if (result.noop) {
    console.log("  ✓ IDEMPOTENT: hammasi allaqachon bekor qilingan — hech narsa o'zgartirilmadi.");
  } else if ("dryRun" in result && result.dryRun) {
    console.log("  ℹ QURUQ YURISH tugadi. Haqiqiy bajarish uchun `--apply` qo'shing.");
  } else {
    console.log("  ✓ Bajarildi. Endi 3-bosqich:");
    console.log("      npx tsx scripts/recovery-b4-postcheck.ts --baseline .recovery/b4-baseline.json");
  }
}

// ═══════════════════════════════════════════════════════════════════════
async function runRollback(baseline: Baseline, actorId: string | null): Promise<void> {
  const now = new Date();
  const priorStatus = new Map(baseline.candidates.map((c) => [c.id, c.status]));

  const result = await prisma.$transaction(
    async (tx) => {
      const live = await tx.obligation.findMany({
        where: { id: { in: baseline.candidateIds }, status: "cancelled" },
        select: { id: true, status: true },
      });

      // Faqat baseline'da asl statusi YOZILGAN va hozir `cancelled` bo'lganlar.
      const restorable = live.filter((o) => priorStatus.get(o.id) && priorStatus.get(o.id) !== "cancelled");
      if (restorable.length === 0) return { restored: 0 };

      if (!APPLY) return { restored: restorable.length, dryRun: true };

      // Statuslar har xil bo'lgani uchun guruhlab yangilaymiz.
      const byStatus = new Map<ObligationStatus, string[]>();
      for (const o of restorable) {
        const s = priorStatus.get(o.id)!;
        byStatus.set(s, [...(byStatus.get(s) ?? []), o.id]);
      }
      let restored = 0;
      for (const [status, ids] of byStatus) {
        const upd = await tx.obligation.updateMany({
          where: { id: { in: ids }, status: "cancelled" },
          data: { status, completedAt: null },
        });
        restored += upd.count;
      }
      if (restored !== restorable.length) {
        throw new Error(`Tiklangan ${restored}, kutilgani ${restorable.length} — ROLLBACK.`);
      }

      await tx.obligationStatusEvent.createMany({
        data: restorable.map((o) => ({
          obligationId: o.id,
          fromStatus: "cancelled" as ObligationStatus,
          toStatus: priorStatus.get(o.id)!,
          byUserId: actorId,
          note: "Production Recovery B4 ROLLBACK — asl status tiklandi.",
          at: now,
        })),
      });
      await tx.auditLog.createMany({
        data: restorable.map((o) => ({
          userId: actorId,
          action: "update" as const,
          tableName: "Obligation",
          recordId: o.id,
          oldData: { status: "cancelled" } as Prisma.InputJsonValue,
          newData: { status: priorStatus.get(o.id), recovery: "B4-rollback" } as Prisma.InputJsonValue,
        })),
      });
      return { restored };
    },
    { timeout: 120_000, isolationLevel: "Serializable" },
  );

  console.log();
  console.log(
    `  ${"dryRun" in result && result.dryRun ? "ℹ QURUQ YURISH — tiklanadi" : "✓ Tiklandi"}: ${result.restored} ta`,
  );
}

// ═══════════════════════════════════════════════════════════════════════
async function main(): Promise<void> {
  console.log();
  console.log("╔════════════════════════════════════════════════════════════════════════╗");
  console.log(
    `║  B4 · 2-BOSQICH — ${(ROLLBACK ? "ORQAGA QAYTARISH" : "BEKOR QILISH").padEnd(20)} ${(APPLY ? "[APPLY]" : "[QURUQ YURISH]").padEnd(16)}      ║`,
  );
  console.log("╚════════════════════════════════════════════════════════════════════════╝");

  const baseline = loadBaseline();
  console.log(`  Baseline : ${arg("--baseline")}  (${baseline.generatedAt})`);
  console.log(`  ID soni  : ${baseline.candidateIds.length}`);
  console.log(`  Sabab    : ${B4_REASON}`);
  const actorId = await resolveActor();

  if (ROLLBACK) await runRollback(baseline, actorId);
  else await runCancel(baseline, actorId);

  console.log();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\n✗ b4-cancel TO'XTATILDI (hech narsa yozilmadi):", e instanceof Error ? e.message : e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
