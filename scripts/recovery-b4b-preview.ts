/**
 * B4b · 1-BOSQICH — KUYGAN DEDUP KALITLARI: PREVIEW (qat'iy READ-ONLY)
 * ====================================================================
 * `test/obligation-sweep.test.ts` sweepDeadlines'ni `now = 2097-07-15` bilan
 * chaqiradi, sweep esa BUTUN `Obligation` jadvali ustidan yuradi. Testlar
 * ishchi bazaga qarshi yugurgani uchun har bir ochiq majburiyat uchun barcha
 * eslatma bosqichlari va ikkala eskalatsiya darajasi "band qilingan".
 *
 * dedupKey da SANA YO'Q (`obligation:<id>:reminder:<bosqich>`,
 * `obligation:<id>:esc:L<n>`) → band qilish DOIMIY. Bot yoqilganda sweep bu
 * kalitlarni ko'radi va bosqichni o'tkazib yuboradi, ya'ni haqiqiy kechikkan
 * majburiyatlar bo'yicha HECH QANDAY eslatma/eskalatsiya yubormaydi.
 *
 * Bu skript nomzodlarni ANIQLAYDI. Hech narsa o'chirmaydi/yozmaydi.
 *
 * ISHLATISH:
 *   npx tsx scripts/recovery-b4b-preview.ts
 *   npx tsx scripts/recovery-b4b-preview.ts --save .recovery/b4b-baseline.json
 */
import "./load-env";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { prisma } from "@/lib/prisma";
import { OPEN_OBLIGATION_STATUSES } from "@/lib/obligationWorkflow";
import { ESCALATION_CHANNEL, escalationDedupKey } from "@/lib/escalation";

/** B4 da bekor qilinadigan soxta PAYROLL shablonlari — bu yerda hisobga olinmaydi. */
const PAYROLL_CODES = ["PAYROLL_CALC", "PAYROLL_POSTED"] as const;

/** Sweep yaratadigan eslatma bosqichlari (lib/obligationSweep.ts milestonesFor). */
const MILESTONES = ["D-5", "D-3", "D-1", "due", "overdue:L1"] as const;

/**
 * Tegishi MUMKIN bo'lgan kanallar. `verdict` ATAYIN YO'Q: u
 * bot/contexts/escalation/application/alert-actions.ts da nazoratchining
 * hukmini (jarima/ogohlantirish/sababli) bir martaga qulflaydi va KPI
 * daftariga yozadi — ya'ni biznes holati, dedup emas.
 */
const DELETABLE_CHANNELS = ["inapp", "telegram", ESCALATION_CHANNEL] as const;

const reminderKey = (obligationId: string, milestone: string) =>
  `obligation:${obligationId}:reminder:${milestone}`;

/**
 * Nomzod qatorining TO'LIQ nusxasi. Har bir ustun saqlanadi, chunki rollback
 * qatorni AYNAN o'sha `id` va `createdAt` bilan qayta tiklaydi — ya'ni o'chirish
 * qaytariladigan amal bo'lib qoladi.
 */
export interface B4bCandidate {
  obligationId: string;
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

/** Berilgan majburiyatlar uchun kuygan dedup qatorlarini topadi. */
export async function findBurnedDeliveries(obligationIds: string[]): Promise<B4bCandidate[]> {
  const reminderKeys = obligationIds.flatMap((id) => MILESTONES.map((m) => reminderKey(id, m)));
  const escKeys = obligationIds.flatMap((id) => [
    escalationDedupKey("obligation", id, 1),
    escalationDedupKey("obligation", id, 2),
  ]);

  const rows = await prisma.notificationDelivery.findMany({
    where: {
      channel: { in: [...DELETABLE_CHANNELS] },
      dedupKey: { in: [...reminderKeys, ...escKeys] },
    },
    select: {
      id: true,
      channel: true,
      dedupKey: true,
      level: true,
      status: true,
      createdAt: true,
      sentAt: true,
      recipientId: true,
      targetChatId: true,
      notificationId: true,
    },
  });

  return rows.map((r) => ({
    // dedupKey formati: obligation:<uuid>:reminder:<bosqich> | obligation:<uuid>:esc:L<n>
    obligationId: (r.dedupKey ?? "").split(":")[1] ?? "",
    deliveryId: r.id,
    channel: r.channel,
    dedupKey: r.dedupKey ?? "",
    level: r.level,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    sentAt: r.sentAt?.toISOString() ?? null,
    recipientId: r.recipientId,
    // BigInt JSON'ga to'g'ridan-to'g'ri tushmaydi — string sifatida saqlanadi.
    targetChatId: r.targetChatId?.toString() ?? null,
    notificationId: r.notificationId,
  }));
}

const pad = (n: number | string, w: number) => String(n).padStart(w);

async function main(): Promise<void> {
  const now = new Date();
  const saveIdx = process.argv.indexOf("--save");
  const savePath = saveIdx >= 0 ? process.argv[saveIdx + 1] : undefined;

  console.log();
  console.log("╔════════════════════════════════════════════════════════════════════════╗");
  console.log("║  B4b · 1-BOSQICH — KUYGAN DEDUP PREVIEW            (READ-ONLY)         ║");
  console.log("╚════════════════════════════════════════════════════════════════════════╝");
  console.log();

  // ── Qamrov: haqiqiy kechikkan majburiyatlar ───────────────────────────
  const realOverdue = await prisma.obligation.findMany({
    where: {
      dueAt: { lt: now },
      status: { in: OPEN_OBLIGATION_STATUSES },
      template: { code: { notIn: [...PAYROLL_CODES] } },
    },
    select: { id: true, periodKey: true, dueAt: true, template: { select: { code: true } } },
  });
  const realIds = realOverdue.map((o) => o.id);
  console.log(`  real_overdue = ${realOverdue.length}`);
  console.log();

  const candidates = await findBurnedDeliveries(realIds);

  // ── Bosqich kesimi ────────────────────────────────────────────────────
  console.log("  ── KUYGAN KALITLAR (bosqich × kanal) ───────────────────────────────");
  console.log("     bosqich          inapp  telegram  escalation    jami");
  console.log("     ───────────────  ─────  ────────  ──────────  ──────");
  const rowsOut: [string, number][] = [];
  for (const m of MILESTONES) {
    const suffix = `:reminder:${m}`;
    const inapp = candidates.filter((c) => c.dedupKey.endsWith(suffix) && c.channel === "inapp").length;
    const tg = candidates.filter((c) => c.dedupKey.endsWith(suffix) && c.channel === "telegram").length;
    const esc = candidates.filter((c) => c.dedupKey.endsWith(suffix) && c.channel === ESCALATION_CHANNEL).length;
    const total = inapp + tg + esc;
    rowsOut.push([m, total]);
    console.log(`     ${m.padEnd(15)}  ${pad(inapp, 5)}  ${pad(tg, 8)}  ${pad(esc, 10)}  ${pad(total, 6)}`);
  }
  for (const lvl of [1, 2] as const) {
    const suffix = `:esc:L${lvl}`;
    const inapp = candidates.filter((c) => c.dedupKey.endsWith(suffix) && c.channel === "inapp").length;
    const tg = candidates.filter((c) => c.dedupKey.endsWith(suffix) && c.channel === "telegram").length;
    const esc = candidates.filter((c) => c.dedupKey.endsWith(suffix) && c.channel === ESCALATION_CHANNEL).length;
    const total = inapp + tg + esc;
    rowsOut.push([`escalation:L${lvl}`, total]);
    console.log(`     ${`escalation:L${lvl}`.padEnd(15)}  ${pad(inapp, 5)}  ${pad(tg, 8)}  ${pad(esc, 10)}  ${pad(total, 6)}`);
  }
  console.log("     ───────────────  ─────  ────────  ──────────  ──────");
  console.log(`     ${"total_candidates".padEnd(15)}  ${" ".repeat(27)}${pad(candidates.length, 6)}`);
  console.log();

  console.log("  ── SO'RALGAN KO'RINISHDA ───────────────────────────────────────────");
  console.log(`     real_overdue    = ${realOverdue.length}`);
  for (const [name, n] of rowsOut) console.log(`     ${name.padEnd(15)} = ${n}`);
  console.log(`     total_candidates = ${candidates.length}`);
  console.log();

  // ── QAT'IY CHEGARA TEKSHIRUVLARI ──────────────────────────────────────
  console.log("  ── CHEGARA TEKSHIRUVLARI ───────────────────────────────────────────");
  let violations = 0;
  const guard = (ok: boolean, label: string, detail: string) => {
    if (!ok) violations++;
    console.log(`     ${ok ? "✓" : "✗"} ${label.padEnd(38)} ${detail}`);
  };

  const badChannel = candidates.filter((c) => !(DELETABLE_CHANNELS as readonly string[]).includes(c.channel));
  guard(badChannel.length === 0, "faqat inapp/telegram/escalation", `${badChannel.length} ta begona kanal`);

  // `verdict` kanali — biznes qulfi, hech qachon tegilmasin.
  const verdictOverlap = await prisma.notificationDelivery.count({
    where: { channel: "verdict", dedupKey: { in: candidates.map((c) => c.dedupKey) } },
  });
  guard(verdictOverlap === 0, "verdict kanali tegilmaydi", `${verdictOverlap} ta kesishuv`);

  const unknownObl = candidates.filter((c) => !realIds.includes(c.obligationId));
  guard(unknownObl.length === 0, "hammasi 852 ro'yxatidan", `${unknownObl.length} ta begona majburiyat`);

  // `notificationId` hech qachon yozilmaydi (kodda bitta ham yozuvchi yo'q) →
  // delivery qatorini o'chirish Notification'ga struktura darajasida ta'sir qilmaydi.
  const withNotifLink = await prisma.notificationDelivery.count({
    where: { id: { in: candidates.map((c) => c.deliveryId) }, notificationId: { not: null } },
  });
  guard(withNotifLink === 0, "Notification'ga bog'lanish yo'q", `${withNotifLink} ta bog'langan`);
  console.log();

  // ── QAMROVDAN TASHQARI, LEKIN ZARARLANGAN ─────────────────────────────
  // 2097-sweep BARCHA ochiq majburiyatlarni kechikkan deb ko'rgan, shuning
  // uchun hali muddati kelmaganlarining D-5/D-3 kalitlari ham kuygan.
  const allOpen = await prisma.obligation.findMany({
    where: { status: { in: OPEN_OBLIGATION_STATUSES } },
    select: { id: true },
  });
  const notYetDue = allOpen.map((o) => o.id).filter((id) => !realIds.includes(id));
  const notYetDueBurned = await findBurnedDeliveries(notYetDue);
  console.log("  ── QAMROVDAN TASHQARI (ma'lumot uchun) ─────────────────────────────");
  console.log(`     Hali muddati kelmagan ochiq majburiyat : ${notYetDue.length}`);
  console.log(`     ularning kuygan kaliti                 : ${notYetDueBurned.length}`);
  if (notYetDueBurned.length > 0) {
    console.log("     ⚠️  Bular ham kuygan — muddati yaqinlashganda D-5/D-3/D-1");
    console.log("        eslatmalari JIMGINA o'tkazib yuboriladi. B4b qamrovida EMAS.");
  }
  console.log();

  // ── Namuna ────────────────────────────────────────────────────────────
  console.log("  ── NAMUNA (birinchi 8 nomzod) ──────────────────────────────────────");
  console.log("     obligationId                          kanal       dedupKey                                       yaratilgan");
  for (const c of candidates.slice(0, 8)) {
    console.log(
      `     ${c.obligationId}  ${c.channel.padEnd(10)}  ${c.dedupKey.padEnd(44)}  ${c.createdAt.slice(0, 10)}`,
    );
  }
  console.log(`     … jami ${candidates.length} ta (to'liq ro'yxat --save fayliga yoziladi)`);
  console.log();

  if (savePath) {
    mkdirSync(dirname(savePath), { recursive: true });
    writeFileSync(
      savePath,
      JSON.stringify(
        {
          generatedAt: now.toISOString(),
          scope: "real overdue obligations (PAYROLL tashqarida)",
          realOverdueCount: realOverdue.length,
          realOverdueIds: realIds,
          milestones: MILESTONES,
          deletableChannels: DELETABLE_CHANNELS,
          totalCandidates: candidates.length,
          candidateDeliveryIds: candidates.map((c) => c.deliveryId),
          candidates,
          guardViolations: violations,
          outOfScopeBurned: notYetDueBurned.length,
          baseline: {
            notificationCount: await prisma.notification.count(),
            obligationCount: await prisma.obligation.count(),
            notificationDeliveryCount: await prisma.notificationDelivery.count(),
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
    console.error(`  ✗ ${violations} ta chegara buzildi — TO'XTATILDI.`);
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log("  ✓ Chegara tekshiruvlari o'tdi.");
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
