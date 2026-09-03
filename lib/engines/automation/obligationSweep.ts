// =====================================================
// OBLIGATION DEADLINE SWEEP — framework-free (Faza A / compliance engine)
// =====================================================
// Ochiq majburiyatlarni skanerlaydi: (1) muddati o'tganini birinchi marta
// belgilaydi (firstOverdueAt), (2) eslatma bosqichlarini (D-5/D-3/D-1/due/
// overdue) IDEMPOTENT QAYD ETADI. Idempotency — NotificationDelivery dedupKey
// (@@unique([channel, dedupKey])) → sweep necha marta ishlasa ham bir bosqich
// bir marta qayd etiladi. Reviewer #9.
//
// SWEEP ENDI XABAR YUBORMAYDI — U DAFTAR YURITADI.
//
// Bungacha har majburiyat uchun mas'ulga in-app eslatma + Telegram DM, muddat
// kuni nazoratchiga, ertasiga bosh buxgalterga xabar ketardi. Natijasi lokal
// bazada o'lchandi: 6 255 ochiq majburiyat ustidagi BITTA soatlik yurish
// 2026-08-06 20:00 da 44 846 ta bildirishnoma yaratgan; bitta L2 qabul
// qiluvchi 6 389 tasini olgan; `obligation_reminder` (47 008) va
// `escalation_obligation` (18 671) qatorlarining 100% i o'qilmagan.
//
// Sabab arxitekturaviy: xabar soni DIQQAT TALAB QILADIGAN ISH soniga emas,
// BAZADAGI QATOR soniga proporsional edi. 300 majburiyatli mas'ul 300 ta
// xabar olardi. Bunday oqimni hech kim o'qimaydi — va u bilan birga haqiqiy
// xabarlar ham o'qilmay qoladi.
//
// Endi bosqichlar avvalgidek qayd etiladi (zanjir, KPI va audit tarixi
// buzilmaydi), ko'rinadigan xabarni esa kuniga bir marta
// `lib/engines/automation/obligationRollup.ts` yig'ib beradi.
//
// Faza 2 (ADR-0007): eslatma MIJOZ GURUHIGA HECH QACHON bormaydi — mijoz
// bizning ichki kechikishlarimizni ko'rmasligi kerak.
import { Prisma } from "@prisma/client";
import { OPEN_OBLIGATION_STATUSES } from "@/lib/engines/workflow/obligationWorkflow";
import { claim, claimedKeys } from "@/lib/engines/automation/deliveryLedger";
import {
  escalate,
  escalationDedupKey,
  ESCALATION_CHANNEL,
  type EscalationLevel,
  type EscalationSender,
} from "@/lib/engines/automation/escalation";

type Db = Prisma.TransactionClient;

const DAY = 86_400_000;
const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** accepted/cancelled — yakunlangan, eslatma yubormaymiz. */
const OPEN_STATUSES = OPEN_OBLIGATION_STATUSES;

/** Bosqich daftarining kanali. Nomi tarixiy — qatorlar allaqachon shu kanalda. */
const REMINDER_CHANNEL = "inapp";

interface Milestone {
  key: string;
  level: string; // yellow|orange|red
}

/** `daysUntil` ga qarab yetib kelgan barcha bosqichlar (<=, downtime'ga chidamli). */
function milestonesFor(daysUntil: number): Milestone[] {
  const out: Milestone[] = [];
  if (daysUntil <= 5) out.push({ key: "D-5", level: "yellow" });
  if (daysUntil <= 3) out.push({ key: "D-3", level: "yellow" });
  if (daysUntil <= 1) out.push({ key: "D-1", level: "orange" });
  if (daysUntil <= 0) out.push({ key: "due", level: "orange" });
  if (daysUntil < 0) out.push({ key: "overdue:L1", level: "red" });
  return out;
}

/**
 * Qaysi bosqich zanjirni ko'taradi. D-5/D-3/D-1 — faqat qayd; muddat kuni
 * nazoratchi, ertasiga bosh buxgalter zanjirga kiritiladi.
 */
function escalationLevelFor(key: string): EscalationLevel | null {
  if (key === "due") return 1;
  if (key === "overdue:L1") return 2;
  return null;
}

export interface SweepResult {
  scanned: number;
  markedOverdue: number;
  /** Shu yurishda birinchi marta qayd etilgan bosqichlar. */
  remindersCreated: number;
  /** Allaqachon qayd etilgani uchun o'tkazib yuborilgan bosqichlar. */
  remindersDeduped: number;
  /** Zanjir bo'ylab ko'tarilgan bosqichlar soni (L1 + L2). */
  escalated: number;
}

export async function sweepDeadlines(
  db: Db,
  opts: {
    now?: Date;
    /**
     * Zanjir uchun Telegram yuboruvchi. MAJBURIYAT eskalatsiyalari uni
     * ishlatmaydi (`deliverNow: false`) — parametr shakl birligi uchun
     * saqlanadi va savol eskalatsiyasi bilan bir xil imzoni beradi.
     */
    sendEscalation?: EscalationSender;
  } = {},
): Promise<SweepResult> {
  const now = opts.now ?? new Date();
  const today = startOfUtcDay(now);

  const open = await db.obligation.findMany({
    where: { status: { in: OPEN_STATUSES } },
    select: {
      id: true,
      dueAt: true,
      responsibleUserId: true,
      firstOverdueAt: true,
      periodKey: true,
      companyId: true,
      company: { select: { name: true } },
      template: { select: { name: true } },
    },
  });

  const res: SweepResult = {
    scanned: open.length,
    markedOverdue: 0,
    remindersCreated: 0,
    remindersDeduped: 0,
    escalated: 0,
  };
  if (open.length === 0) return res;

  const daysUntilOf = (dueAt: Date): number =>
    Math.floor((startOfUtcDay(dueAt).getTime() - today.getTime()) / DAY);

  // ── Allaqachon band bo'lgan kalitlarni IKKI so'rovda oldindan yuklaymiz ──
  //
  // Bungacha har majburiyat × har bosqich uchun ikkita `findUnique` ketardi:
  // 6 255 majburiyat × 5 bosqich × 2 = 60 000 dan ortiq so'rov, soatiga bir
  // marta. Endi ikkita `IN` so'rovi — bosqich daftari va zanjir daftari.
  const milestoneKeys: string[] = [];
  const escalationKeys: string[] = [];
  for (const o of open) {
    const daysUntil = daysUntilOf(o.dueAt);
    for (const m of milestonesFor(daysUntil)) {
      milestoneKeys.push(`obligation:${o.id}:reminder:${m.key}`);
      const level = escalationLevelFor(m.key);
      if (level != null) escalationKeys.push(escalationDedupKey("obligation", o.id, level));
    }
  }
  const claimedMilestones = await claimedKeys(db, REMINDER_CHANNEL, milestoneKeys);
  const alreadyEscalated = await claimedKeys(db, ESCALATION_CHANNEL, escalationKeys);

  for (const o of open) {
    const daysUntil = daysUntilOf(o.dueAt);

    if (daysUntil < 0 && o.firstOverdueAt == null) {
      await db.obligation.update({ where: { id: o.id }, data: { firstOverdueAt: now } });
      res.markedOverdue++;
    }

    // `milestonesFor` yetib kelgan BARCHA bosqichlarni qaytaradi (D-5, D-3,
    // D-1, due, overdue) — bu ataylab: sweep bir kun ishlamay qolsa, keyingi
    // yurishda o'tkazib yuborilgan bosqichlar ham daftarga tushadi va
    // eskalatsiya zanjiri uzilmaydi. Xabar chiqmagani uchun bu endi
    // foydalanuvchiga ko'rinmaydi — daftar ichki hisob.
    for (const m of milestonesFor(daysUntil)) {
      const dedupKey = `obligation:${o.id}:reminder:${m.key}`;
      if (claimedMilestones.has(dedupKey)) {
        res.remindersDeduped++;
      } else {
        // Faqat daftar tokeni — bu qator ortida hech qanday jo'natish yo'q,
        // shuning uchun `claimed` (soxta `sent` emas).
        const id = await claim(db, {
          channel: REMINDER_CHANNEL,
          dedupKey,
          level: m.level,
          recipientId: o.responsibleUserId,
          mode: "token",
        });
        if (id == null) res.remindersDeduped++;
        else res.remindersCreated++;
      }

      // Zanjir: muddat kuni nazoratchi, ertasiga bosh buxgalter. `deliverNow:
      // false` — bosqich QAYD etiladi, xabarni kunlik yig'ma chiqaradi.
      const level = escalationLevelFor(m.key);
      if (level != null && !alreadyEscalated.has(escalationDedupKey("obligation", o.id, level))) {
        const what = o.template?.name ?? "Majburiyat";
        const escalated = await escalate(
          db,
          {
            kind: "obligation",
            entityId: o.id,
            companyId: o.companyId,
            companyName: o.company.name,
            responsibleUserId: o.responsibleUserId,
            responsibleName: null,
            detail:
              `${what} (${o.periodKey}) — muddat ${o.dueAt.toISOString().slice(0, 10)}` +
              (m.key === "due" ? ", bugun oxirgi kun." : ", muddat o'tdi."),
            link: `/deadlines?tab=overdue`,
          },
          level,
          { sendEscalation: opts.sendEscalation, now, deliverNow: false },
        );
        if (escalated.claimed) res.escalated++;
      }
    }
  }

  return res;
}
