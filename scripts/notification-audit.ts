/**
 * BILDIRISHNOMA AUDITI — faqat o'qish, hech narsa yozmaydi.
 *
 *   npx tsx scripts/notification-audit.ts
 *   npx tsx scripts/notification-audit.ts --simulate-sweep
 *
 * Nima uchun: shovqinning miqdorini taxmin qilib bo'lmaydi, uni O'LCHASH
 * kerak. Bu skript "qaysi tur, qancha, qanchasi o'qilgan, bir odamga kuniga
 * nechta" savollariga javob beradi va tozalashdan OLDIN tasnif chiqaradi.
 *
 * `--simulate-sweep` — muddat sweepini YOZMASDAN yuritadi va eski kod nechta
 * ko'rinadigan xabar chiqarardi / yangi kod nechta chiqaradi degan raqamni
 * yonma-yon qo'yadi. Bazaga tegmaydi.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";
import { OPEN_OBLIGATION_STATUSES } from "@/lib/engines/workflow/obligationWorkflow";

const DAY = 86_400_000;
const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const pct = (n: number, total: number) => (total === 0 ? "0.0" : ((100 * n) / total).toFixed(1));

async function byType(): Promise<void> {
  const rows = await prisma.notification.groupBy({
    by: ["type"],
    _count: { _all: true },
    orderBy: { _count: { id: "desc" } },
  });
  const total = rows.reduce((s, r) => s + r._count._all, 0);

  console.log(`\n=== TUR BO'YICHA (jami ${total}) ===`);
  console.log("tur".padEnd(28), "soni".padStart(8), "ulush".padStart(7), "o'qilmagan".padStart(11));
  for (const r of rows) {
    const unread = await prisma.notification.count({
      where: { type: r.type, isRead: false },
    });
    console.log(
      r.type.padEnd(28),
      String(r._count._all).padStart(8),
      `${pct(r._count._all, total)}%`.padStart(7),
      `${pct(unread, r._count._all)}%`.padStart(11),
    );
  }
}

async function byDay(): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ d: Date; n: bigint; u: bigint }>>`
    SELECT date_trunc('day', "createdAt")::date AS d,
           count(*) AS n,
           count(DISTINCT "userId") AS u
      FROM "Notification"
     GROUP BY 1
     ORDER BY 1 DESC
     LIMIT 14
  `;
  console.log(`\n=== KUNIGA (oxirgi 14 kun) ===`);
  console.log("kun".padEnd(12), "xabar".padStart(8), "odam".padStart(6), "odam boshiga".padStart(13));
  for (const r of rows) {
    const n = Number(r.n);
    const u = Number(r.u);
    console.log(
      r.d.toISOString().slice(0, 10).padEnd(12),
      String(n).padStart(8),
      String(u).padStart(6),
      (u === 0 ? "0" : (n / u).toFixed(1)).padStart(13),
    );
  }
}

async function worstRecipients(): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ full_name: string; n: bigint; unread: bigint }>>`
    SELECT u."fullName" AS full_name,
           count(*) AS n,
           count(*) FILTER (WHERE NOT n."isRead") AS unread
      FROM "Notification" n
      JOIN "User" u ON u.id = n."userId"
     GROUP BY 1
     ORDER BY 2 DESC
     LIMIT 10
  `;
  console.log(`\n=== ENG KO'P XABAR OLGANLAR ===`);
  for (const r of rows) {
    console.log(
      r.full_name.padEnd(30),
      String(Number(r.n)).padStart(8),
      `${pct(Number(r.unread), Number(r.n))}% o'qilmagan`,
    );
  }
}

async function deliveryLedger(): Promise<void> {
  const rows = await prisma.notificationDelivery.groupBy({
    by: ["channel", "status"],
    _count: { _all: true },
    orderBy: [{ channel: "asc" }, { status: "asc" }],
  });
  console.log(`\n=== YETKAZISH DAFTARI (kanal / status) ===`);
  for (const r of rows) {
    console.log(r.channel.padEnd(20), r.status.padEnd(14), String(r._count._all).padStart(8));
  }
}

/** Tozalashga NOMZOD qatorlar — o'chirilmaydi, faqat sanaladi. */
async function cleanupCandidates(): Promise<void> {
  const now = Date.now();
  const cutoff = new Date(now - 30 * DAY);
  const noisy = ["obligation_reminder", "escalation_obligation"];

  const total = await prisma.notification.count();
  const candidates = await prisma.notification.count({
    where: { type: { in: noisy }, isRead: false, createdAt: { lt: cutoff } },
  });
  const readOld = await prisma.notification.count({
    where: { isRead: true, createdAt: { lt: new Date(now - 90 * DAY) } },
  });

  console.log(`\n=== TOZALASH NOMZODLARI ===`);
  console.log(`jami                                 ${total}`);
  console.log(`eski shovqin (30 kun+, o'qilmagan)   ${candidates}  (${pct(candidates, total)}%)`);
  console.log(`o'qilgan va 90 kundan eski           ${readOld}`);
  console.log(`\n→ o'chirish: npx tsx scripts/cleanup-notifications.ts --apply`);
}

/**
 * Sweep NECHTA ko'rinadigan xabar chiqarardi — yozmasdan sanaymiz.
 *
 * ESKI kod: har majburiyat uchun eng og'ir bosqichga bitta in-app + yetib
 * kelgan HAR bosqich uchun bitta Telegram DM + `due`/`overdue` da zanjirning
 * har bosqichi uchun bitta in-app va bitta DM.
 * YANGI kod: bitta ham emas — o'rniga kuniga bir odamga bitta yig'ma.
 */
async function simulateSweep(): Promise<void> {
  const now = new Date();
  const today = startOfUtcDay(now);
  const open = await prisma.obligation.findMany({
    where: { status: { in: OPEN_OBLIGATION_STATUSES } },
    select: { id: true, dueAt: true, responsibleUserId: true, companyId: true },
  });

  let oldInApp = 0;
  let oldTelegram = 0;
  let oldEscalation = 0;
  const companies = await prisma.company.findMany({
    select: { id: true, supervisorId: true, chiefAccountantId: true },
  });
  const chain = new Map(companies.map((c) => [c.id, c]));
  const responsible = new Set<string>();

  for (const o of open) {
    const daysUntil = Math.floor((startOfUtcDay(o.dueAt).getTime() - today.getTime()) / DAY);
    const reached: string[] = [];
    if (daysUntil <= 5) reached.push("D-5");
    if (daysUntil <= 3) reached.push("D-3");
    if (daysUntil <= 1) reached.push("D-1");
    if (daysUntil <= 0) reached.push("due");
    if (daysUntil < 0) reached.push("overdue:L1");
    if (reached.length === 0) continue;

    if (o.responsibleUserId) {
      responsible.add(o.responsibleUserId);
      oldInApp += 1; // eng og'ir bosqich uchun bitta
      oldTelegram += reached.length; // HAR bosqich uchun bitta (isLoudest filtri yo'q edi)
    }
    const c = chain.get(o.companyId);
    if (reached.includes("due") && c?.supervisorId) oldEscalation += 1;
    if (reached.includes("overdue:L1") && c?.chiefAccountantId) oldEscalation += 1;
  }

  // Yangi kod: yig'ma oladigan odamlar soni (kuniga bittadan).
  const newMessages = responsible.size;

  console.log(`\n=== SWEEP SIMULYATSIYASI (yozilmadi) ===`);
  console.log(`ochiq majburiyat                     ${open.length}`);
  console.log(`mas'ul xodimlar                      ${responsible.size}`);
  console.log(`\nESKI kod, BITTA yurishda:`);
  console.log(`  in-app eslatma                     ${oldInApp}`);
  console.log(`  Telegram DM                        ${oldTelegram}`);
  console.log(`  eskalatsiya (in-app + DM)          ${oldEscalation * 2}`);
  console.log(`  JAMI ko'rinadigan xabar            ${oldInApp + oldTelegram + oldEscalation * 2}`);
  console.log(`  (sweep SOATIGA bir marta yuradi)`);
  console.log(`\nYANGI kod, BIR KUNDA:`);
  console.log(`  in-app yig'ma                      ${newMessages}`);
  console.log(`  Telegram (mavjud digestga qo'shildi) 0 qo'shimcha`);
  console.log(`  JAMI ko'rinadigan xabar            ${newMessages}`);
}

async function main(): Promise<void> {
  await byType();
  await byDay();
  await worstRecipients();
  await deliveryLedger();
  await cleanupCandidates();
  if (process.argv.includes("--simulate-sweep")) await simulateSweep();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
