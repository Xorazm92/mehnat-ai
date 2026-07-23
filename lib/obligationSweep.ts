// =====================================================
// OBLIGATION DEADLINE SWEEP — framework-free (Faza A / compliance engine)
// =====================================================
// Ochiq majburiyatlarni skanerlaydi: (1) muddati o'tganini birinchi marta
// belgilaydi (firstOverdueAt), (2) eslatma bosqichlarini (D-5/D-3/D-1/due/
// overdue) IDEMPOTENT yaratadi. Idempotency — NotificationDelivery dedupKey
// (@@unique([channel, dedupKey])) → sweep necha marta ishlasa ham bir bosqich
// bir marta yuboriladi. Reviewer #9.
import { Prisma, type ObligationStatus } from "@prisma/client";
import { logServerError } from "@/lib/logger";

type Db = Prisma.TransactionClient;

const DAY = 86_400_000;
const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** accepted/cancelled — yakunlangan, eslatma yubormaymiz. */
const OPEN_STATUSES: ObligationStatus[] = ["planned", "in_progress", "ready", "sent", "rejected"];

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

export interface SweepResult {
  scanned: number;
  markedOverdue: number;
  remindersCreated: number;
  remindersDeduped: number;
  telegramSent: number;
  telegramDeduped: number;
}

/** Telegram yuboruvchi — bot qatlamidan injeksiya qilinadi (sweep framework-free). */
export type TelegramSender = (chatId: bigint, text: string) => Promise<void>;

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export async function sweepDeadlines(
  db: Db,
  opts: { now?: Date; notifyTelegram?: TelegramSender } = {},
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
    },
  });

  // Telegram push yoqilgan bo'lsa — firma → chat(lar) mappingini oldindan yuklaymiz.
  const chatMap = new Map<string, bigint[]>();
  if (opts.notifyTelegram && open.length) {
    const companyIds = [...new Set(open.map((o) => o.companyId))];
    const groups = await db.telegramGroup.findMany({
      where: { companyId: { in: companyIds } },
      select: { companyId: true, chatId: true },
    });
    for (const g of groups) {
      if (g.companyId == null) continue;
      const arr = chatMap.get(g.companyId) ?? [];
      arr.push(g.chatId);
      chatMap.set(g.companyId, arr);
    }
  }

  const res: SweepResult = {
    scanned: open.length,
    markedOverdue: 0,
    remindersCreated: 0,
    remindersDeduped: 0,
    telegramSent: 0,
    telegramDeduped: 0,
  };

  for (const o of open) {
    const daysUntil = Math.floor((startOfUtcDay(o.dueAt).getTime() - today.getTime()) / DAY);

    if (daysUntil < 0 && o.firstOverdueAt == null) {
      await db.obligation.update({ where: { id: o.id }, data: { firstOverdueAt: now } });
      res.markedOverdue++;
    }

    for (const m of milestonesFor(daysUntil)) {
      const dedupKey = `obligation:${o.id}:reminder:${m.key}`;
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

      // 2) Telegram kanal — alohida dedup (channel="telegram"), firma guruhiga.
      if (opts.notifyTelegram) {
        try {
          await db.notificationDelivery.create({
            data: { channel: "telegram", level: m.level, dedupKey, recipientId: o.responsibleUserId, status: "sent", sentAt: now },
          });
          const chats = chatMap.get(o.companyId) ?? [];
          const text = `⏰ ${reminderTitle(m.key)}\n${o.company.name} — ${o.periodKey}\nMuddat: ${o.dueAt.toISOString().slice(0, 10)}`;
          for (const chatId of chats) {
            try {
              await opts.notifyTelegram(chatId, text);
            } catch (err) {
              logServerError("obligationSweep.telegram", err, { chatId: String(chatId) });
            }
          }
          res.telegramSent++;
        } catch (e) {
          if (isUniqueViolation(e)) res.telegramDeduped++;
          else throw e;
        }
      }
    }
  }

  return res;
}
