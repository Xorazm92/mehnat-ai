// =====================================================
// OBLIGATION DEADLINE SWEEP — framework-free (Faza A / compliance engine)
// =====================================================
// Ochiq majburiyatlarni skanerlaydi: (1) muddati o'tganini birinchi marta
// belgilaydi (firstOverdueAt), (2) eslatma bosqichlarini (D-5/D-3/D-1/due/
// overdue) IDEMPOTENT yaratadi. Idempotency — NotificationDelivery dedupKey
// (@@unique([channel, dedupKey])) → sweep necha marta ishlasa ham bir bosqich
// bir marta yuboriladi. Reviewer #9.
//
// Faza 2 (ADR-0007): eslatma MIJOZ GURUHIGA EMAS, mas'ul xodimning SHAXSIY
// chatiga boradi — mijoz bizning ichki kechikishlarimizni ko'rmasligi kerak.
// `due` va `overdue` bosqichlari qo'shimcha ravishda eskalatsiya zanjirini
// ishga tushiradi (L1 nazoratchi → L2 bosh buxgalter).
import { Prisma } from "@prisma/client";
import { logServerError } from "@/lib/logger";
import { OPEN_OBLIGATION_STATUSES } from "@/lib/obligationWorkflow";
import {
  escalate,
  escalationDedupKey,
  ESCALATION_CHANNEL,
  type EscalationLevel,
  type EscalationSender,
} from "@/lib/escalation";

type Db = Prisma.TransactionClient;

const DAY = 86_400_000;
const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** accepted/cancelled — yakunlangan, eslatma yubormaymiz. */
const OPEN_STATUSES = OPEN_OBLIGATION_STATUSES;

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

function reminderTitle(key: string): string {
  if (key === "overdue:L1") return "Majburiyat muddati o'tdi";
  if (key === "due") return "Majburiyat muddati bugun";
  return `Majburiyat muddati yaqin (${key})`;
}

/**
 * Qaysi bosqich zanjirni ko'taradi. D-5/D-3/D-1 — faqat mas'ulga eslatma;
 * muddat kuni nazoratchi, ertasiga bosh buxgalter xabardor qilinadi.
 */
function escalationLevelFor(key: string): EscalationLevel | null {
  if (key === "due") return 1;
  if (key === "overdue:L1") return 2;
  return null;
}

export interface SweepResult {
  scanned: number;
  markedOverdue: number;
  remindersCreated: number;
  remindersDeduped: number;
  telegramSent: number;
  telegramDeduped: number;
  /** Zanjir bo'ylab ko'tarilgan bosqichlar soni (L1 + L2). */
  escalated: number;
  /** Telegramda topilmagan mas'ullar (xodim botga /start bosmagan). */
  noTelegram: number;
}

/** Telegram yuboruvchi — bot qatlamidan injeksiya qilinadi (sweep framework-free). */
export type TelegramSender = (chatId: bigint, text: string) => Promise<void>;

function isUniqueViolation(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return true;
  if (typeof e === "object" && e !== null) {
    const err = e as { code?: string; message?: string };
    if (err.code === "P2002") return true;
    if (typeof err.message === "string" && err.message.includes("Unique constraint failed")) return true;
  }
  return false;
}

export async function sweepDeadlines(
  db: Db,
  opts: {
    now?: Date;
    /** Mas'ul xodimning shaxsiy chatiga eslatma yuboradi. */
    notifyTelegram?: TelegramSender;
    /** `due`/`overdue` bosqichlarida zanjirni ko'taradi (bot qatlami render qiladi). */
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

  // Telegram push yoqilgan bo'lsa — mas'ul xodim → SHAXSIY chat mappingi.
  // (Shaxsiy chatda chat_id = Telegram foydalanuvchi id'si.) Mijoz guruhi
  // ataylab ishlatilmaydi — ADR-0007.
  const dmMap = new Map<string, bigint>();
  if (opts.notifyTelegram && open.length) {
    const userIds = [...new Set(open.map((o) => o.responsibleUserId).filter((id): id is string => !!id))];
    if (userIds.length) {
      const users = await db.user.findMany({
        where: { id: { in: userIds }, isActive: true, telegramUserId: { not: null } },
        select: { id: true, telegramUserId: true },
      });
      for (const u of users) {
        if (u.telegramUserId != null) dmMap.set(u.id, u.telegramUserId);
      }
    }
  }

  // Allaqachon eskalatsiya qilingan bosqichlarni BITTA so'rovda oldindan
  // yuklaymiz. Aks holda muddati o'tgan har bir majburiyat uchun `escalate`
  // chaqirilib, faqat "band" ekanini bilish uchun so'rov qilinardi — soatlik
  // sweep minglab qator ustidan yurishini hisobga olsak, bu sezilarli.
  const dueOrPast = open.filter(
    (o) => Math.floor((startOfUtcDay(o.dueAt).getTime() - today.getTime()) / DAY) <= 0,
  );
  const alreadyEscalated = new Set<string>();
  if (dueOrPast.length) {
    const keys = dueOrPast.flatMap((o) => [
      escalationDedupKey("obligation", o.id, 1),
      escalationDedupKey("obligation", o.id, 2),
    ]);
    const rows = await db.notificationDelivery.findMany({
      where: { channel: ESCALATION_CHANNEL, dedupKey: { in: keys } },
      select: { dedupKey: true },
    });
    for (const r of rows) if (r.dedupKey) alreadyEscalated.add(r.dedupKey);
  }

  const res: SweepResult = {
    scanned: open.length,
    markedOverdue: 0,
    remindersCreated: 0,
    remindersDeduped: 0,
    telegramSent: 0,
    telegramDeduped: 0,
    escalated: 0,
    noTelegram: 0,
  };

  for (const o of open) {
    const daysUntil = Math.floor((startOfUtcDay(o.dueAt).getTime() - today.getTime()) / DAY);

    if (daysUntil < 0 && o.firstOverdueAt == null) {
      await db.obligation.update({ where: { id: o.id }, data: { firstOverdueAt: now } });
      res.markedOverdue++;
    }

    for (const m of milestonesFor(daysUntil)) {
      const dedupKey = `obligation:${o.id}:reminder:${m.key}`;
      const existingInApp = await db.notificationDelivery.findUnique({
        where: { channel_dedupKey: { channel: "inapp", dedupKey } },
        select: { id: true },
      });
      if (existingInApp) {
        res.remindersDeduped++;
      } else {
        try {
          // Dedup ledger — bu qator bosqichni bir martaga qulflaydi.
          await db.notificationDelivery.create({
            data: {
              channel: "inapp",
              level: m.level,
              dedupKey,
              recipientId: o.responsibleUserId,
              status: "sent",
              sentAt: now,
            },
          });
          res.remindersCreated++;
          // In-app xabar — best-effort (delivery ledger'i vakolatli).
          if (o.responsibleUserId) {
            try {
              await db.notification.create({
                data: {
                  userId: o.responsibleUserId,
                  type: "obligation_reminder",
                  title: reminderTitle(m.key),
                  message: `Majburiyat ${o.periodKey} — muddat ${o.dueAt.toISOString().slice(0, 10)}`,
                  link: `/deadlines?obligation=${o.id}`,
                },
              });
            } catch (err) {
              logServerError("obligationSweep.notification", err, { obligationId: o.id });
            }
          }
        } catch (e) {
          if (isUniqueViolation(e)) res.remindersDeduped++;
          else throw e;
        }
      }

      // 2) Telegram kanal — alohida dedup (channel="telegram"), mas'ulning
      //    SHAXSIY chatiga. Guruhga yozilmaydi (ADR-0007).
      const dmChatId = o.responsibleUserId ? dmMap.get(o.responsibleUserId) : undefined;
      if (opts.notifyTelegram && dmChatId != null) {
        const existingTg = await db.notificationDelivery.findUnique({
          where: { channel_dedupKey: { channel: "telegram", dedupKey } },
          select: { id: true },
        });
        if (existingTg) {
          res.telegramDeduped++;
        } else {
          try {
            await db.notificationDelivery.create({
              data: {
                channel: "telegram",
                level: m.level,
                dedupKey,
                recipientId: o.responsibleUserId,
                targetChatId: dmChatId,
                status: "sent",
                sentAt: now,
              },
            });
            const what = o.template?.name ? `${o.template.name} — ` : "";
            const text =
              `⏰ ${reminderTitle(m.key)}\n${what}${o.company.name} (${o.periodKey})\n` +
              `Muddat: ${o.dueAt.toISOString().slice(0, 10)}`;
            try {
              await opts.notifyTelegram(dmChatId, text);
              res.telegramSent++;
            } catch (err) {
              logServerError("obligationSweep.telegram", err, { chatId: String(dmChatId) });
            }
          } catch (e) {
            if (isUniqueViolation(e)) res.telegramDeduped++;
            else throw e;
          }
        }
      } else if (opts.notifyTelegram && o.responsibleUserId) {
        // Mas'ul bor, lekin bot unga yoza olmaydi — in-app eslatma qoldi.
        res.noTelegram++;
      }

      // 3) Zanjir: muddat kuni nazoratchi, ertasiga bosh buxgalter.
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
            link: `/deadlines?obligation=${o.id}`,
          },
          level,
          { sendEscalation: opts.sendEscalation, now },
        );
        if (escalated.claimed) res.escalated++;
      }
    }
  }

  return res;
}
