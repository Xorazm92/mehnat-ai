/**
 * B4b · 1-BOSQICH — TEST BUZGAN DEDUP KALITLARI: PREVIEW (qat'iy READ-ONLY)
 * =========================================================================
 * Qamrov: BARCHA ochiq majburiyatlar — muddati o'tganlar ham, hali kelmaganlar
 * ham. Faqat 852 kechikkanni tozalash bugungi muammoni yopardi, lekin keyingi
 * D-5/D-3/D-1 eslatmalari baribir jim qolardi.
 *
 * ── TEST-ORIGIN ISBOTI (o'chirishning yagona asosi) ──────────────────────
 * `sweepDeadlines` va `escalate` yetkazish qatoriga `sentAt: now` yozadi, bu
 * yerda `now` — CHAQIRUVCHI BERADIGAN parametr. `createdAt` esa
 * `@default(now())`, ya'ni BAZA SOATI — uni in'ektsiya qilib bo'lmaydi.
 *
 * Qonuniy sweep faqat bitta joydan keladi — `bot/queues/obligation.worker.ts:38`
 * — va u `now: new Date()` uzatadi. Ya'ni qonuniy qatorda `sentAt ≈ createdAt`.
 *
 * `sentAt` = 2097-yil, `createdAt` = 2026-yil bo'lgan qator FAQAT in'ektsiya
 * qilingan `now` bilan hosil bo'ladi → ya'ni testdan. Bu deterministik
 * ajratgich, taxmin emas.
 *
 * Qo'shimcha tasdiq:
 *   · `sweepDeadlines` ning bor-yo'g'i ikkita chaqiruvchisi bor: obligation
 *     worker (HECH QACHON ishlamagan — Redis'da 0 scheduler, 0 bajarilgan job)
 *     va test to'plami.
 *   · Barcha 2 982 majburiyatda `firstOverdueAt = 2097-07-15`.
 *
 * Hech narsa o'chirmaydi/yozmaydi.
 *
 * ISHLATISH:
 *   npm run recovery:b4b:preview
 */
import "./load-env";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { prisma } from "@/lib/prisma";
import { OPEN_OBLIGATION_STATUSES } from "@/lib/engines/workflow/obligationWorkflow";
import { ESCALATION_CHANNEL, escalationDedupKey } from "@/lib/engines/automation/escalation";

/** B4 da bekor qilinadigan soxta PAYROLL shablonlari — qamrovdan tashqarida. */
const PAYROLL_CODES = ["PAYROLL_CALC", "PAYROLL_POSTED"] as const;

/** Sweep yaratadigan eslatma bosqichlari (lib/obligationSweep.ts milestonesFor). */
const MILESTONES = ["D-5", "D-3", "D-1", "due", "overdue:L1"] as const;

/**
 * Tegishi MUMKIN bo'lgan kanallar. `verdict` ATAYIN YO'Q: u
 * bot/contexts/escalation/application/alert-actions.ts da nazoratchining
 * hukmini bir martaga qulflaydi va KPI daftariga yozadi — biznes holati, dedup emas.
 */
const DELETABLE_CHANNELS = ["inapp", "telegram", ESCALATION_CHANNEL] as const;

/**
 * TEST-ORIGIN CHEGARASI. `sentAt` shu sanadan keyin bo'lsa — qiymat
 * in'ektsiya qilingan (real soat hech qachon bunday yozmaydi).
 * Bu chegaradan o'tmagan qator NOMZOD BO'LMAYDI, hatto dedupKey mos kelsa ham.
 */
const TEST_ORIGIN_AFTER = new Date(Date.UTC(2030, 0, 1));

const reminderKey = (obligationId: string, milestone: string) =>
  `obligation:${obligationId}:reminder:${milestone}`;

export interface B4bCandidate {
  obligationId: string;
  group: "overdue" | "future";
  deliveryId: string;
  channel: string;
  dedupKey: string;
  level: string;
  status: string;
  createdAt: string;
  sentAt: string | null;
  recipientId: string | null;
  targetChatId: string | null;
  notificationId: string | null;
}

/**
 * Berilgan majburiyatlar uchun TEST KELIB CHIQISHLI kuygan dedup qatorlari.
 * Uch shart birgalikda: kanal oq ro'yxatda + dedupKey oq ro'yxatda +
 * sentAt in'ektsiya qilingan.
 */
export async function findBurnedDeliveries(
  obligationIds: string[],
  group: "overdue" | "future",
): Promise<B4bCandidate[]> {
  if (obligationIds.length === 0) return [];
  const keys = [
    ...obligationIds.flatMap((id) => MILESTONES.map((m) => reminderKey(id, m))),
    ...obligationIds.flatMap((id) => [
      escalationDedupKey("obligation", id, 1),
      escalationDedupKey("obligation", id, 2),
    ]),
  ];

  const rows = await prisma.notificationDelivery.findMany({
    where: {
      channel: { in: [...DELETABLE_CHANNELS] },
      dedupKey: { in: keys },
      sentAt: { gt: TEST_ORIGIN_AFTER }, // ← test-origin sharti
    },
    select: {
      id: true, channel: true, dedupKey: true, level: true, status: true,
      createdAt: true, sentAt: true, recipientId: true, targetChatId: true, notificationId: true,
    },
  });

  return rows.map((r) => ({
    obligationId: (r.dedupKey ?? "").split(":")[1] ?? "",
    group,
    deliveryId: r.id,
    channel: r.channel,
    dedupKey: r.dedupKey ?? "",
    level: r.level,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    sentAt: r.sentAt?.toISOString() ?? null,
    recipientId: r.recipientId,
    targetChatId: r.targetChatId?.toString() ?? null,
    notificationId: r.notificationId,
  }));
}

const pad = (n: number | string, w: number) => String(n).padStart(w);

/** Bosqich bo'yicha sanoq (kanallar yig'indisi). */
function tally(cands: B4bCandidate[]) {
  const out: Record<string, number> = {};
  for (const m of MILESTONES) out[m] = cands.filter((c) => c.dedupKey.endsWith(`:reminder:${m}`)).length;
  out["escalation:L1"] = cands.filter((c) => c.dedupKey.endsWith(":esc:L1")).length;
  out["escalation:L2"] = cands.filter((c) => c.dedupKey.endsWith(":esc:L2")).length;
  return out;
}

async function main(): Promise<void> {
  const now = new Date();
  const saveIdx = process.argv.indexOf("--save");
  const savePath = saveIdx >= 0 ? process.argv[saveIdx + 1] : undefined;

  console.log();
  console.log("╔════════════════════════════════════════════════════════════════════════╗");
  console.log("║  B4b · TEST BUZGAN DEDUP — PREVIEW                 (READ-ONLY)         ║");
  console.log("╚════════════════════════════════════════════════════════════════════════╝");
  console.log();

  // ── Qamrov: ikki guruh ────────────────────────────────────────────────
  const open = await prisma.obligation.findMany({
    where: {
      status: { in: OPEN_OBLIGATION_STATUSES },
      template: { code: { notIn: [...PAYROLL_CODES] } },
    },
    select: { id: true, dueAt: true },
  });
  const overdueIds = open.filter((o) => o.dueAt < now).map((o) => o.id);
  const futureIds = open.filter((o) => o.dueAt >= now).map((o) => o.id);

  console.log(`  overdue obligations = ${overdueIds.length}`);
  console.log(`  future  obligations = ${futureIds.length}`);
  console.log(`  JAMI qamrov         = ${open.length}`);
  console.log();

  const overdueCands = await findBurnedDeliveries(overdueIds, "overdue");
  const futureCands = await findBurnedDeliveries(futureIds, "future");
  const candidates = [...overdueCands, ...futureCands];

  const oT = tally(overdueCands);
  const fT = tally(futureCands);

  console.log("  ── SO'RALGAN KO'RINISHDA ───────────────────────────────────────────");
  console.log("  overdue candidates:");
  for (const k of [...MILESTONES, "escalation:L1", "escalation:L2"]) {
    console.log(`    ${k.padEnd(15)} = ${oT[k]}`);
  }
  console.log(`    ${"JAMI".padEnd(15)} = ${overdueCands.length}`);
  console.log();
  console.log("  future candidates:");
  for (const k of [...MILESTONES, "escalation:L1", "escalation:L2"]) {
    console.log(`    ${k.padEnd(15)} = ${fT[k]}`);
  }
  console.log(`    ${"JAMI".padEnd(15)} = ${futureCands.length}`);
  console.log();
  console.log(`  TOTAL TEST-CORRUPTED DEDUP CANDIDATES = ${candidates.length}`);
  console.log();

  // ── TEST-ORIGIN ISBOTI (ma'lumot bilan) ───────────────────────────────
  console.log("  ── TEST-ORIGIN ISBOTI ──────────────────────────────────────────────");
  const originProof = await prisma.$queryRaw<
    { bucket: string; cnt: bigint; min_sent: Date | null; max_sent: Date | null; min_created: Date; max_created: Date }[]
  >`
    SELECT CASE WHEN "sentAt" > ${TEST_ORIGIN_AFTER} THEN 'INJECTED (test)'
                WHEN "sentAt" IS NULL              THEN 'sentAt NULL'
                ELSE 'real soat' END AS bucket,
           count(*)::bigint AS cnt,
           min("sentAt") AS min_sent, max("sentAt") AS max_sent,
           min("createdAt") AS min_created, max("createdAt") AS max_created
      FROM "NotificationDelivery"
     WHERE "dedupKey" LIKE 'obligation:%'
     GROUP BY 1 ORDER BY 2 DESC`;
  console.log("     guruh              soni     sentAt oralig'i          createdAt oralig'i");
  for (const r of originProof) {
    const s = r.min_sent ? `${r.min_sent.toISOString().slice(0, 10)}…${r.max_sent!.toISOString().slice(0, 10)}` : "—";
    const c = `${r.min_created.toISOString().slice(0, 10)}…${r.max_created.toISOString().slice(0, 10)}`;
    console.log(`     ${r.bucket.padEnd(17)} ${pad(Number(r.cnt), 6)}   ${s.padEnd(23)} ${c}`);
  }
  console.log();
  const realClock = originProof.find((r) => r.bucket === "real soat");
  console.log(
    `     ${realClock ? "✗" : "✓"} Qonuniy sweep izi (sentAt ≈ createdAt): ${realClock ? Number(realClock.cnt) : 0} qator`,
  );
  console.log("       → 0 bo'lishi kutiladi: obligation worker hech qachon ishlamagan");
  console.log("         (Redis'da 0 scheduler, obligation navbatida 0 bajarilgan job).");
  console.log();

  // ── INVARIANTLAR ──────────────────────────────────────────────────────
  console.log("  ── INVARIANTLAR ────────────────────────────────────────────────────");
  let violations = 0;
  const guard = (ok: boolean, label: string, detail: string) => {
    if (!ok) violations++;
    console.log(`     ${ok ? "✓" : "✗"} ${label.padEnd(36)} ${detail}`);
  };

  const verdictTotal = await prisma.notificationDelivery.count({ where: { channel: "verdict" } });
  const verdictInCands = candidates.filter((c) => c.channel === "verdict").length;
  guard(verdictInCands === 0, "verdict candidates", `${verdictInCands}  (jadvalda jami ${verdictTotal})`);

  const badChannel = candidates.filter((c) => !(DELETABLE_CHANNELS as readonly string[]).includes(c.channel));
  guard(badChannel.length === 0, "kanal oq ro'yxatdan tashqari", `${badChannel.length}`);

  const badKey = candidates.filter((c) => !c.dedupKey.startsWith("obligation:"));
  guard(badKey.length === 0, "dedupKey oq ro'yxatdan tashqari", `${badKey.length}`);

  const notInjected = candidates.filter((c) => !c.sentAt || new Date(c.sentAt) <= TEST_ORIGIN_AFTER);
  guard(notInjected.length === 0, "test-origin isbotisiz nomzod", `${notInjected.length}`);

  const inScope = new Set([...overdueIds, ...futureIds]);
  const foreign = candidates.filter((c) => !inScope.has(c.obligationId));
  guard(foreign.length === 0, "qamrovdan tashqari majburiyat", `${foreign.length}`);

  const withNotifLink = candidates.filter((c) => c.notificationId !== null);
  guard(withNotifLink.length === 0, "Notification'ga bog'lanish", `${withNotifLink.length}`);
  console.log();

  // ── QAMROVDAN TASHQARIDA QOLADIGANLAR (shaffoflik uchun) ──────────────
  const allObligationRows = await prisma.notificationDelivery.count({
    where: { dedupKey: { startsWith: "obligation:" } },
  });
  const leftover = allObligationRows - candidates.length;
  console.log("  ── QAMROVDAN TASHQARIDA QOLADI ─────────────────────────────────────");
  console.log(`     obligation: prefiksli jami qator : ${allObligationRows}`);
  console.log(`     nomzod                            : ${candidates.length}`);
  console.log(`     tegilmaydi                        : ${leftover}`);
  console.log("     → bular: B4 da bekor qilinadigan PAYROLL majburiyatlari,");
  console.log("       yakunlangan (accepted/cancelled) majburiyatlar va o'chirilgan");
  console.log("       fikstura'lardan qolgan yetim qatorlar. Ularga eslatma kerak emas.");
  console.log();

  if (savePath) {
    mkdirSync(dirname(savePath), { recursive: true });
    writeFileSync(
      savePath,
      JSON.stringify(
        {
          generatedAt: now.toISOString(),
          scope: "barcha ochiq majburiyatlar (PAYROLL tashqarida): overdue + future",
          testOriginRule: `sentAt > ${TEST_ORIGIN_AFTER.toISOString()} (in'ektsiya qilingan now)`,
          overdueObligations: overdueIds.length,
          futureObligations: futureIds.length,
          overdueCandidates: overdueCands.length,
          futureCandidates: futureCands.length,
          overdueTally: oT,
          futureTally: fT,
          totalCandidates: candidates.length,
          candidateDeliveryIds: candidates.map((c) => c.deliveryId),
          candidates,
          guardViolations: violations,
          deletableChannels: DELETABLE_CHANNELS,
          baseline: {
            notificationCount: await prisma.notification.count(),
            obligationCount: await prisma.obligation.count(),
            notificationDeliveryCount: await prisma.notificationDelivery.count(),
            verdictCount: verdictTotal,
            kassaCount: await prisma.kassaEntry.count(),
            paymentCount: await prisma.payment.count(),
            ledgerCount: await prisma.ledgerEntry.count(),
            auditCount: await prisma.auditLog.count(),
            statusEventCount: await prisma.obligationStatusEvent.count(),
          },
        },
        null,
        2,
      ),
    );
    console.log(`  ✓ Saqlandi: ${savePath}  (FAYLGA — bazaga emas)`);
    console.log();
  }

  if (violations > 0) {
    console.error(`  ✗ ${violations} ta invariant buzildi — TO'XTATILDI. O'chirish mumkin emas.`);
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log("  ✓ Barcha invariantlar joyida.");
  console.log();
  await prisma.$disconnect();
}

const isEntrypoint = process.argv[1]?.endsWith("recovery-b4b-preview.ts") ?? false;
if (isEntrypoint) {
  main().catch(async (e) => {
    console.error("\n✗ b4b-preview yiqildi:", e instanceof Error ? e.message : e);
    await prisma.$disconnect().catch(() => {});
    process.exit(2);
  });
}
