// =====================================================
// MAJBURIYATLAR — KUNLIK YIG'MA (in-app)
// =====================================================
//
// NEGA BU MODUL BOR. `obligationSweep` bungacha har majburiyat uchun alohida
// xabar yaratardi va xabar soni ochiq qatorlar soniga proporsional edi: 6 255
// majburiyat ustidagi bitta yurish 44 846 ta bildirishnoma bergan, ularning
// 100% i o'qilmagan. Ish soni o'zgarmadi — faqat u haqidagi xabarlar soni
// o'nlab ming marta ko'p edi.
//
// Endi sweep faqat DAFTAR yuritadi (bosqichlarni qayd etadi), bu modul esa
// kuniga bir marta har mas'ulga BITTA yig'ma yozadi: nechta bugun, nechta
// kechikkan, eng shoshilinch beshtasi nomma-nom, qolgani havola ortida.
//
// FAQAT ILOVA ICHIDA. Telegram kanali — mavjud ertalabki digest
// (lib/engines/automation/dailyDigest.ts), unga shu raqamlar qo'shildi. Aks
// holda bir odam ertalab ikkita xabar olardi va biz muammoni yarmiga
// kamaytirib, ikkinchi yarmini qaytadan yaratgan bo'lardik.
//
// Digest esa faqat Telegrami ULANGAN xodimlarga boradi; shuning uchun in-app
// yig'ma bog'lanmagan xodimlar uchun yagona kanal bo'lib qoladi.
import { Prisma } from "@prisma/client";
import { OPEN_OBLIGATION_STATUSES } from "@/lib/engines/workflow/obligationWorkflow";
import { formatUzDate } from "@/lib/platform/format";
import { logServerError } from "@/lib/platform/logger";
import { ESCALATION_CHANNEL, LEVEL_LABEL } from "@/lib/engines/automation/escalation";
import { isUniqueViolation } from "@/lib/engines/automation/deliveryLedger";

type Db = Prisma.TransactionClient;

const DAY = 86_400_000;
const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** Yig'mada nomma-nom ko'rsatiladigan majburiyatlar soni. */
const ROLLUP_ITEM_LIMIT = 5;

export const ROLLUP_TYPE = "obligation_rollup";

export function rollupDedupeKey(userId: string, now: Date): string {
  return `obligation-rollup:${userId}:${now.toISOString().slice(0, 10)}`;
}

export interface RollupItem {
  companyName: string;
  what: string;
  dueAt: Date;
  overdue: boolean;
}

export interface ObligationRollup {
  userId: string;
  /** Muddati bugun tugaydigan o'z majburiyatlarim. */
  dueToday: number;
  /** Muddati o'tgan o'z majburiyatlarim. */
  overdue: number;
  /**
   * Shulardan muddati OXIRGI SUTKADA o'tganlari.
   *
   * `firstOverdueAt` bo'yicha emas, `dueAt` bo'yicha sanaladi. Sabab jonli
   * ma'lumotda ko'rindi: `firstOverdueAt` sweep QACHON SEZGANINI yozadi, va
   * bazani to'ldirgandan keyingi birinchi yurish minglab qatorni bir vaqtda
   * belgilaydi — natijada "138 ta kechikkan, yangi 138" degan ma'nosiz xabar
   * chiqardi. `dueAt` esa manbadagi haqiqat va sweep jadvaliga bog'liq emas.
   */
  newlyOverdue: number;
  items: RollupItem[];
  /** `items` dan tashqarida qolganlar. */
  more: number;
  /** Nazoratchi sifatida menga ko'tarilgan bosqichlar (L1). */
  escalatedL1: number;
  /** L2 qabul qiluvchi sifatida menga ko'tarilgan bosqichlar. */
  escalatedL2: number;
}

const emptyRollup = (userId: string): ObligationRollup => ({
  userId,
  dueToday: 0,
  overdue: 0,
  newlyOverdue: 0,
  items: [],
  more: 0,
  escalatedL1: 0,
  escalatedL2: 0,
});

/**
 * Mas'ul xodim kesimida: bugun tugaydigan va muddati o'tgan ochiq
 * majburiyatlar. Bitta so'rov — mas'ul boshiga so'rov qilish bu yerda ham
 * N+1 bo'lardi.
 */
export async function buildObligationRollups(
  db: Db,
  now = new Date(),
): Promise<Map<string, ObligationRollup>> {
  const today = startOfUtcDay(now);
  const tomorrow = new Date(today.getTime() + DAY);
  /** Kecha muddati tugaganlar — "kechadan beri nima o'zgardi" chizig'i. */
  const yesterday = new Date(today.getTime() - DAY);

  const rows = await db.obligation.findMany({
    where: {
      status: { in: OPEN_OBLIGATION_STATUSES },
      dueAt: { lt: tomorrow },
      responsibleUserId: { not: null },
    },
    select: {
      responsibleUserId: true,
      dueAt: true,
      company: { select: { name: true } },
      template: { select: { name: true } },
    },
    orderBy: { dueAt: "asc" },
  });

  const out = new Map<string, ObligationRollup>();
  for (const o of rows) {
    const userId = o.responsibleUserId;
    if (!userId) continue;
    const r = out.get(userId) ?? emptyRollup(userId);
    const overdue = o.dueAt < today;
    if (overdue) {
      r.overdue++;
      if (o.dueAt >= yesterday) r.newlyOverdue++;
    } else {
      r.dueToday++;
    }
    // `orderBy: dueAt asc` — birinchi kelganlar eng shoshilinchlari.
    if (r.items.length < ROLLUP_ITEM_LIMIT) {
      r.items.push({
        companyName: o.company.name,
        what: o.template?.name ?? "Majburiyat",
        dueAt: o.dueAt,
        overdue,
      });
    } else {
      r.more++;
    }
    out.set(userId, r);
  }
  return out;
}

/**
 * Oxirgi sutkada zanjir bo'ylab MENGA ko'tarilgan bosqichlar.
 *
 * Manba — `escalate` yozgan daftar qatorlari. Oyna 24 soat, chunki yig'ma
 * kuniga bir marta yuriladi: kunduzi soat 14:00 da bo'lgan eskalatsiya
 * ertasi ertalabki yig'maga tushishi kerak, "bugungi qatorlar" filtri esa uni
 * o'tkazib yuborardi. Yig'ma kechikib ikki marta yurilsa bir xil raqamni
 * ko'rsatishi mumkin, lekin IKKINCHI XABAR chiqmaydi — `Notification.dedupeKey`
 * bir odamga kuniga bittaga ruxsat beradi.
 */
export async function buildEscalationRollups(
  db: Db,
  now = new Date(),
): Promise<Map<string, { l1: number; l2: number }>> {
  const since = new Date(now.getTime() - DAY);
  const rows = await db.notificationDelivery.findMany({
    where: {
      channel: ESCALATION_CHANNEL,
      createdAt: { gte: since },
      recipientId: { not: null },
      dedupKey: { startsWith: "obligation:" },
    },
    select: { recipientId: true, dedupKey: true },
  });

  const out = new Map<string, { l1: number; l2: number }>();
  for (const r of rows) {
    if (!r.recipientId || !r.dedupKey) continue;
    const entry = out.get(r.recipientId) ?? { l1: 0, l2: 0 };
    if (r.dedupKey.endsWith(":esc:L1")) entry.l1++;
    else if (r.dedupKey.endsWith(":esc:L2")) entry.l2++;
    else continue;
    out.set(r.recipientId, entry);
  }
  return out;
}

/** Yig'ma matni. Hamma narsani matnga tiqmaymiz — davomi havola ortida. */
export function renderRollup(r: ObligationRollup): { title: string; message: string } {
  const title =
    r.overdue > 0
      ? `Majburiyatlar: ${r.overdue} ta kechikkan`
      : r.dueToday > 0
        ? `Majburiyatlar: bugun ${r.dueToday} ta`
        : "Majburiyatlar — nazorat";

  const lines: string[] = [];
  const head: string[] = [];
  if (r.dueToday > 0) head.push(`bugun ${r.dueToday} ta`);
  if (r.overdue > 0) {
    head.push(r.newlyOverdue > 0 ? `kechikkan ${r.overdue} ta (yangi ${r.newlyOverdue})` : `kechikkan ${r.overdue} ta`);
  }
  if (head.length) lines.push(head.join(" · "));

  for (const it of r.items) {
    lines.push(`${it.overdue ? "🔴" : "•"} ${it.what} — ${it.companyName} (${formatUzDate(it.dueAt)})`);
  }
  if (r.more > 0) lines.push(`…va yana ${r.more} ta`);

  if (r.escalatedL1 > 0 || r.escalatedL2 > 0) {
    const parts: string[] = [];
    // Yorliq `escalation.ts` dan — rol nomi bu yerda ikkinchi marta yozilmasin.
    if (r.escalatedL1 > 0) parts.push(`${LEVEL_LABEL[1].toLowerCase()} sifatida ${r.escalatedL1} ta`);
    if (r.escalatedL2 > 0) parts.push(`${LEVEL_LABEL[2].toLowerCase()} sifatida ${r.escalatedL2} ta`);
    lines.push(`Sizga ko'tarildi: ${parts.join(", ")}.`);
  }

  return { title, message: lines.join("\n") };
}

export interface RollupRunResult {
  recipients: number;
  created: number;
  /** Bugun allaqachon yozilgan (yoki parallel yurish yozib ulgurgan). */
  skippedAlready: number;
  failed: number;
}

/**
 * Kunlik yig'mani yozadi — qabul qiluvchi boshiga BITTA `Notification`.
 *
 * Idempotentlik `Notification.dedupeKey` unikal indeksida (@@unique([userId,
 * dedupeKey])), ya'ni DB darajasida: parallel ikkita yurish ham ikkinchi
 * qatorni yoza olmaydi. `findFirst` + `create` naqshi bunday kafolat bermasdi.
 */
export async function runObligationRollup(
  db: Db,
  deps: { now?: Date } = {},
): Promise<RollupRunResult> {
  const now = deps.now ?? new Date();
  const [byResponsible, byEscalation] = await Promise.all([
    buildObligationRollups(db, now),
    buildEscalationRollups(db, now),
  ]);

  for (const [userId, esc] of byEscalation) {
    const r = byResponsible.get(userId) ?? emptyRollup(userId);
    r.escalatedL1 = esc.l1;
    r.escalatedL2 = esc.l2;
    byResponsible.set(userId, r);
  }

  const res: RollupRunResult = { recipients: 0, created: 0, skippedAlready: 0, failed: 0 };
  if (byResponsible.size === 0) return res;

  // Nofaol xodimga xabar yozishning ma'nosi yo'q — u tizimga kira olmaydi.
  const active = await db.user.findMany({
    where: { id: { in: [...byResponsible.keys()] }, isActive: true },
    select: { id: true },
  });

  for (const { id: userId } of active) {
    const r = byResponsible.get(userId);
    // Bo'sh yig'ma ATAYIN yuborilmaydi: har kuni "ish yo'q" degan xabar bir
    // haftada e'tiborsiz qoldiriladigan shovqinga aylanadi.
    if (!r || (r.dueToday === 0 && r.overdue === 0 && r.escalatedL1 === 0 && r.escalatedL2 === 0)) {
      continue;
    }
    res.recipients++;

    const { title, message } = renderRollup(r);
    try {
      await db.notification.create({
        data: {
          userId,
          type: ROLLUP_TYPE,
          title,
          message,
          link: r.overdue > 0 || r.escalatedL1 > 0 || r.escalatedL2 > 0 ? "/deadlines?tab=overdue" : "/deadlines?tab=mine",
          // Kechikkan ish yoki menga ko'tarilgan bosqich — kutib turmaydi.
          priority: r.overdue > 0 || r.escalatedL1 > 0 || r.escalatedL2 > 0 ? "high" : "normal",
          dedupeKey: rollupDedupeKey(userId, now),
        },
      });
      res.created++;
    } catch (e) {
      if (isUniqueViolation(e)) {
        res.skippedAlready++;
        continue;
      }
      logServerError("obligationRollup.create", e, { userId });
      res.failed++;
    }
  }

  return res;
}
