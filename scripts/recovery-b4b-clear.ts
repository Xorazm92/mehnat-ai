/**
 * B4b · 2-BOSQICH — KUYGAN DEDUP KALITLARINI TOZALASH
 * ====================================================
 * Standart holatda HECH NARSA yozmaydi (dry-run). Yozish uchun `--apply` shart.
 *
 * NIMA UCHUN O'CHIRISH XAVFSIZ — KODDAN ISBOT:
 *   1. `NotificationDelivery` ni HECH BIR `app/`, `components/` yoki `server/`
 *      fayli o'qimaydi — UI yuzasi yo'q.
 *   2. Ishlab chiqarish kodidagi HAR BIR o'qish — `(channel, dedupKey)` bo'yicha
 *      MAVJUDLIK tekshiruvi: lib/obligationSweep.ts:176,222 · lib/escalation.ts:157
 *      · lib/notify.ts:99 · lib/directorReport.ts:284. `status`, `sentAt`,
 *      `targetChatId` yozilади, lekin hech qachon QAYTA O'QILMAYDI.
 *   3. `lib/operationalTables.ts:56` uni OPERATSION deb tasniflaydi va
 *      `refillsWhenLive: true` bayrog'ini qo'yadi — ya'ni loyihaning O'ZI uni
 *      "tozalanadi va o'zi qayta to'ladi" deb hisoblaydi.
 *   4. `scripts/reset-operational-data.ts` uni BUTUNLAY o'chiradi,
 *      `scripts/verify-clean-start.ts` esa bo'shligini tasdiqlaydi — ya'ni
 *      to'liq o'chirish allaqachon qo'llab-quvvatlanadigan yo'l.
 *   5. `notificationId` ustuniga kodda BITTA ham yozuvchi yo'q (grep bo'sh) va
 *      schema'da `@relation` yo'q → `Notification` ga struktura darajasida
 *      hech qanday bog'liqlik yo'q.
 *
 *   ⚠️ ISTISNO — `channel = "verdict"`: u
 *   bot/contexts/escalation/application/alert-actions.ts da nazoratchining
 *   hukmini bir martaga qulflaydi va KPI daftariga yozadi. Bu DEDUP EMAS,
 *   BIZNES HOLATI. Bu skript unga hech qachon tegmaydi.
 *
 * TEGILMAYDI: Obligation · KassaEntry · Payment · LedgerEntry · AuditLog ·
 *             ObligationStatusEvent · Notification
 * Ular postcheck'da qator-ma-qator solishtiriladi.
 *
 * AUDIT IZI: `AuditLog` ga YOZILMAYDI (siz qo'ygan chegara). Buning o'rniga
 * amal kvitansiyasi FAYLGA yoziladi (`.recovery/b4b-receipt-<vaqt>.json`).
 *
 * ISHLATISH:
 *   npx tsx scripts/recovery-b4b-clear.ts --baseline .recovery/b4b-baseline.json
 *   npx tsx scripts/recovery-b4b-clear.ts --baseline .recovery/b4b-baseline.json --apply
 *   npx tsx scripts/recovery-b4b-clear.ts --baseline .recovery/b4b-baseline.json --rollback --apply
 */
import "./load-env";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import type { B4bCandidate } from "./recovery-b4b-preview";

/**
 * TEST-ORIGIN CHEGARASI — `recovery-b4b-preview.ts` dagi bilan bir xil.
 * `sentAt` shundan keyin bo'lsa, qiymat in'ektsiya qilingan `now` dan kelgan
 * (baza soati hech qachon bunday yozmaydi) → ya'ni testdan.
 */
const TEST_ORIGIN_AFTER = new Date(Date.UTC(2030, 0, 1));

interface Baseline {
  generatedAt: string;
  totalCandidates: number;
  overdueCandidates: number;
  futureCandidates: number;
  candidateDeliveryIds: string[];
  candidates: B4bCandidate[];
  guardViolations: number;
  deletableChannels: string[];
  testOriginRule: string;
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
  if (b.guardViolations !== 0) {
    throw new Error("Baseline'da chegara buzilishi belgilangan — 1-bosqichni qayta yuriting.");
  }
  if (b.candidateDeliveryIds.length !== b.totalCandidates) {
    throw new Error("Baseline ichida nomuvofiqlik: ID soni totalCandidates ga teng emas.");
  }
  return b;
}

function writeReceipt(kind: string, payload: unknown): string {
  mkdirSync(".recovery", { recursive: true });
  const path = `.recovery/b4b-receipt-${kind}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(path, JSON.stringify(payload, null, 2));
  return path;
}

// ═══════════════════════════════════════════════════════════════════════
async function runClear(baseline: Baseline): Promise<void> {
  const ids = baseline.candidateDeliveryIds;

  const result = await prisma.$transaction(
    async (tx) => {
      // MUZLATILGAN ID ro'yxati — so'rov qayta yurgizilmaydi.
      const live = await tx.notificationDelivery.findMany({
        where: { id: { in: ids } },
        select: { id: true, channel: true, dedupKey: true, sentAt: true },
      });

      // Idempotentlik: allaqachon o'chirilganlar yo'qligi xato emas.
      const missing = ids.length - live.length;

      // Har bir qatorni QAYTA tekshiramiz — baseline eskirgan bo'lishi mumkin.
      for (const r of live) {
        if (!baseline.deletableChannels.includes(r.channel)) {
          throw new Error(`${r.id}: kanal "${r.channel}" ruxsat etilganlar ro'yxatida yo'q. ROLLBACK.`);
        }
        if (r.channel === "verdict") {
          throw new Error(`${r.id}: verdict kanali — biznes qulfi, hech qachon o'chirilmaydi. ROLLBACK.`);
        }
        if (!r.dedupKey?.startsWith("obligation:")) {
          throw new Error(`${r.id}: dedupKey "${r.dedupKey}" majburiyatga tegishli emas. ROLLBACK.`);
        }
        // TEST-ORIGIN QAYTA ISBOTI — baseline'ga ishonib qolmaymiz. `sentAt`
        // in'ektsiya qilingan `now` dan kelgan bo'lishi SHART; real soatdan
        // kelgan qator qonuniy sweep izi bo'lishi mumkin va o'chirilmaydi.
        if (!r.sentAt || r.sentAt <= TEST_ORIGIN_AFTER) {
          throw new Error(
            `${r.id}: sentAt=${r.sentAt?.toISOString() ?? "NULL"} — test-origin isboti yo'q. ROLLBACK.`,
          );
        }
      }

      if (live.length === 0) {
        return { before: 0, deleted: 0, missing, noop: true };
      }
      if (!APPLY) {
        return { before: live.length, deleted: live.length, missing, noop: false, dryRun: true };
      }

      const del = await tx.notificationDelivery.deleteMany({ where: { id: { in: live.map((r) => r.id) } } });
      if (del.count !== live.length) {
        throw new Error(`O'chirilgan ${del.count}, kutilgani ${live.length} — MOS EMAS. ROLLBACK.`);
      }
      return { before: live.length, deleted: del.count, missing, noop: false };
    },
    { timeout: 180_000, isolationLevel: "Serializable" },
  );

  const after = await prisma.notificationDelivery.count({ where: { id: { in: ids } } });

  console.log();
  console.log("  ── NATIJA ──────────────────────────────────────────────────────────");
  console.log(`     before count (mavjud edi) : ${result.before}`);
  console.log(`     deleted count             : ${result.deleted}${"dryRun" in result && result.dryRun ? "  (QURUQ YURISH — o'chirilmadi)" : ""}`);
  console.log(`     allaqachon yo'q edi       : ${result.missing}`);
  console.log(`     after count (qoldi)       : ${after}`);
  console.log();

  if (result.noop) {
    console.log("  ✓ IDEMPOTENT: kalitlar allaqachon tozalangan — hech narsa o'zgartirilmadi.");
  } else if ("dryRun" in result && result.dryRun) {
    console.log("  ℹ QURUQ YURISH tugadi. Haqiqiy bajarish uchun `--apply` qo'shing.");
  } else {
    const receipt = writeReceipt("clear", {
      at: new Date().toISOString(),
      baselineGeneratedAt: baseline.generatedAt,
      deleted: result.deleted,
      deliveryIds: ids,
      rows: baseline.candidates,
      rollbackCommand: `npx tsx scripts/recovery-b4b-clear.ts --baseline ${arg("--baseline")} --rollback --apply`,
    });
    console.log(`  ✓ Bajarildi. Kvitansiya: ${receipt}`);
    console.log("    Keyingi qadam:");
    console.log(`      npx tsx scripts/recovery-b4b-postcheck.ts --baseline ${arg("--baseline")}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
/**
 * ORQAGA QAYTARISH — o'chirilgan qatorlarni AYNAN o'sha `id`, `createdAt` va
 * qolgan ustunlari bilan qayta yaratadi. Baseline har bir ustunni saqlagani
 * uchun tiklash to'liq: dedup holati o'chirishdan oldingi ko'rinishga qaytadi.
 */
async function runRollback(baseline: Baseline): Promise<void> {
  const result = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.notificationDelivery.findMany({
        where: { id: { in: baseline.candidateDeliveryIds } },
        select: { id: true },
      });
      const present = new Set(existing.map((r) => r.id));
      const toRestore = baseline.candidates.filter((c) => !present.has(c.deliveryId));

      if (toRestore.length === 0) return { restored: 0, alreadyPresent: present.size };
      if (!APPLY) return { restored: toRestore.length, alreadyPresent: present.size, dryRun: true };

      const created = await tx.notificationDelivery.createMany({
        data: toRestore.map((c) => ({
          id: c.deliveryId,
          channel: c.channel,
          dedupKey: c.dedupKey,
          level: c.level,
          status: c.status,
          createdAt: new Date(c.createdAt),
          sentAt: c.sentAt ? new Date(c.sentAt) : null,
          recipientId: c.recipientId,
          targetChatId: c.targetChatId ? BigInt(c.targetChatId) : null,
          notificationId: c.notificationId,
        })),
      });
      if (created.count !== toRestore.length) {
        throw new Error(`Tiklangan ${created.count}, kutilgani ${toRestore.length} — ROLLBACK.`);
      }
      return { restored: created.count, alreadyPresent: present.size };
    },
    { timeout: 180_000, isolationLevel: "Serializable" },
  );

  console.log();
  console.log(
    `  ${"dryRun" in result && result.dryRun ? "ℹ QURUQ YURISH — tiklanadi" : "✓ Tiklandi"}: ${result.restored} ta ` +
      `(allaqachon o'rnida: ${result.alreadyPresent})`,
  );
  if (!("dryRun" in result) && result.restored > 0) {
    console.log(`  Kvitansiya: ${writeReceipt("rollback", { at: new Date().toISOString(), restored: result.restored })}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
async function main(): Promise<void> {
  console.log();
  console.log("╔════════════════════════════════════════════════════════════════════════╗");
  console.log(
    `║  B4b · 2-BOSQICH — ${(ROLLBACK ? "ORQAGA QAYTARISH" : "DEDUP TOZALASH").padEnd(19)} ${(APPLY ? "[APPLY]" : "[QURUQ YURISH]").padEnd(16)}      ║`,
  );
  console.log("╚════════════════════════════════════════════════════════════════════════╝");

  const baseline = loadBaseline();
  console.log(`  Baseline : ${arg("--baseline")}  (${baseline.generatedAt})`);
  console.log(
    `  Nomzod   : ${baseline.totalCandidates} ta qator ` +
      `(overdue ${baseline.overdueCandidates} + future ${baseline.futureCandidates})`,
  );
  console.log(`  Kanallar : ${baseline.deletableChannels.join(", ")}   (verdict TEGILMAYDI)`);
  console.log(`  Test-origin: ${baseline.testOriginRule}`);
  console.log(`  Tegilmaydi: Obligation · KassaEntry · Payment · LedgerEntry · AuditLog ·`);
  console.log(`              ObligationStatusEvent · Notification`);

  if (ROLLBACK) await runRollback(baseline);
  else await runClear(baseline);

  console.log();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\n✗ b4b-clear TO'XTATILDI (hech narsa o'zgartirilmadi):", e instanceof Error ? e.message : e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
